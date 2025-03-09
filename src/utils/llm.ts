import { AssertionError } from 'assert';
import mime from 'mime-types';
import { AzureOpenAI, OpenAI } from 'openai';
import { Stream } from "openai/streaming";
import * as vscode from 'vscode';
import { LF, resolveFragmentUri } from '../utils';
import * as l10n from '../utils/localization';
import * as config from './configuration';
import { deepMergeJsons } from './json';
import { executeToolFunction, ToolContext, ToolDefinitions, toolTextToTools } from './llmTools';
import { logger } from './logging';

function buildChatParams(
	chatMessages: ChatMessage[],
	override: OpenAI.ChatCompletionCreateParams,
	stream: boolean,
): OpenAI.ChatCompletionCreateParams {
	const configuration = config.get();
	// eslint-disable-next-line prefer-object-spread
	return Object.assign({
		model: configuration.optionsModelResolved,
		messages: chatMessages,
		temperature: configuration.optionsTemperature,
		stream,
	}, override);
}

async function createChatCompletion(
	chatMessages: ChatMessage[],
	override: OpenAI.ChatCompletionCreateParams
): Promise<OpenAI.Chat.Completions.ChatCompletion | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
	const openai: OpenAI | AzureOpenAI = await createOpenAIClient();
	return openai.chat.completions.create(buildChatParams(chatMessages, override, true));
}

