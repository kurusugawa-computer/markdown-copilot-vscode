import type { FilePart, ImagePart, ModelMessage, TextPart } from 'ai';
import { AssertionError } from 'assert';
import mime from 'mime-types';
import path from 'path';
import * as vscode from 'vscode';
import YAML from 'yaml';
import { ToolContext, type CopilotOptions, type Messages } from '.';
import { LF, resolveFragmentUri } from '../utils';
import { deepMergeJsons } from '../utils/json';
import * as l10n from '../utils/localization';
import { ToolProvider } from './tools';

export enum ChatRole {
	Function = "function",
	Developer = "developer",
	System = "system",
	User = "user",
	Assistant = "assistant",
	Tool = "tool",
}

export enum ChatRoleFlags {
	None = 0,
	Override = 1 << 0,
	System = 1 << 1,
	User = 1 << 2,
	Assistant = 1 << 3,
	Tool = 1 << 4,
}

const roleRegex = /\*\*(System|User|Copilot)(\(Override\))?:\*\*/;
const matchToChatRoles = new Map<string, ChatRoleFlags>([
	["System", ChatRoleFlags.System],
	["User", ChatRoleFlags.User],
	["Copilot", ChatRoleFlags.Assistant],
]);

function toChatRole(text: string): ChatRoleFlags {
	const match = text.match(roleRegex);
	if (match === null) { return ChatRoleFlags.None; }
	return matchToChatRoles.get(match[1])!
		| (match[2] ? ChatRoleFlags.Override : ChatRoleFlags.None);
}

function toModelChatRole(flags: ChatRoleFlags): ChatRole {
	if (flags & ChatRoleFlags.User) { return ChatRole.User; }
	if (flags & ChatRoleFlags.Assistant) { return ChatRole.Assistant; }
	if (flags & ChatRoleFlags.System) { return ChatRole.System; }
	if (flags & ChatRoleFlags.Tool) { return ChatRole.Tool; }
	throw new AssertionError();
}

function removeChatRole(text: string): string {
	return text.replace(roleRegex, "");
}

export interface IntentOverrides {
	readonly systemPrompt?: string;
	readonly userAppend?: string;
	readonly copilotOptions?: CopilotOptions;
	readonly toolProvider?: ToolProvider;
}

export interface ChatIntent {
	readonly documentUri: vscode.Uri;
	readonly userInput: string;
	readonly contextLines?: string[];
	readonly overrides?: IntentOverrides;
	readonly supportsMultimodal?: boolean;
	readonly abortSignal?: AbortSignal;
}

export class ChatRequest {
	readonly messages: Messages;
	readonly copilotOptions: CopilotOptions;
	readonly toolContext: ToolContext;
	readonly toolProvider: ToolProvider;
	readonly abortSignal?: AbortSignal;

	constructor(
		messages: Messages,
		copilotOptions: CopilotOptions,
		toolContext: ToolContext,
		toolProvider: ToolProvider,
		abortSignal?: AbortSignal,
	) {
		this.messages = messages;
		this.copilotOptions = copilotOptions;
		this.toolContext = toolContext;
		this.toolProvider = toolProvider;
		this.abortSignal = abortSignal;
	}

	static async fromIntent(intent: ChatIntent): Promise<ChatRequest> {
		const builder = await ChatRequestBuilder.fromIntent(intent);
		return builder.build();
	}
}


export class ChatRequestBuilder {
	private readonly uri: vscode.Uri;
	private readonly supportsMultimodal: boolean;
	private readonly toolProvider: ToolProvider;
	private readonly toolContext: ToolContext;
	private copilotOptions: CopilotOptions;
	private messages: ModelMessage[];
	private isInvalid: boolean;
	private abortSignal?: AbortSignal;

	static async fromIntent(intent: ChatIntent): Promise<ChatRequestBuilder> {
		const builder = new ChatRequestBuilder(
			intent.documentUri,
			intent.supportsMultimodal || false,
			intent.overrides?.toolProvider ?? new ToolProvider(),
			new ToolContext(intent.documentUri),
		);
		builder.abortSignal = intent.abortSignal;

		if (intent.overrides?.systemPrompt) {
			await builder.addChatMessage(ChatRoleFlags.System, intent.overrides.systemPrompt);
		}

		if (intent.contextLines) {
			await builder.addLines(intent.contextLines);
		}

		await builder.addChatMessage(ChatRoleFlags.User, intent.userInput);

		if (intent.overrides?.userAppend) {
			await builder.addChatMessage(ChatRoleFlags.User, intent.overrides.userAppend);
		}

		builder.mergeCopilotOptions(intent.overrides?.copilotOptions);

		return builder;
	}

	constructor(
		documentUri: vscode.Uri,
		supportsMultimodal: boolean,
		toolProvider: ToolProvider,
		toolContext: ToolContext,
	) {
		this.uri = documentUri;
		this.supportsMultimodal = supportsMultimodal;
		this.toolProvider = toolProvider;
		this.toolContext = toolContext;
		this.copilotOptions = {};
		this.messages = [];
		this.isInvalid = false;
		this.abortSignal = undefined;
	}

