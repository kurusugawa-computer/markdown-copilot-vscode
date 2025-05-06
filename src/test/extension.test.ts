import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as utils from '../utils';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Configuration', () => {
		const configuration = vscode.workspace.getConfiguration();
		assert.strictEqual(0.5, configuration.get<number>("markdown.copilot.context.inactiveOpacity"));
		assert.strictEqual("", configuration.get<string>("markdown.copilot.backend.apiKey"));
		assert.strictEqual("gpt-4o", configuration.get<string>("markdown.copilot.options.model"));
		assert.strictEqual(0.1, configuration.get<number>("markdown.copilot.options.temperature"));
	});

	test("countChar", () => {
		assert.strictEqual(6, utils.countChar("Hello!"));
		assert.strictEqual(6, utils.countChar("こんにちは！"));
		assert.strictEqual(1, utils.countChar("🌟"));
		assert.strictEqual(2, "🌟".length);
	});
});