export async function executeTask(chatMessages: ChatMessage[], override: OpenAI.ChatCompletionCreateParams): Promise<string> {
	const openai: OpenAI | AzureOpenAI = await createOpenAIClient();
	const completion = await openai.chat.completions.create(
		buildChatParams(chatMessages, override, false) as OpenAI.ChatCompletionCreateParamsNonStreaming
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
	toolContext: ToolContext,
	onDeltaContent: (deltaContent: string) => Promise<void>,
	onStream?: (stream: Stream<OpenAI.Chat.Completions.ChatCompletionChunk>) => Promise<void>,
) {
	while (true) {
		const toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] = [];
		const completion = await createChatCompletion(chatMessages, override);
		if (!(completion instanceof Stream)) {
			const message = completion.choices[0].message;
			// If no tool calls, output content and exit.
			if (!message.tool_calls) {
				await onDeltaContent(message.content!);
				return;
			}
			chatMessages.push({ role: ChatRole.Assistant, tool_calls: message.tool_calls });
			toolCalls.push(...message.tool_calls);
		} else {
			await onStream?.(completion);
			let finishReason: "length" | "stop" | "tool_calls" | "content_filter" | "function_call" | null = null;
			for await (const chunk of completion) {
				const choice = chunk.choices[0];
				const delta = choice.delta;
				for (const toolCall of (delta.tool_calls || [])) {
					const index = toolCall.index;
					if (!toolCalls[index]) {
						toolCalls[index] = toolCall as OpenAI.Chat.Completions.ChatCompletionMessageToolCall;
					} else {
						toolCalls[index].function!.arguments += toolCall.function?.arguments ?? '';
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
			chatMessages.push({ role: ChatRole.Assistant, tool_calls: toolCalls });
		}
		const toolResponses = await executeToolCalls(
			toolCalls,
			toolCallFunction => executeToolFunction(
				toolContext,
				toolCallFunction,
			),
		);
		chatMessages.push(...toolResponses);
		// Loop to process the next round of chat completion with updated messages.
	}
}

async function executeToolCalls(
	toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
	onToolCallFunction: (toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function) => Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]>
): Promise<OpenAI.ChatCompletionToolMessageParam[]> {
	return Promise.all(toolCalls.map(async toolCall => {
		logger.info(`[tool] invoke ${toolCall.function.name}:`, toolCall.function.arguments);
		const content = await onToolCallFunction(toolCall.function);
		logger.debug(`[tool] finish ${toolCall.function.name}:`, content);
		return {
			role: ChatRole.Tool,
			tool_call_id: toolCall.id,
			content,
		} as OpenAI.ChatCompletionToolMessageParam;
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
	private readonly uri: vscode.Uri;
	private readonly supportsMultimodal: boolean;
	private readonly toolDefinitions: ToolDefinitions;
	private copilotOptions: OpenAI.ChatCompletionCreateParams;
	private chatMessages: ChatMessage[];
	private isInvalid: boolean;

	constructor(documentUri: vscode.Uri, supportsMultimodal: boolean) {
		this.uri = documentUri;
		this.supportsMultimodal = supportsMultimodal;
		this.toolDefinitions = new Map();
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

		// Process special JSON blocks
		message = await this.processJsonBlocks(message);

		// Skip empty messages
		if (!message.trim()) return;

		// Add message to chat history
		await this.addMessageToChat(role, message);
	}

	private async processJsonBlocks(message: string): Promise<string> {
		for (const match of message.matchAll(/```json +copilot-(options|tools)\n([^]*?)\n```/gm)) {
			const [matched, type, jsonText] = match;

			let parsed;
			try {
				parsed = JSON.parse(jsonText);
			} catch {
				this.copilotOptions = {} as OpenAI.ChatCompletionCreateParams;
				this.chatMessages = [];
				this.isInvalid = true;
				return "Correct the following JSON and answer in the language of the `" + l10n.getLocale() + "` locale:\n```\n" + jsonText + "\n```";
			}

			// Remove matched JSON block from the message
			message = message.replace(matched, "");

			if (type === "options") {
				this.copilotOptions = deepMergeJsons(this.copilotOptions, parsed);
			} else {
				await this.processToolsJson(parsed);
			}
		}

		return message;
	}

	private async processToolsJson(toolTexts: string[]) {
		const tools = (await Promise.all(
			toolTexts.map(toolText => toolTextToTools(
				{ documentUri: this.uri, toolDefinitions: this.toolDefinitions },
				toolText
			))
		)).flat();

		const mergedTools = this.copilotOptions.tools || [];
		for (const tool of tools) {
			const index = mergedTools.findIndex(e => e.function.name === tool.function.name);
			if (index >= 0) {
				mergedTools[index] = tool;
			} else {
				mergedTools.push(tool);
			}
		}
		this.copilotOptions.tools = mergedTools;
	}

	private async addMessageToChat(role: ChatRole, message: string) {
		// Simple case: No multimodal support or no media in message
		if (!this.supportsMultimodal) {
			this.chatMessages.push({ role, content: message } as OpenAI.ChatCompletionUserMessageParam);
			return;
		}

		// Split message by media elements
		const parts = message.split(/(!\[[^\]]*\]\([^)]+\))|(<img\s[^>]*src="[^"]+"[^>]*>)/gm).filter(Boolean);

		if (parts.length === 1) {
			this.chatMessages.push({ role, content: message } as OpenAI.ChatCompletionUserMessageParam);
			return;
		}

		// Process multi-part message with media
		this.chatMessages.push({ role, content: await Promise.all(parts.map(part => this.processMessagePart(part))) } as OpenAI.ChatCompletionUserMessageParam);
	}

	private async processMessagePart(part: string): Promise<OpenAI.ChatCompletionContentPart> {
		const match = part.match(/!\[[^\]]*\]\(([^)]+)\)|<img\s[^>]*src="([^"]+)"[^>]*>/);
		if (!match) return { type: 'text', text: part } as OpenAI.ChatCompletionContentPart;

		const uri = match[1] || match[2];
		const mimeType = mime.lookup(uri);
		if (!mimeType) return { type: 'text', text: part } as OpenAI.ChatCompletionContentPart;

		// Handle images
		if (mimeType.startsWith('image/')) {
			if (/^https?:\/\//.test(uri)) {
				return { type: 'image_url', image_url: { url: uri } } as OpenAI.ChatCompletionContentPart;
			}
			const data = Buffer.from(await vscode.workspace.fs.readFile(
				resolveFragmentUri(this.uri, uri)
			)).toString('base64');
			return {
				type: 'image_url',
				image_url: { url: `data:${mimeType};base64,${data}` }
			} as OpenAI.ChatCompletionContentPart;
		}

		// Handle audio
		if (mimeType === 'audio/mpeg' || mimeType === 'audio/wave') {
			const data = Buffer.from(await vscode.workspace.fs.readFile(
				resolveFragmentUri(this.uri, uri)
			)).toString('base64');
			const format = mimeType === 'audio/mpeg' ? 'mp3' : 'wav';
			return { type: 'input_audio', input_audio: { data, format } } as OpenAI.ChatCompletionContentPart;
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

	build(): {
		chatMessages: ChatMessage[],
		copilotOptions: OpenAI.ChatCompletionCreateParams,
		toolContext: ToolContext,
	} {
		return {
			chatMessages: this.chatMessages,
			copilotOptions: this.copilotOptions,
			toolContext: { toolDefinitions: this.toolDefinitions, documentUri: this.uri },
		};
	}

	private async addChatMessageLines(flags: ChatRoleFlags, textLines: string[]) {
		return this.addChatMessage(flags, textLines.join(LF));
	}
}

async function createOpenAIClient() {
	const configuration = config.get();
	const backendProtocol = configuration.backendProtocol;
	const backendBaseUrl = configuration.backendBaseUrl;
	let apiKey = configuration.backendApiKey;

	switch (backendProtocol) {
		case "OpenAI":
			if (!apiKey) {
				apiKey = await vscode.window.showInputBox({
					placeHolder: 'Enter your OpenAI API key',
					validateInput: value => value?.length > 6 ? null : "Invalid API key"
				});
				if (!apiKey) {
					throw new Error(l10n.t("config.backend.apiKey.error.openai"));
				}
				configuration.backendApiKey = apiKey;
			}
			return new OpenAI({ apiKey });

		case "Azure":
			try {
				const url = new URL(backendBaseUrl!);
				return new AzureOpenAI({
					endpoint: url.origin,
					deployment: decodeURI(url.pathname.match("/openai/deployments/([^/]+)/completions")![1]),
					apiKey,
					apiVersion: url.searchParams.get("api-version")!,
				});
			} catch {
				throw new Error(l10n.t("config.backend.baseUrl.error.azure", backendBaseUrl || ""));
			}

		case "Ollama":
			return new OpenAI({
				apiKey: apiKey || "ollama",
				baseURL: backendBaseUrl || "http://localhost:11434/v1",
			});

		case "OpenRouter":
			if (!apiKey) {
				apiKey = await vscode.window.showInputBox({
					placeHolder: 'Enter your OpenRouter API key',
					validateInput: value => value?.length > 6 ? null : "Invalid API key"
				});
				if (!apiKey) {
					throw new Error(l10n.t("config.backend.baseUrl.error.openRouter"));
				}
				configuration.backendApiKey = apiKey;
			}
			return new OpenAI({
				apiKey,
				baseURL: backendBaseUrl || "https://openrouter.ai/api/v1",
				defaultHeaders: {
					'HTTP-Referer': 'https://github.com/kurusugawa-computer/markdown-copilot-vscode',
					'X-Title': 'Markdown Copilot'
				}
			});

		default:
			throw new Error(`Invalid backend protocol: ${backendProtocol}`);
	}
}
