import { AssertionError } from 'assert';
import mime from 'mime-types';
import { AzureOpenAI, OpenAI } from 'openai';
import { Stream } from "openai/streaming";
import * as vscode from 'vscode';
import { LF, resolveFragmentUri } from '../utils';
import * as l10n from '../utils/localization';
import { deepMergeJsons } from './json';
import { toolTextToTools } from './llmTools';

function buildChatParams(
	configuration: vscode.WorkspaceConfiguration,
	chatMessages: ChatMessage[],
	override: OpenAI.ChatCompletionCreateParams,
	stream: boolean,
): OpenAI.ChatCompletionCreateParams {
	// eslint-disable-next-line prefer-object-spread
	return Object.assign({
		model: configuration.get<string>("markdown.copilot.openAI.model")!,
		messages: chatMessages,
		temperature: configuration.get<number>("markdown.copilot.options.temperature")!,
		stream,
	}, override);
}

async function createChatCompletion(
	chatMessages: ChatMessage[],
	override: OpenAI.ChatCompletionCreateParams
): Promise<OpenAI.Chat.Completions.ChatCompletion | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
	const configuration = vscode.workspace.getConfiguration();
	const openai: OpenAI | AzureOpenAI = await createOpenAIClient(configuration);
	return openai.chat.completions.create(buildChatParams(configuration, chatMessages, override, true));
}

export async function executeTask(chatMessages: ChatMessage[], override: OpenAI.ChatCompletionCreateParams): Promise<string> {
	const configuration = vscode.workspace.getConfiguration();
	const openai: OpenAI | AzureOpenAI = await createOpenAIClient(configuration);
	const completion = await openai.chat.completions.create(
		buildChatParams(configuration, chatMessages, override, false) as OpenAI.ChatCompletionCreateParamsNonStreaming
	);
	return completion.choices[0].message.content!;
}

export async function executeChatCompletion(
	chatMessages: ChatMessage[],
	override: OpenAI.ChatCompletionCreateParams,
	onDeltaContent: (deltaContent: string) => Promise<void>,
	onStream?: (stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>) => Promise<void>,
) {
	const completion = await createChatCompletion(chatMessages, override);
	if (!(completion instanceof Stream)) {
		const choice = completion.choices[0];
		return onDeltaContent(choice.message.content!);
	}

	await onStream?.(completion);
	for await (const chunk of completion) {
		const chunkText = chunk.choices[0]?.delta?.content || '';
		if (chunkText.length === 0) { continue; }
		await onDeltaContent(chunkText);
	}
}

export async function executeChatCompletionWithTools(
	chatMessages: ChatMessage[],
	override: OpenAI.ChatCompletionCreateParams,
	onDeltaContent: (deltaContent: string) => Promise<void>,
	onToolCallFunction: (toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function) => Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]>,
	onStream?: (stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>) => Promise<void>,
) {
	while (true) {
		const completion = await createChatCompletion(chatMessages, override);
		if (!(completion instanceof Stream)) {
			const message = completion.choices[0].message;
			// If no tool calls, output content and exit.
			if (!message.tool_calls) {
				await onDeltaContent(message.content!);
				return;
			}
			chatMessages.push({ role: ChatRole.Assistant, tool_calls: message.tool_calls });
			const toolResponses = await executeToolCalls(message.tool_calls, onToolCallFunction);
			chatMessages.push(...toolResponses);
		} else {
			await onStream?.(completion);
			let finishReason: "length" | "stop" | "tool_calls" | "content_filter" | "function_call" | null = null;
			const resolvedToolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
			for await (const chunk of completion) {
				const choice = chunk.choices[0];
				const delta = choice.delta;
				const toolCalls = delta.tool_calls || [];
				for (const toolCall of toolCalls) {
					const index = toolCall.index;
					if (!resolvedToolCalls[index]) {
						resolvedToolCalls[index] = toolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
					} else {
						resolvedToolCalls[index].function!.arguments += toolCall.function?.arguments ?? '';
					}
				}
				if (delta.content !== undefined && delta.content !== null) {
					await onDeltaContent(delta.content);
				}
				if (choice.finish_reason !== null) {
					finishReason = choice.finish_reason;
				}
			}
			if (finishReason !== "tool_calls") {
				return;
			}
			chatMessages.push({ role: ChatRole.Assistant, tool_calls: resolvedToolCalls });
			const toolResponses = await executeToolCalls(resolvedToolCalls, onToolCallFunction);
			chatMessages.push(...toolResponses);
		}
		// Loop to process the next round of chat completion with updated messages.
	}
}

async function executeToolCalls(
	toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
	onToolCallFunction: (toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function) => Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]>
): Promise<OpenAI.ChatCompletionToolMessageParam[]> {
	return Promise.all(toolCalls.map(toolCall => {
		console.log(toolCall.function);
		return onToolCallFunction(toolCall.function)
			.catch(reason => reason instanceof Error ? reason.message : String(reason))
			.then(content => ({
				role: ChatRole.Tool,
				tool_call_id: toolCall.id,
				content,
			} as OpenAI.ChatCompletionToolMessageParam));
	}));
}

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

export type ChatMessage = OpenAI.ChatCompletionMessageParam;

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

