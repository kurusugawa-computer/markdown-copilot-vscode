import { AssertionError } from 'assert';
import fs from 'fs';
import mime from 'mime-types';
import { AzureOpenAI, OpenAI } from 'openai';
import * as vscode from 'vscode';
import { LF, resolveFragmentUri } from '../utils';
import * as l10n from '../utils/localization';


export async function executeTask(chatMessages: ChatMessage[], override: OpenAI.ChatCompletionCreateParams): Promise<string> {
	const configuration = vscode.workspace.getConfiguration();
	const openai: OpenAI | AzureOpenAI = await createOpenAIClient(configuration);
	const completion = await openai.chat.completions.create(Object.assign(
		{
			model: configuration.get<string>("markdown.copilot.openAI.model")!,
			messages: chatMessages,
			temperature: configuration.get<number>("markdown.copilot.options.temperature")!,
			stream: false,
		}, override as OpenAI.ChatCompletionCreateParamsNonStreaming
	));
	return completion.choices[0].message.content!;
}

export enum ChatRole {
	None = "none",
	System = "system",
	User = "user",
	Assistant = "assistant",
}

export enum ChatRoleFlags {
	None = 0,
	Override = 1 << 0,
	System = 1 << 1,
	User = 1 << 2,
	Assistant = 1 << 3,
}

export interface ChatMessage {
	role: ChatRole;
	content: string | OpenAI.ChatCompletionContentPart[];
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
		| (match[2] === "(Override)" ? ChatRoleFlags.Override : ChatRoleFlags.None);
}

function toOpenAIChatRole(flags: ChatRoleFlags): ChatRole {
	if (flags & ChatRoleFlags.User) { return ChatRole.User; }
	if (flags & ChatRoleFlags.Assistant) { return ChatRole.Assistant; }
	if (flags & ChatRoleFlags.System) { return ChatRole.System; }
	throw new AssertionError();
}

function removeChatRole(text: string): string {
	return text.replace(roleRegex, "");
}

export class ChatMessageBuilder {
	private readonly document: vscode.TextDocument;
	private readonly supportsMultimodal: boolean;
	private copilotOptions: OpenAI.ChatCompletionCreateParams;
	private chatMessages: ChatMessage[];
	private isInvalid: boolean;

	constructor(document: vscode.TextDocument, supportsMultimodal: boolean) {
		this.document = document;
		this.supportsMultimodal = supportsMultimodal;
		this.copilotOptions = {} as OpenAI.ChatCompletionCreateParams;
		this.chatMessages = [];
		this.isInvalid = false;
	}

	addChatMessage(flags: ChatRoleFlags, message: string) {
		if (this.isInvalid) { return; }

		const role = toOpenAIChatRole(flags);

		if (flags & ChatRoleFlags.Override) {
			this.chatMessages = this.chatMessages.filter(m => m.role !== role);
		}

		for (const match of message.matchAll(/```json +copilot-options\n([^]*?)\n```/gm)) {
			try {
				Object.assign(this.copilotOptions, JSON.parse(match[1]));
				message = message.replace(match[0], "");
			} catch {
				flags = ChatRoleFlags.User;
				message = "Correct the following JSON and answer in the language of the `" + l10n.getLocale() + "` locale:\n```\n" + match[1] + "\n```";
				this.copilotOptions = {} as OpenAI.ChatCompletionCreateParams;
				this.chatMessages = [];
				this.isInvalid = true;
				break;
			}
		}

		// Ignore empty messages
		if (message.trim().length === 0) { return; }
		if (!this.supportsMultimodal) {
			this.chatMessages.push({ role: role, content: message });
			return;
		}

		// Matches medias in Markdown (i.e., `![alt](url)`)
		const parts = message.split(/(!\[[^\]]*\]\([^)]+\))|(<img\s[^>]*src="[^"]+"[^>]*>)/gm).filter(Boolean);

