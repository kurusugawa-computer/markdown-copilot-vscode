import chardet from 'chardet';
import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { resolveFragmentUri } from ".";


export async function toolTextToTools(documentUri: vscode.Uri, toolText: string): Promise<OpenAI.ChatCompletionTool[]> {
	if (toolText.startsWith('@')) {
		const builtinToolsKey = toolText.slice(1);
		const builtinTools = BUILTIN_TOOLS[builtinToolsKey];
		if (!builtinTools) {
			throw new Error(`Undefined preset tool: ${builtinToolsKey}. Available presets: ${Object.keys(BUILTIN_TOOLS).join(", ")}`);
		}
		return builtinTools;
	}
	const _toolDefinitionText = await fsReadFile(documentUri, toolText);
	return [] as OpenAI.ChatCompletionTool[];
}

export async function executeToolFunction(documentUri: vscode.Uri, toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function): Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
	const args = JSON.parse(toolCallFunction.arguments || 'null');
	switch (toolCallFunction.name) {
		case "eval_js":
			return evaluateJavaScriptCode(args.code);
		case "web_fetch":
			return webFetch(args.url, args.method, args.request_body);
		case "fs_read_file":
			return fsReadFile(documentUri, args.path);
		case "fs_read_dir":
			return fsReadDir(documentUri, args.path);
		default:
			return `Not implemented tool: ${toolCallFunction.name}`;
	}
}

async function webFetch(url: string, method: string, body: string | null) {
	const response = await fetch(url, { method, body });
	const buffer = await response.arrayBuffer();
	const encoding = chardet.detect(new Uint8Array(buffer));
	if (encoding === null) { return ''; }
	return new TextDecoder(encoding).decode(buffer);
}

async function fsReadFile(documentUri: vscode.Uri, path: string) {
	const fileUri = resolveFragmentUri(documentUri, path);
	const buffer = await vscode.workspace.fs.readFile(fileUri);
	const encoding = chardet.detect(buffer);
	if (encoding === null) { return ''; }
	return new TextDecoder(encoding).decode(buffer);
}

enum FileTypeString {
	Unknown = "unknown",
	File = "file",
	Directory = "dir",
	SymbolicLink = "symlink",
}

function toFileTypeString(type: vscode.FileType): FileTypeString {
	switch (type) {
		case vscode.FileType.File: return FileTypeString.File;
		case vscode.FileType.Directory: return FileTypeString.Directory;
		case vscode.FileType.SymbolicLink: return FileTypeString.SymbolicLink;
		default: return FileTypeString.Unknown;
	}
}

async function fsReadDir(documentUri: vscode.Uri, path: string) {
	const directoryUri = resolveFragmentUri(documentUri, path);
	const entries = await vscode.workspace.fs.readDirectory(directoryUri);
	const entriesWithStats = await Promise.all(entries.map(async ([name, type]) => {
		const entryUri = vscode.Uri.joinPath(directoryUri, name);
		const stat = await vscode.workspace.fs.stat(entryUri);
		return [name, {
			type: toFileTypeString(type),
			size: stat.size,
			mtime: new Date(stat.mtime).toISOString(),
		}];
	}));
	return JSON.stringify(Object.fromEntries(entriesWithStats));
}

async function evaluateJavaScriptCode(code: string) {
	// eslint-disable-next-line no-eval
	return String(eval(code));
}


const BUILTIN_TOOLS: { [key: string]: OpenAI.ChatCompletionTool[] } = {
	"file": [
		{
			type: "function",
			function: {
				name: "fs_read_file",
				description: "Reads the content of a file at the specified path.",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "The path to the file to read."
						}
					},
					required: ["path"],
					additionalProperties: false
				}
			}
		},
		{
			type: "function",
			function: {
				name: "fs_read_dir",
				description: "Lists the content in a directory at the specified path.",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "The path to the directory to list."
						}
					},
					required: ["path"],
					additionalProperties: false
				}
			}
		}
	],
	"web": [
		{
			type: "function",
			function: {
				name: "web_fetch",
				description: "Fetches content from the specified web URL.",
				parameters: {
					type: "object",
					properties: {
						url: {
							type: "string",
							description: "The URL to fetch content from."
						},
						method: {
							type: "string",
							description: "The HTTP method to use for the request.",
							enum: ["GET", "POST", "PUT", "DELETE"]
						},
						request_body: {
							type: "string",
							nullable: true,
							description: "The body of the request."
						}
					},
					required: ["url", "method"],
					additionalProperties: false
				}
			}
		}
	],
	"eval": [
		{
			type: "function",
			function: {
				name: "eval_js",
				description: "Evaluates JavaScript code.",
				parameters: {
					type: "object",
					properties: {
						code: {
							type: "string",
							description: "The JavaScript code to evaluate."
						}
					},
					required: ["code"],
					additionalProperties: false
				}
			}
		}
	]
};
