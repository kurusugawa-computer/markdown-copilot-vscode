import * as vscode from 'vscode';

// Store the output channel instance
export let logger: vscode.LogOutputChannel;

export function initialize() {
	logger = vscode.window.createOutputChannel("Markdown Copilot", { log: true });
	return logger;
}