		if (parts.length === 1) {
			this.chatMessages.push({ role: role, content: message });
			return;
		}

		const content = parts.map<OpenAI.ChatCompletionContentPart>(part => {
			// Match media in Markdown and HTML image tags
			const match = part.match(/!\[[^\]]*\]\(([^)]+)\)|<img\s[^>]*src="([^"]+)"[^>]*>/);
			if (!match) { return { type: 'text', text: part }; }

			const uri = match[1]?.replace(/^<|>$/g, '') || match[2];
			const mimeType = mime.lookup(uri);
			if (!mimeType) { return { type: 'text', text: part }; }

			if (mimeType.startsWith('image/')) {
				if (/^https?:\/\//.test(uri)) {
					return { type: 'image_url', image_url: { url: uri } };
				}
				const data = fs.readFileSync(resolveFragmentUri(this.document, uri).fsPath).toString('base64');
				return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } };
			}

			if (mimeType === 'audio/mpeg' || mimeType === 'audio/wave') {
				const data = fs.readFileSync(resolveFragmentUri(this.document, uri).fsPath).toString('base64');
				const format = mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
				return { type: 'input_audio', input_audio: { data, format } };
			}

			throw new Error(`Unsupported media type: ${mimeType}`);
		});
		this.chatMessages.push({ role: role, content: content });
	}

	addLines(lines: string[]) {
		let previousChatRole = ChatRoleFlags.User;
		let chatMessagelineTexts: string[] = [];
		for (const lineText of lines) {
			const lineChatRoleFlags = toChatRole(lineText);
			if (ChatRoleFlags.None === lineChatRoleFlags) {
				chatMessagelineTexts.push(lineText);
				continue;
			}

			if (lineChatRoleFlags !== previousChatRole) {
				this.addChatMessageLines(previousChatRole, chatMessagelineTexts);
				previousChatRole = lineChatRoleFlags;
				chatMessagelineTexts = [];
			}

			chatMessagelineTexts.push(removeChatRole(lineText));
		}
		this.addChatMessageLines(previousChatRole, chatMessagelineTexts);
	}

	toChatMessages(): ChatMessage[] {
		return this.chatMessages;
	}

	getCopilotOptions(): OpenAI.ChatCompletionCreateParams {
		return this.copilotOptions;
	}

	private addChatMessageLines(flags: ChatRoleFlags, textLines: string[]): void {
		this.addChatMessage(flags, textLines.join(LF));
	}
}
export async function createOpenAIClient(configuration: vscode.WorkspaceConfiguration) {
	let apiKey = configuration.get<string>("markdown.copilot.openAI.apiKey");
	const isValidApiKey = (apiKey?: string): boolean => apiKey !== undefined && apiKey.length > 6;
	if (!isValidApiKey(apiKey)) {
		apiKey = await vscode.window.showInputBox({ placeHolder: 'Enter your OpenAI API key.' });
		if (!isValidApiKey(apiKey)) {
			throw new Error(`401 Incorrect API key provided: ${apiKey}. You can find your API key at https://platform.openai.com/account/api-keys.`);
		}
		configuration.update("markdown.copilot.openAI.apiKey", apiKey);
	}
	const baseUrl = configuration.get<string>("markdown.copilot.openAI.azureBaseUrl");
	return (() => {
		if (!baseUrl) {
			return new OpenAI({ apiKey: apiKey });
		}
		try {
			const url = new URL(baseUrl);
			return new AzureOpenAI({
				endpoint: url.origin,
				deployment: decodeURI(url.pathname.match("/openai/deployments/([^/]+)/completions")![1]),
				apiKey: apiKey,
				apiVersion: url.searchParams.get("api-version")!,
			});
		} catch {
			throw new TypeError(l10n.t(
				"config.openAI.azureBaseUrl.error",
				baseUrl,
				l10n.t("config.openAI.azureBaseUrl.description")
			));
		}
	})();
}

