import chardet from 'chardet';
import { OpenAI } from 'openai';
import path from 'path';
import * as vscode from 'vscode';
import { resolveFragmentUri, resolveRootUri, splitLines } from ".";
import { ChatMessageBuilder, executeChatCompletionWithTools } from './llm';
import { logger } from './logging';
import { parseFunctionSignature } from './signatureParser';
import { invokeVscodeLanguageModelTool, isVscodeLanguageModelToolAvailable, listVscodeLanguageModelTools } from './vscodeLlmTools';

class ToolContent {
	toolName: string;
	chatCompletionTool: OpenAI.ChatCompletionTool;
	toolDocumentText: string;

	private constructor(toolName: string, chatCompletionTool: OpenAI.ChatCompletionTool, toolDocumentText: string) {
		this.toolName = toolName;
		this.chatCompletionTool = chatCompletionTool;
		this.toolDocumentText = toolDocumentText;
	}

	static async create(toolDocumentUri: vscode.Uri): Promise<ToolContent> {
		let toolDocumentText: string;
		try {
			toolDocumentText = await fsReadFile(toolDocumentUri);
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message : String(e);
			throw new Error(`[copilot-tool-definition] Failed to read file: ${toolDocumentUri}. Error: ${errorMessage}`);
		}

		const match = toolDocumentText.match(/```(ts|typescript) +copilot-tool-definition\n([^]*?)\n```/m);
		if (!match) {
			throw new Error(`[copilot-tool-definition] TypeScript block not found: ${toolDocumentUri}`);
		}
		toolDocumentText = toolDocumentText.replace(match[0], "");

		let functionDefinition: OpenAI.FunctionDefinition | undefined;
		try {
			functionDefinition = parseFunctionSignature(match[2]);
		} catch {
			throw new Error(`[copilot-tool-definition] TypeScript block is not valid: ${toolDocumentUri}`);
		}

		if (functionDefinition.name === 'anonymous') {
			functionDefinition.name = ToolContent.toSafeFunctionName(toolDocumentUri);
		}

		const paramsMatch = toolDocumentText.match(/```json +copilot-tool-parameters\r?\n([^]*?)\r?\n```/m);
		if (paramsMatch) {
			toolDocumentText = toolDocumentText.replace(paramsMatch[0], "");
		}

		const chatCompletionTool: OpenAI.ChatCompletionTool = {
			type: "function",
			function: functionDefinition,
		};

		return new ToolContent(functionDefinition.name, chatCompletionTool, toolDocumentText);
	}

	private static toSafeFunctionName(toolDocumentUri: vscode.Uri): string {
		// replace path separators (`/` or `\`) with underscores
		// and replace spaces with hyphens
		const safeFunctionName = toolDocumentUri.path.replace(/[/\\]/g, "_").replace(/[ .]/g, "-");
		if (!/^[a-zA-Z0-9_-]+$/.test(safeFunctionName)) {
			throw new Error(`[copilot-tool-definition] Invalid function name derived from path: ${toolDocumentUri.path}. Only \`[a-zA-Z0-9_-]\` characters are allowed.`);
		}

		// return last 64 characters to avoid too long function names
		if (safeFunctionName.length > 64) {
			return safeFunctionName.slice(-64);
		}
		return safeFunctionName;
	}
};

export class ToolDefinition {
	readonly toolDocumentUri: vscode.Uri;
	private weakRef: WeakRef<ToolContent>;

	private constructor(toolDocumentUri: vscode.Uri, toolContent: ToolContent) {
		this.toolDocumentUri = toolDocumentUri;
		this.weakRef = new WeakRef<ToolContent>(toolContent);
	}

	get toolContent(): Promise<ToolContent> {
		const toolContent = this.weakRef.deref();
		if (toolContent !== undefined) {
			return Promise.resolve(toolContent);
		}
		return ToolContent.create(this.toolDocumentUri).then(newToolContent => {
			this.weakRef = new WeakRef<ToolContent>(newToolContent);
			return newToolContent;
		});
	}

	static async create(toolDocumentUri: vscode.Uri): Promise<ToolDefinition> {
		return new ToolDefinition(toolDocumentUri, await ToolContent.create(toolDocumentUri));
	}
}

export type ToolDefinitions = Map<string, ToolDefinition>;
export interface ToolContext {
	documentUri: vscode.Uri;
	toolDefinitions: ToolDefinitions;
}

