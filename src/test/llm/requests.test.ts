import * as assert from 'assert';
import * as vscode from 'vscode';
import { ChatRequest, ChatRequestBuilder, type ChatIntent } from '../../llm/requests';

suite('ChatRequestBuilder.fromIntent', () => {
	const baseIntent: ChatIntent = {
		documentUri: vscode.Uri.parse('file://test/document.md'),
		userInput: 'Hello Copilot',
	};

	test('includes metadata snapshot and merged copilot options', async () => {
		const intent: ChatIntent = {
			...baseIntent,
			overrides: {
				copilotOptions: {
					temperature: 0.2,
				},
			},
		};

		const builder = await ChatRequestBuilder.fromIntent(intent);
		const request = builder.build();

		assert.strictEqual(request.copilotOptions.temperature, 0.2);
	});

	test('appends extra user content when overrides specify userAppend', async () => {
		const intent: ChatIntent = {
			...baseIntent,
			overrides: { userAppend: 'Second message' },
		};

		const builder = await ChatRequestBuilder.fromIntent(intent);
		const request = builder.build();

		const userMessages = request.messages.filter(message => message.role === 'user');
		assert.strictEqual(userMessages.length, 2);
		assert.strictEqual(userMessages[1].content, 'Second message');
	});

	test('ChatRequest.fromIntent returns same content as builder', async () => {
		const intent: ChatIntent = {
			...baseIntent,
			overrides: { copilotOptions: { temperature: 0.7 } },
		};

		const builder = await ChatRequestBuilder.fromIntent(intent);
		const built = builder.build();
		const direct = await ChatRequest.fromIntent(intent);

		assert.deepStrictEqual(direct.messages, built.messages);
		assert.deepStrictEqual(direct.copilotOptions, built.copilotOptions);
		assert.strictEqual(direct.toolContext.documentUri.toString(), built.toolContext.documentUri.toString());
		assert.deepStrictEqual([...direct.toolContext.definitions], [...built.toolContext.definitions]);
	});
});
