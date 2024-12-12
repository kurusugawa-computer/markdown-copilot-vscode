import { AssertionError } from 'assert';
import fs from 'fs';
import mime from 'mime-types';
import { AzureOpenAI, OpenAI } from 'openai';
import { Stream } from "openai/streaming";
import * as vscode from 'vscode';
import { LF, countChar } from '../utils';
import * as l10n from '../utils/localization';

export type ChatCompletionCreateParamsStreaming = OpenAI.ChatCompletionCreateParamsStreaming;

export async function createStream(chatMessages: ChatMessage[], override: ChatCompletionCreateParamsStreaming): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
	const configuration = vscode.workspace.getConfiguration();
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
	const openai: OpenAI | AzureOpenAI = (() => {
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
				l10n.t("config.openAI.azureBaseUrl.description"),
			));
		}
	})();
	const stream = await openai.chat.completions.create(Object.assign(
		{
			model: configuration.get<string>("markdown.copilot.openAI.model")!,
			messages: chatMessages,
			temperature: configuration.get<number>("markdown.copilot.options.temperature")!,
			stream: true,
		}, override
	));
	return stream;
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


/*
 * Completion
 */
export class ChatCompletion {
	// TODO: Remove dependency on events after introducing Anchor Position Update Mechanism

	private static readonly runningCompletions = new Set<ChatCompletion>();
	private textEditor: vscode.TextEditor;
	private document: vscode.TextDocument;
	private anchorOffset: number;
	private changes: Set<string>;
	private abortController?: AbortController;
	private completionIndicator: vscode.TextEditorDecorationType;

	constructor(textEditor: vscode.TextEditor, anchorOffset: number) {
		this.textEditor = textEditor;
		this.document = textEditor.document;
		this.anchorOffset = anchorOffset;
		this.changes = new Set();
		this.abortController = undefined;
		this.completionIndicator = vscode.window.createTextEditorDecorationType({
			after: { contentText: "📝" },
		});
		ChatCompletion.runningCompletions.add(this);
	}

	dispose() {
		this.completionIndicator.dispose();
		ChatCompletion.runningCompletions.delete(this);
	}

	cancel(reason?: any) {
		this.abortController?.abort(reason);
	}

	setAnchorOffset(anchorOffset: number): number {
		this.anchorOffset = anchorOffset;
		return this.anchorOffset;
	}

	translateAnchorOffset(diffAnchorOffset: number) {
		this.anchorOffset += diffAnchorOffset;
		return this.anchorOffset;
	}

	static onDeactivate() {
		for (const completion of ChatCompletion.runningCompletions) {
			completion.dispose();
		}
	}

	static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		for (const completion of ChatCompletion.runningCompletions) {
			completion.onDidChangeTextDocument(event);
		}
	}

	onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		if (event.document !== this.document) { return; }
		for (const change of event.contentChanges) {
			const changeStartOffset = change.rangeOffset;
			if (changeStartOffset > this.anchorOffset) { continue; }
			if (this.changes.delete(`${changeStartOffset},${change.text},${event.document.uri}`)) { continue; }

			const changeOffsetDiff = countChar(change.text) - change.rangeLength;
			const changeEndOffset = change.rangeOffset + change.rangeLength;
			if (changeEndOffset > this.anchorOffset) {
				this.anchorOffset = changeEndOffset;
			} else {
				this.anchorOffset += changeOffsetDiff;
			}
		}
	}

	async insertText(text: string, lineSeparator: string): Promise<number> {
		text = lineSeparator === LF ? text : text.replaceAll(LF, lineSeparator);
		const edit = new vscode.WorkspaceEdit();
		const anchorPosition = this.document.positionAt(this.anchorOffset);
		edit.insert(
			this.document.uri,
			anchorPosition,
			text
		);
		this.textEditor.setDecorations(this.completionIndicator, [new vscode.Range(anchorPosition, anchorPosition)]);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		return vscode.workspace.applyEdit(
			edit,
		).then(() => countChar(text));
	}

	async replaceLine(text: string, line: number): Promise<number> {
		const textLine = this.document.lineAt(line);
		const deleteCharCount = countChar(textLine.text);
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			this.document.uri,
			textLine.range,
			text
		);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		return vscode.workspace.applyEdit(
			edit,
		).then(() => countChar(text) - deleteCharCount);
	}

	async completeText(chatMessages: ChatMessage[], lineSeparator: string, override?: ChatCompletionCreateParamsStreaming) {
		const stream = await createStream(chatMessages, override || {} as ChatCompletionCreateParamsStreaming);
		this.abortController = stream.controller;

		const chunkTextBuffer: string[] = [];
		const submitChunkText = async (chunkText: string): Promise<number> => {
			chunkTextBuffer.push(chunkText);
			if (!chunkText.includes(LF)) { return 0; }
			const chunkTextBufferText = chunkTextBuffer.join("");
			chunkTextBuffer.length = 0;
			return this.insertText(chunkTextBufferText, lineSeparator);
		};

		for await (const chunk of stream) {
			const chunkText = chunk.choices[0]?.delta?.content || '';
			if (chunkText.length === 0) { continue; }
			this.anchorOffset += await submitChunkText(chunkText);
		}
		// flush chunkTextBuffer
		this.anchorOffset += await submitChunkText(LF);
	}
}



export class ChatMessageBuilder {
	private copilotOptions: ChatCompletionCreateParamsStreaming;
	private chatMessages: ChatMessage[];
	private isInvalid: boolean;

	constructor() {
		this.copilotOptions = {} as ChatCompletionCreateParamsStreaming;
		this.chatMessages = [];
		this.isInvalid = false;
	}

	addChatMessage(flags: ChatRoleFlags, message: string): void {
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
				this.copilotOptions = {} as ChatCompletionCreateParamsStreaming;
				this.chatMessages = [];
				this.isInvalid = true;
				break;
			}
		}

		// Ignore empty messages
		if (message.trim().length === 0) { return; }

		// Matches images in Markdown (i.e., `![alt](url)`)
		const parts = message.split(/(!\[[^\]]*\]\([^)]+\))/gm).filter(part => part !== '');

		if (parts.length === 1) {
			this.chatMessages.push({ role: role, content: message });
		} else {
			const content = parts.map<OpenAI.ChatCompletionContentPart>(part => {
				const url = part.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1];
				if (url === undefined) { return { type: 'text', text: part }; }
				if (url.match(/^https?:\/\//)) {
					return { type: 'image_url', image_url: { url: url } };
				} else {
					const fullUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, url);
					const text = fs.readFileSync(fullUri.fsPath).toString('base64');
					const type = mime.lookup(fullUri.fsPath) || "image/png";
					return { type: 'image_url', image_url: { url: `data:${type};base64,${text}` } };
				}
			});
			this.chatMessages.push({ role: role, content: content });
		}
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

	getCopilotOptions(): ChatCompletionCreateParamsStreaming {
		return this.copilotOptions;
	}

	private addChatMessageLines(flags: ChatRoleFlags, textLines: string[]): void {
		this.addChatMessage(flags, textLines.join(LF));
	}
}