export async function toolTextToTools(toolContext: ToolContext, toolText: string): Promise<OpenAI.ChatCompletionTool[]> {
	if (toolText.startsWith('@')) {
		const builtinToolsKey = toolText.slice(1);
		const builtinTools = BUILTIN_TOOLS[builtinToolsKey];
		if (!builtinTools) {
			throw new Error(`[tool-text-to-tools] Undefined builtin tool: ${builtinToolsKey}. Available builtin tools: ${Object.keys(BUILTIN_TOOLS).join(", ")}`);
		}
		return builtinTools;
	}

	if (toolText.startsWith('^')) {
		const vscodeLanguageModelTools = listVscodeLanguageModelTools(toolText);
		if (vscodeLanguageModelTools.length === 0) {
			throw new Error(`[tool-text-to-tools] Undefined VSCode language model tool prefix: ${toolText}`);
		}
		return vscodeLanguageModelTools;
	}

	const { documentUri, toolDefinitions } = toolContext;
	const toolDocumentUri = resolveFragmentUri(documentUri, toolText);
	const toolDefinition = await ToolDefinition.create(toolDocumentUri);
	const toolContent = await toolDefinition.toolContent;

	const storedToolDefinition = toolDefinitions.get(toolContent.toolName);
	if (storedToolDefinition !== undefined) {
		logger.info(`[tool-text-to-tools] ${toolContent.toolName} already defined: ${storedToolDefinition.toolDocumentUri}. Overwriting with ${toolDocumentUri}`);
	}

	toolDefinitions.set(toolContent.toolName, toolDefinition);

	return [toolContent.chatCompletionTool];
}

export async function invokeToolFunction(
	toolContext: ToolContext,
	toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function
): Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
	const args = JSON.parse(toolCallFunction.arguments || 'null');
	switch (toolCallFunction.name) {
		case "eval_js":
			return evaluateJavaScriptCode(args.code);
		case "web_request":
			return webRequest(args.url, args.method, args.request_body);
		case "fs_read_file":
			return fsReadFile(resolveFragmentUri(toolContext.documentUri, args.path), args.startLineNumberBaseZero, args.endLineNumberBaseZero);
		case "fs_read_dir":
			return fsReadDir(resolveFragmentUri(toolContext.documentUri, args.path));
		case "fs_find_files": {
			const isUntitledDocument = toolContext.documentUri.scheme === 'untitled';
			const results = await fsFindFiles(
				isUntitledDocument
					? resolveRootUri()
					: vscode.Uri.joinPath(toolContext.documentUri, ".."),
				args.include,
				args.exclude,
				args.max_results,
			);
			if (isUntitledDocument) {
				return JSON.stringify(results.map(result => path.join('/', result)));
			}
			return JSON.stringify(results);
		}
		default: {
			const toolDefinition = toolContext.toolDefinitions.get(toolCallFunction.name);
			if (toolDefinition) {
				return executeToolDefinition(toolContext, toolDefinition, args);
			}
			if (isVscodeLanguageModelToolAvailable(toolCallFunction)) {
				return invokeVscodeLanguageModelTool(toolCallFunction, args);
			}
		}
	}
	throw new Error(`[invoke] Undefined tool function: ${toolCallFunction.name}`);
}

async function webRequest(url: string, method: string, body: string | null) {
	const response = await fetch(url, { method, body });
	const buffer = await response.arrayBuffer();
	const encoding = chardet.detect(new Uint8Array(buffer)) || 'utf-8';
	return new TextDecoder(encoding).decode(buffer);
}

