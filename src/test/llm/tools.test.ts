import { dynamicTool, jsonSchema } from 'ai';
import * as assert from 'assert';
import type { JSONSchema7 } from 'json-schema';
import * as vscode from 'vscode';
import type { ToolDefinition } from '../../llm';
import { ToolContext } from '../../llm';
import { ChatRequestBuilder, type ChatIntent, type ChatRequest } from '../../llm/requests';
import type { ChatSession } from '../../llm/sessions';
import { ToolProvider } from '../../llm/tools';
import * as config from '../../utils/configuration';

const emptyParameters: JSONSchema7 = { type: 'object', properties: {}, additionalProperties: false };

async function loadToolDocumentStub(toolDocumentUri: vscode.Uri): Promise<{ tool: ToolDefinition; documentText: string; }> {
	const tool: ToolDefinition = {
		name: 'customTool',
		kind: 'document',
		documentUri: toolDocumentUri,
		description: 'Stub tool',
		parameters: emptyParameters,
	};
	return { tool, documentText: "" };
}

type CreateChatSessionStub = (request: ChatRequest) => ChatSession;

suite('ToolProvider', () => {
	test('executeCustomTool routes through ChatRequestBuilder.fromIntent', async () => {
		const documentUri = vscode.Uri.parse('file://workspace/tool.md');
		const capturedIntents: ChatIntent[] = [];
		const builderFactory = async (intent: ChatIntent): Promise<ChatRequestBuilder> => {
			capturedIntents.push(intent);
			return {
				build: () => ({
					messages: [{ role: 'user', content: intent.userInput }],
					copilotOptions: { temperature: 0.42 },
					toolContext: new ToolContext(intent.documentUri),
					toolProvider: intent.overrides?.toolProvider as ToolProvider ?? new ToolProvider(),
				}),
			} as ChatRequestBuilder;
		};

		const newChatSessionCalls: { request: ChatRequest; }[] = [];
		let disposeCalled = 0;
		const newChatSessionStub: CreateChatSessionStub = request => {
			newChatSessionCalls.push({ request });
			return {
				resultText: async () => JSON.stringify({ final_answer: 'nested-result' }),
				dispose: () => { disposeCalled++; },
			} as unknown as ChatSession;
		};

		const provider = new ToolProvider(builderFactory, newChatSessionStub, loadToolDocumentStub);
		const definition: ToolDefinition = {
			name: 'customTool',
			kind: 'document',
			documentUri,
			description: 'Stub tool',
			parameters: emptyParameters,
		};

		const result = await (provider as unknown as {
			executeCustomTool: (
				parentSnapshot: ToolContext,
				definition: ToolDefinition,
				args: Record<string, unknown>,
			) => Promise<string>;
		}).executeCustomTool(new ToolContext(documentUri), definition, { input: 'value' });

		assert.strictEqual(result, 'nested-result');
		assert.strictEqual(capturedIntents.length, 1);
		const [intent] = capturedIntents;
		assert.strictEqual(intent.documentUri.toString(), documentUri.toString());
		assert.ok(intent.userInput.includes('copilot-tool-parameters'));

		assert.strictEqual(newChatSessionCalls.length, 1);
		const [{ request }] = newChatSessionCalls;
		const firstMessageContent = request.messages[0]?.content as string;
		assert.strictEqual(firstMessageContent, intent.userInput);
		assert.strictEqual(request.copilotOptions.temperature, 0.42);
		assert.strictEqual(request.toolContext.documentUri.toString(), documentUri.toString());
		assert.strictEqual(request.toolProvider, provider);
		assert.strictEqual(disposeCalled, 1);
	});

	test('@web_search resolves to provider tool for OpenAI Responses backend', async () => {
		const originalGet = (config as { get: () => unknown; }).get;
		const restore = () => { (config as { get: () => unknown; }).get = originalGet; };
		(config as { get: () => unknown; }).get = () => ({
			backendProtocol: 'OpenAI Responses',
			backendBaseUrl: 'https://api.openai.com/v1',
			backendApiKey: 'sk-test',
			optionsModelResolved: 'gpt-5',
			optionsTemperature: 0,
		});

		try {
			const provider = new ToolProvider();
			const toolContext = new ToolContext(vscode.Uri.parse('file://workspace/doc.md'));
			const tools = await provider.resolveToolText(toolContext, 'web_search');

			assert.strictEqual(tools[0]?.name, 'web_search');
			const definition = toolContext.definitions.get('web_search');
			assert.ok(definition);
			assert.strictEqual(definition?.kind, 'provider');

			const webSearchTool = dynamicTool({
				description: 'stub web search',
				inputSchema: jsonSchema({ type: 'object' }),
				execute: async () => '',
			});
			const toolSet = provider.newToolSet(toolContext, { webSearch: () => webSearchTool });
			assert.strictEqual(toolSet.web_search, webSearchTool);
		} finally {
			restore();
		}
	});

	test('@web_search fails for unsupported backend', async () => {
		const originalGet = (config as { get: () => unknown; }).get;
		const restore = () => { (config as { get: () => unknown; }).get = originalGet; };
		(config as { get: () => unknown; }).get = () => ({
			backendProtocol: 'Ollama',
			backendBaseUrl: undefined,
			backendApiKey: undefined,
			optionsModelResolved: 'ollama',
			optionsTemperature: 0,
		});

		try {
			const provider = new ToolProvider();
			const toolContext = new ToolContext(vscode.Uri.parse('file://workspace/doc.md'));
			await assert.rejects(
				() => provider.resolveToolText(toolContext, '@web_search'),
			);
		} finally {
			restore();
		}
	});

	test('ChatRequestBuilder clones tool definitions', () => {
		const documentUri = vscode.Uri.parse('file://workspace/doc.md');
		const originalDefinition: ToolDefinition = {
			name: 'web_search',
			kind: 'provider',
		};
		const toolContext = new ToolContext(documentUri, new Map([
			['web_search', originalDefinition],
		]));

		const provider = new ToolProvider(); // placeholder to satisfy constructor
		const requestBuilder = new ChatRequestBuilder(documentUri, false, provider, toolContext);
		const request = requestBuilder.build();

		const builtDefinition = request.toolContext.definitions.get('web_search');
		assert.ok(builtDefinition);
		assert.notStrictEqual(builtDefinition, originalDefinition);
	});
});