function toOpenAIChatRole(flags: ChatRoleFlags): ChatRole {
	if (flags & ChatRoleFlags.User) { return ChatRole.User; }
	if (flags & ChatRoleFlags.Assistant) { return ChatRole.Assistant; }
	if (flags & ChatRoleFlags.System) { return ChatRole.System; }
	if (flags & ChatRoleFlags.Tool) { return ChatRole.Tool; }
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

	async addChatMessage(flags: ChatRoleFlags, message: string) {
		if (this.isInvalid) { return; }
		const role = toOpenAIChatRole(flags);
		if (flags & ChatRoleFlags.Override) {
			this.chatMessages = this.chatMessages.filter(m => m.role !== role);
		}

		for (const match of message.matchAll(/```json +copilot-(options|tools)\n([^]*?)\n```/gm)) {
			const [matched, type, jsonText] = match;

			let parsed: OpenAI.ChatCompletionCreateParams | string[];
			try {
				parsed = JSON.parse(jsonText);
			} catch {
				flags = ChatRoleFlags.User;
				message = "Correct the following JSON and answer in the language of the `" + l10n.getLocale() + "` locale:\n```\n" + jsonText + "\n```";
				this.copilotOptions = {} as OpenAI.ChatCompletionCreateParams;
				this.chatMessages = [];
				this.isInvalid = true;
				break;
			}

			message = message.replace(matched, "");

			if (type === "options") {
				this.copilotOptions = deepMergeJsons(this.copilotOptions, parsed);
				continue;
			}

			// Process parsed tools.
			const tools = (parsed as string[]).reduce(
				(results, toolText) => results.concat(toolTextToTools(this.document, toolText)),
				[] as OpenAI.ChatCompletionTool[]
			);

			// Merge tools into copilotOptions.tools, ensuring each function name is unique.
			const mergedTools = this.copilotOptions.tools || [];
			tools.forEach(tool => {
				const index = mergedTools.findIndex(e => e.function.name === tool.function.name);
				if (index >= 0) {
					mergedTools[index] = tool;
				} else {
					mergedTools.push(tool);
				}
			});
			this.copilotOptions.tools = mergedTools;
		}

		if (!message.trim()) return;

		if (!this.supportsMultimodal) {
			this.chatMessages.push({ role, content: message } as OpenAI.ChatCompletionUserMessageParam);
			return;
		}

		// Matches medias in Markdown (i.e., `![alt](url)`)
		const parts = message.split(/(!\[[^\]]*\]\([^)]+\))|(<img\s[^>]*src="[^"]+"[^>]*>)/gm).filter(Boolean);

		if (parts.length === 1) {
			this.chatMessages.push({ role, content: message } as OpenAI.ChatCompletionUserMessageParam);
			return;
		}

		const contentParts = await Promise.all(parts.map(async part => {
			const match = part.match(/!\[[^\]]*\]\(([^)]+)\)|<img\s[^>]*src="([^"]+)"[^>]*>/);
			if (!match) return { type: 'text', text: part } as OpenAI.ChatCompletionContentPart;
			const uri = match[1] || match[2];
			const mimeType = mime.lookup(uri);
			if (!mimeType) return { type: 'text', text: part } as OpenAI.ChatCompletionContentPart;
			if (mimeType.startsWith('image/')) {
				if (/^https?:\/\//.test(uri)) {
					return { type: 'image_url', image_url: { url: uri } } as OpenAI.ChatCompletionContentPart;
				}
				const data = Buffer.from(await vscode.workspace.fs.readFile(resolveFragmentUri(this.document, uri))).toString('base64');
				return { type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } } as OpenAI.ChatCompletionContentPart;
			}
			if (mimeType === 'audio/mpeg' || mimeType === 'audio/wave') {
				const data = Buffer.from(await vscode.workspace.fs.readFile(resolveFragmentUri(this.document, uri))).toString('base64');
				const format = mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
				return { type: 'input_audio', input_audio: { data, format } } as OpenAI.ChatCompletionContentPart;
			}
			throw new Error(`Unsupported media type: ${mimeType}`);
		}));
		this.chatMessages.push({ role, content: contentParts } as OpenAI.ChatCompletionUserMessageParam);
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

	toChatMessages(): ChatMessage[] {
		return this.chatMessages;
	}

	getCopilotOptions(): OpenAI.ChatCompletionCreateParams {
		return this.copilotOptions;
	}

	private async addChatMessageLines(flags: ChatRoleFlags, textLines: string[]) {
		return this.addChatMessage(flags, textLines.join(LF));
	}
}

export async function createOpenAIClient(configuration: vscode.WorkspaceConfiguration) {
	let apiKey = configuration.get<string>("markdown.copilot.openAI.apiKey");
	const isValidApiKey = (apiKey?: string): boolean => apiKey !== undefined && apiKey.length > 6;
	if (!isValidApiKey(apiKey)) {
		apiKey = await vscode.window.showInputBox({ placeHolder: 'Enter your OpenAI API key.' });
		if (!isValidApiKey(apiKey)) {
			throw new Error(`401 Incorrect API key: ${apiKey}. Find yours at https://platform.openai.com/account/api-keys.`);
		}
		configuration.update("markdown.copilot.openAI.apiKey", apiKey);
	}
	const baseUrl = configuration.get<string>("markdown.copilot.openAI.azureBaseUrl");
	if (!baseUrl) {
		return new OpenAI({ apiKey });
	}

	try {
		const url = new URL(baseUrl);
		return new AzureOpenAI({
			endpoint: url.origin,
			deployment: decodeURI(url.pathname.match("/openai/deployments/([^/]+)/completions")![1]),
			apiKey,
			apiVersion: url.searchParams.get("api-version")!,
		});
	} catch {
		throw new TypeError(l10n.t(
			"config.openAI.azureBaseUrl.error",
			baseUrl,
			l10n.t("config.openAI.azureBaseUrl.description")
		));
	}
}
