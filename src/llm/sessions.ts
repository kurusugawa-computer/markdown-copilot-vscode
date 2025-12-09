import { logger } from '../utils/logging';
import { newModelWithToolFactories, toCallSettings } from './providers';
import type { ChatRequest } from './requests';

import { generateText, streamText, type TextStreamPart, type ToolSet } from 'ai';

export type ChatStreamPart = TextStreamPart<ToolSet>;

type NewChatStream = (request: ChatRequest, abortSignal?: AbortSignal) => Promise<AsyncIterable<ChatStreamPart>>;

function newStreamingModeStream(): NewChatStream {
	return async (
		request: ChatRequest,
		abortSignal?: AbortSignal,
	) => {
		const callSettings = toCallSettings(request.copilotOptions);
		const { model, toolFactories } = await newModelWithToolFactories(callSettings.backendSettings);
		const tools = request.toolProvider.newToolSet(request.toolContext, toolFactories);

		const stream = (async function* () {
			const streamResult = streamText({
				model,
				messages: request.messages,
				tools: Object.keys(tools).length === 0 ? undefined : tools,
				toolChoice: callSettings.toolChoice,
				abortSignal,
				providerOptions: callSettings.providerOptions,
				stopWhen: abortSignal ? () => abortSignal.aborted : undefined,
				...callSettings.callSettings,
			});

			for await (const part of streamResult.fullStream) {
				if (abortSignal?.aborted) {
					return;
				}
				yield part;
			}
		})();

		return stream;
	};
}

function newBatchModeStream(): NewChatStream {
	return async (
		request: ChatRequest,
		abortSignal?: AbortSignal,
	) => {
		const callSettings = toCallSettings(request.copilotOptions);
		const { model, toolFactories } = await newModelWithToolFactories(callSettings.backendSettings);
		const tools = request.toolProvider.newToolSet(request.toolContext, toolFactories);

		const stream = (async function* () {
			const result = await generateText({
				model,
				messages: request.messages,
				tools: Object.keys(tools).length === 0 ? undefined : tools,
				toolChoice: callSettings.toolChoice,
				abortSignal,
				providerOptions: callSettings.providerOptions,
				stopWhen: abortSignal ? () => abortSignal.aborted : undefined,
				...callSettings.callSettings,
			});

			yield { id: result.response.id, type: 'text-delta', text: result.text } as ChatStreamPart;
		})();

		return stream;
	};
}


export class ChatSession {
	readonly request: ChatRequest;
	private readonly newStream: NewChatStream;
	private readonly abortSignal?: AbortSignal;

	constructor(
		request: ChatRequest,
		newStream?: NewChatStream,
	) {
		this.request = request;
		this.abortSignal = request.abortSignal;
		const noStreaming = request.copilotOptions.stream === false;
		this.newStream = newStream ?? (noStreaming
			? newBatchModeStream()
			: newStreamingModeStream()
		);
	}

	dispose(): void {
		// no-op for now; kept for symmetry with callers
	}

	async resultText(): Promise<string> {
		let result = '';
		for await (const part of this.stream()) {
			if (part.type === 'text-delta') {
				result += part.text;
			} else if (part.type === 'error') {
				throw part.error instanceof Error ? part.error : new Error(String(part.error));
			}
		}
		return result;
	}

	async *stream(): AsyncIterable<ChatStreamPart> {
		const abortSignal = this.abortSignal;
		if (abortSignal?.aborted) { return; }

		const stream = await this.newStream(
			this.request,
			abortSignal,
		);
		for await (const part of stream) {
			if (abortSignal?.aborted) {
				return;
			}
			logger.debug('[session]', part);
			yield part;
		}
	}
}