async function fsReadFile(fileUri: vscode.Uri, startLineNumberBaseZero: number = 0, endLineNumberBaseZero: number = -1): Promise<string> {
	const buffer = await vscode.workspace.fs.readFile(fileUri);
	const encoding = chardet.detect(buffer) || 'utf-8';

	const fileContent = new TextDecoder(encoding).decode(buffer);
	if (startLineNumberBaseZero === 0 && endLineNumberBaseZero === -1) {
		return fileContent;
	}

	const lines = splitLines(fileContent);
	if (endLineNumberBaseZero < 0) {
		return lines.slice(startLineNumberBaseZero).join('\n');
	}
	return lines.slice(startLineNumberBaseZero, endLineNumberBaseZero + 1).join('\n');
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

async function fsReadDir(directoryUri: vscode.Uri) {
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

async function fsFindFiles(directoryUri: vscode.Uri, include: vscode.GlobPattern, exclude?: vscode.GlobPattern, maxResults?: number) {
	const directoryPath = directoryUri.fsPath;
	const result = await vscode.workspace.findFiles(include, exclude, maxResults);
	return result.map(uri => path.relative(directoryPath, uri.fsPath));
}

async function evaluateJavaScriptCode(code: string) {
	// eslint-disable-next-line no-eval
	return String(eval(code));
}

async function executeToolDefinition(
	parentToolContext: ToolContext,
	toolDefinition: ToolDefinition,
	args: { [key: string]: string | number | boolean | null },
): Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
	const toolContent = await toolDefinition.toolContent;
	const documentUri = parentToolContext.documentUri;
	args.current_document_uri = `${documentUri}`;
	args.current_date_time = new Date().toISOString();

	const toolParameterInjectionText = "```json copilot-tool-parameters\n" + JSON.stringify(args) + "\n```\n" + toolContent.toolDocumentText;
	const chatMessageBuilder = new ChatMessageBuilder(toolDefinition.toolDocumentUri, false);
	await chatMessageBuilder.addLines(splitLines(toolParameterInjectionText));

	const { chatMessages, copilotOptions, toolContext } = chatMessageBuilder.build();

	copilotOptions.stream = false;
	if (copilotOptions.response_format === undefined) {
		copilotOptions.response_format = DEFAULT_RESPONSE_FORMAT;
	}

	const chunkTexts: string[] = []
	await executeChatCompletionWithTools(
		chatMessages,
		copilotOptions,
		toolContext,
		async chunkText => { chunkTexts.push(chunkText) },
	);

	const joinedText = chunkTexts.join("");
	logger.debug("[execute] response:", joinedText);

	try {
		const resultJson: { final_answer: string } = JSON.parse(joinedText);
		return resultJson.final_answer;
	} catch {
		throw new Error(`[execute] ${toolDefinition.toolDocumentUri} returns unexpected response. Expected JSON object with 'final_answer' property.\n\`\`\`\n${joinedText}\n\`\`\``);
	}
}


const DEFAULT_RESPONSE_FORMAT: OpenAI.ResponseFormatJSONSchema = {
	type: "json_schema",
	json_schema: {
		name: "live_reasoning",
		schema: {
			description: "Defines the JSON structure returned",
			type: "object",
			properties: {
				think: {
					description: "Outputs the thinking process or memo as an array",
					type: "array",
					items: { type: "string" }
				},
				final_answer: {
					description: "The final answer output",
					type: "string"
				}
			},
			required: ["think", "final_answer"],
			additionalProperties: false
		},
		strict: true
	}
};

const BUILTIN_TOOLS: { [key: string]: OpenAI.ChatCompletionTool[] } = {
	"file": [
		{
			type: "function",
			function: {
				name: "fs_read_file",
				description: "Reads and returns the content of a file",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Path to the file, relative to the current document or absolute"
						},
						startLineNumberBaseZero: {
							type: "number",
							description: "The line number to start reading from, 0-based."
						},
						endLineNumberBaseZero: {
							type: "number",
							description: "The inclusive line number to end reading at, 0-based."
						},
					},
					required: ["path", "startLineNumberBaseZero"],
					additionalProperties: false
				}
			}
		},
		{
			type: "function",
			function: {
				name: "fs_read_dir",
				description: "Lists files and directories at the specified path",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Path to the directory, relative to the current document or absolute"
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
				name: "fs_find_files",
				description: "Search for files in the workspace by matching against a glob pattern. The result does not contain directories. Glob patterns support wildcards (e.g., `*`, `?`, `**`) for matching file paths. For example, `**/*.{ts,js}` matches all .ts and .js files recursively.",
				parameters: {
					type: "object",
					properties: {
						include: {
							type: "string",
							description: "Specifies a glob pattern for files to include. Use a relative pattern to restrict the search to a particular folder."
						},
						exclude: {
							type: "string",
							description: "Specifies a glob pattern for files or folders to exclude. When undefined, defaults are used. When null, no excludes apply."
						},
						max_results: {
							type: "integer",
							description: "Optional maximum number of files to return."
						}
					},
					required: ["include"],
					additionalProperties: false
				}
			}
		}
	],
	"web": [
		{
			type: "function",
			function: {
				name: "web_request",
				description: "Performs an HTTP request to a specified URL. This tool is useful for making API calls or fetching data from web.",
				parameters: {
					type: "object",
					properties: {
						url: {
							type: "string",
							description: "URL to request"
						},
						method: {
							type: "string",
							description: "HTTP method for the request",
							enum: ["GET", "POST", "PUT", "DELETE"]
						},
						request_body: {
							type: "string",
							nullable: true,
							description: "Optional body for POST/PUT requests"
						}
					},
					required: ["url", "method"],
					additionalProperties: false
				}
			}
		}
	],
	"eval!": [
		{
			type: "function",
			function: {
				name: "eval_js",
				description: "Evaluates JavaScript code and returns the result as a string",
				parameters: {
					type: "object",
					properties: {
						code: {
							type: "string",
							description: "JavaScript code to evaluate"
						}
					},
					required: ["code"],
					additionalProperties: false
				}
			}
		}
	]
};
