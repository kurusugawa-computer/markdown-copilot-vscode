import * as vscode from 'vscode';

// Store the output channel instance
const logLevelEmitter = new vscode.EventEmitter<vscode.LogLevel>();

export let logger: vscode.LogOutputChannel = {
	name: "Dummy Logger",
	logLevel: vscode.LogLevel.Info,
	onDidChangeLogLevel: logLevelEmitter.event,
	trace: (message, ...args: unknown[]) => console.trace(message, ...args),
	debug: (message, ...args: unknown[]) => console.debug(message, ...args),
	info: (message, ...args: unknown[]) => console.info(message, ...args),
	warn: (message, ...args: unknown[]) => console.warn(message, ...args),
	error: (message, ...args: unknown[]) => console.error(message, ...args),
	append: (value: string) => console.info(value),
	appendLine: (value: string) => console.info(value),
	replace: (value: string) => console.info(value),
	clear: () => console.clear(),
	show: () => {
		// no-op for fallback logger
	},
	hide: () => {
		// no-op for fallback logger
	},
	dispose: () => {
		// no-op for fallback logger
	},
};

export function initialize() {
	logger = vscode.window.createOutputChannel("Markdown Copilot", { log: true });
	return logger;
}
