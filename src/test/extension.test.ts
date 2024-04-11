import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import * as copilot from '../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Configuration', () => {
		const configuration = vscode.workspace.getConfiguration();
		assert.strictEqual(0.5, configuration.get<number>("markdown.copilot.decorations.inactiveContextOpacity"));
		assert.strictEqual("", configuration.get<string>("markdown.copilot.openAI.apiKey"));
		assert.strictEqual("gpt-4-turbo", configuration.get<string>("markdown.copilot.openAI.model"));
		assert.strictEqual(0.1, configuration.get<number>("markdown.copilot.options.temperature"));
	});

	test("countChar", () => {
		assert.strictEqual(6, copilot.countChar("Hello!"));
		assert.strictEqual(6, copilot.countChar("こんにちは！"));
		assert.strictEqual(1, copilot.countChar("🌟"));
		assert.strictEqual(2, "🌟".length);
	});
});