	mergeCopilotOptions(overrideOptions?: CopilotOptions) {
		if (!overrideOptions) {
			return;
		}

		this.copilotOptions = deepMergeJsons(this.copilotOptions, overrideOptions);
	}

	async addChatMessage(flags: ChatRoleFlags, message: string) {
		if (this.isInvalid) { return; }

		const role = toModelChatRole(flags);
		if (flags & ChatRoleFlags.Override) {
			this.messages = this.messages.filter(m => m.role !== role);
		}

		message = await this.processJsonBlocks(message);

		if (!message.trim()) { return; }

		await this.addMessageToChat(role, message);
	}

	private async processJsonBlocks(message: string): Promise<string> {
		for (const match of message.matchAll(/```(json|yaml) +copilot-(options|tools)\n([^]*?)\n```/gm)) {
			const [matched, format, type, content] = match;

			let parsed: unknown;
			try {
				switch (format) {
					case "json":
						parsed = JSON.parse(content);
						break;
					case "yaml":
						parsed = YAML.parse(content);
						break;
					default:
						throw new AssertionError();
				}
			} catch {
				this.copilotOptions = {};
				this.messages = [];
				this.isInvalid = true;
				return `Correct the following ${format} and answer in the language of the \`${l10n.getLocale()}\` locale:\n\`\`\`${format}\n${content}\n\`\`\``;
			}

			message = message.replace(matched, "");

			switch (type) {
				case "options":
					if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
						throw new Error('Invalid copilot-options block.');
					}
					this.copilotOptions = deepMergeJsons(this.copilotOptions, parsed as Record<string, unknown>);
					break;
				case "tools":
					if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) {
						throw new Error('Invalid copilot-tools block.');
					}
					await this.processToolsJson(parsed);
					break;
				default:
					throw new AssertionError();
			}
		}

		return message;
	}

	private async processToolsJson(toolTexts: string[]) {
		return Promise.all(
			toolTexts.map(toolText => this.toolProvider.resolveToolText(
				this.toolContext,
				toolText,
			))
		);
	}

	private async addMessageToChat(role: ChatRole, message: string) {
		if (!this.supportsMultimodal) {
			this.messages.push({ role, content: message } as ModelMessage);
			return;
		}

		const parts = message.split(/(!\[[^\]]*\]\([^)]+\))|(<img\s[^>]*src="[^"]+"[^>]*>)/gm).filter(Boolean);

		if (parts.length === 1) {
			this.messages.push({ role, content: message } as ModelMessage);
			return;
		}

		this.messages.push({
			role,
			content: await Promise.all(parts.map(part => this.processMessagePart(part))),
		} as ModelMessage);
	}

	private async processMessagePart(part: string): Promise<TextPart | ImagePart | FilePart> {
		const match = part.match(/!\[[^\]]*\]\(([^)]+)\)|<img\s[^>]*src="([^"]+)"[^>]*>/);
		if (!match) { return { type: 'text', text: part }; }

		const uri = match[1] || match[2];
		const mimeType = mime.lookup(uri);
		if (!mimeType) { return { type: 'text', text: part }; }

		if (mimeType.startsWith('image/')) {
			if (/^https?:\/\//.test(uri)) {
				return { type: 'image', image: new URL(uri) };
			}
			const data = await vscode.workspace.fs.readFile(
				resolveFragmentUri(this.uri, uri)
			);
			return {
				type: 'image',
				image: Buffer.from(data),
				mediaType: mimeType,
			};
		}

		if (mimeType.startsWith('audio/')) {
			const data = await vscode.workspace.fs.readFile(
				resolveFragmentUri(this.uri, uri)
			);
			return {
				type: 'file',
				data: Buffer.from(data),
				filename: path.basename(uri),
				mediaType: mimeType,
			};
		}

		throw new Error(`Unsupported media type: ${mimeType}`);
	}

	async addLines(lines: string[]) {
		let previousChatRole = ChatRoleFlags.User;
		let chatMessagelineTexts: string[] = [];
		for (const lineText of lines) {
			const lineChatRoleFlags = toChatRole(lineText);
			if (ChatRoleFlags.None === lineChatRoleFlags) {
				chatMessagelineTexts.push(lineText);
				continue;
			}

			if (lineChatRoleFlags !== previousChatRole) {
				await this.addChatMessageLines(previousChatRole, chatMessagelineTexts);
				previousChatRole = lineChatRoleFlags;
				chatMessagelineTexts = [];
			}

			chatMessagelineTexts.push(removeChatRole(lineText));
		}
		await this.addChatMessageLines(previousChatRole, chatMessagelineTexts);
	}

	build(): ChatRequest {
		const toolContext = new ToolContext(
			this.toolContext.documentUri,
			new Map(
				[...this.toolContext.definitions.entries()].map(([name, definition]) => [
					name,
					{ ...definition },
				])
			),
		);

		return new ChatRequest(
			[...this.messages],
			{ ...this.copilotOptions, },
			toolContext,
			this.toolProvider,
			this.abortSignal,
		);
	}

	private async addChatMessageLines(flags: ChatRoleFlags, textLines: string[]) {
		return this.addChatMessage(flags, textLines.join(LF));
	}
}
