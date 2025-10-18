import * as assert from 'assert';
import * as vscode from 'vscode';
import { ToolContext } from '../../llm';
import type { ChatRequest } from '../../llm/requests';
import type { ChatStreamPart } from '../../llm/sessions';
import { ChatSession } from '../../llm/sessions';
import { ToolProvider } from '../../llm/tools';

function newRequest(stream: boolean, abortSignal?: AbortSignal): ChatRequest {
	return {
		messages: [],
		copilotOptions: { stream },
		toolContext: new ToolContext(vscode.Uri.parse('file:///test.md')),
		toolProvider: new ToolProvider(),
		abortSignal,
	};
}

suite('ChatSession', () => {
	test('stream stops when abortSignal is aborted', async () => {
		const controller = new AbortController();
		const request = newRequest(true, controller.signal);
		let yielded = 0;
		const newStream = async (_req: ChatRequest, abortSignal?: AbortSignal): Promise<AsyncIterable<ChatStreamPart>> => {
			async function* generator() {
				yield { type: 'text-delta', text: 'first' } as ChatStreamPart;
				yielded++;
				await new Promise(resolve => setTimeout(resolve, 5));
				if (!abortSignal?.aborted) {
					yield { type: 'text-delta', text: 'second' } as ChatStreamPart;
					yielded++;
				}
			}
			return generator();
		};

		const session = new ChatSession(request, newStream);
		const received: string[] = [];
		for await (const part of session.stream()) {
			received.push(part.type === 'text-delta' ? part.text : '');
			controller.abort();
		}

		assert.deepStrictEqual(received, ['first']);
		assert.strictEqual(yielded, 1);
	});

	test('aborts immediately when parent signal is already aborted', async () => {
		const parent = new AbortController();
		parent.abort();
		const request = newRequest(true, parent.signal);
		let called = 0;
		const newStream = async (): Promise<AsyncIterable<ChatStreamPart>> => {
			called++;
			return (async function* () { yield { type: 'text-delta', text: 'unused' } as ChatStreamPart; })();
		};

		const session = new ChatSession(request, newStream);
		const parts: ChatStreamPart[] = [];
		for await (const part of session.stream()) {
			parts.push(part);
		}

		assert.strictEqual(parts.length, 0);
		assert.strictEqual(called, 0);
	});
});
