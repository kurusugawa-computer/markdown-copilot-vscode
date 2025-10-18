import { dynamicTool, jsonSchema, ToolSet } from 'ai';
import chardet from 'chardet';
import type { JSONSchema7 } from 'json-schema';
import path from 'path';
import * as vscode from 'vscode';
import type { ToolDefinition } from '.';
import { ToolContext } from '.';
import { resolveFragmentUri, resolveRootUri, splitLines } from '../utils';
import { logger } from '../utils/logging';
import { parseFunctionSignature, type ToolFunctionDefinition } from '../utils/signatureParser';
import type { ProviderToolFactories } from './providers';
import { ChatIntent, ChatRequest, ChatRequestBuilder } from './requests';
import { ChatSession } from './sessions';

const EMPTY_OBJECT_SCHEMA: JSONSchema7 = {
	type: "object",
	properties: {},
	additionalProperties: false,
};

const BUILTIN_TOOL_SCHEMAS: Record<string, ToolDefinition> = {
	context_summary_and_new: {
		name: "context_summary_and_new",
		kind: "builtin",
		description: "Summarizes the current conversation context and starts a new context based on the summary.",
		parameters: EMPTY_OBJECT_SCHEMA,
	},
	context_reset_and_new: {
		name: "context_reset_and_new",
		kind: "builtin",
		description: "Resets the current conversation context and starts a new one.",
		parameters: EMPTY_OBJECT_SCHEMA,
	},
	fs_read_file: {
		name: "fs_read_file",
		kind: "builtin",
		description: "Reads and returns the content of a file.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to the file, relative to the current document or absolute." },
				startLineNumberBaseZero: { type: "number", description: "Line number to start reading from (0-based)." },
				endLineNumberBaseZero: { type: "number", description: "Inclusive line number to end reading at (0-based)." },
			},
			required: ["path", "startLineNumberBaseZero"],
			additionalProperties: false,
		},
	},
	fs_read_dir: {
		name: "fs_read_dir",
		kind: "builtin",
		description: "Lists files and directories at the specified path.",
		parameters: {
			type: "object",
			properties: {
				path: { type: "string", description: "Path to the directory, relative to the current document or absolute." },
			},
			required: ["path"],
			additionalProperties: false,
		},
	},
	fs_find_files: {
		name: "fs_find_files",
		kind: "builtin",
		description: "Searches for files in the workspace by matching against a glob pattern.",
		parameters: {
			type: "object",
			properties: {
				include: { type: "string", description: "Glob pattern for files to include." },
				exclude: { type: "string", description: "Glob pattern for files or folders to exclude." },
				max_results: { type: "number", description: "Limits the number of results." }
			},
			required: ["include"],
			additionalProperties: false,
		},
	},
	eval_js: {
		name: "eval_js",
		kind: "builtin",
		description: "Evaluates JavaScript code and returns the result as a string.",
		parameters: {
			type: "object",
			properties: {
				code: { type: "string", description: "JavaScript code to evaluate." }
			},
			required: ["code"],
			additionalProperties: false,
		},
	},
	web_request: {
		name: "web_request",
		kind: "builtin",
		description: "Performs an HTTP request and returns the response body.",
		parameters: {
			type: "object",
			properties: {
				url: { type: "string", description: "The URL to request." },
				method: { type: "string", description: "HTTP method to use. Defaults to GET." },
				request_body: { type: ["string", "null"], description: "Optional request body." },
			},
			required: ["url"],
			additionalProperties: false,
		},
	},
	web_search: {
		name: "web_search",
		kind: "provider",
	},
};

const BUILTIN_GROUPS: Record<string, readonly ToolDefinition[]> = {
	"context": [
		BUILTIN_TOOL_SCHEMAS.context_summary_and_new,
		BUILTIN_TOOL_SCHEMAS.context_reset_and_new,
	],
	"file": [
		BUILTIN_TOOL_SCHEMAS.fs_read_file,
		BUILTIN_TOOL_SCHEMAS.fs_read_dir,
		BUILTIN_TOOL_SCHEMAS.fs_find_files,
	],
	"eval!": [
		BUILTIN_TOOL_SCHEMAS.eval_js,
	],
	"web": [
		BUILTIN_TOOL_SCHEMAS.web_search,
	],
};

const unavailableCopilotToolNames = new Set([
	"copilot_searchCodebase",
	"copilot_getVSCodeAPI",
	"copilot_think",
	"copilot_runInTerminal",
	"copilot_getTerminalOutput",
	"copilot_getChangedFiles",
	"copilot_testFailure",
	"copilot_runTests",
	"copilot_getTerminalSelection",
	"copilot_getTerminalLastCommand",
	"copilot_createNewWorkspace",
	"copilot_getProjectSetupInfo",
	"copilot_installExtension",
	"copilot_createNewJupyterNotebook",
	"copilot_runVsCodeTask",
	"copilot_insertEdit",
	"copilot_findTestFiles",
	"copilot_getSearchResults",
]);

const enum PromptNodeType {
	Piece = 1,
	Text = 2,
}

const enum PieceCtorKind {
	BaseChatMessage = 1,
	TextPart = 2,
	ExtraData = 3,
}

interface TextJSON {
	type: PromptNodeType.Text;
	text: string;
	priority: number | undefined;
	lineBreakBefore: boolean | undefined;
}

interface PieceJSON {
	ctor: PieceCtorKind;
	content: TextJSON | { key: string; value: string; } | undefined;
	aggregation: number | undefined;
}

interface PromptElementJSON {
	node: PromptNodeJSON;
}

type PromptNodeJSON = TextJSON | PieceJSON;

function stringifyPromptNodeJSON(node: PromptNodeJSON, parts: string[]): void {
	if ((node as TextJSON).type === PromptNodeType.Text) {
		parts.push((node as TextJSON).text);
		return;
	}

	const piece = node as PieceJSON;
	if (piece.ctor === PieceCtorKind.TextPart && piece.content && 'value' in piece.content) {
		parts.push(piece.content.value);
	}
}

type NewChatRequestBuilder = (intent: ChatIntent) => Promise<ChatRequestBuilder>;
type NewChatSession = (request: ChatRequest) => ChatSession;

export class ToolProvider {
	private readonly newChatRequestBuilder: NewChatRequestBuilder;
	private readonly newChatSession: NewChatSession;
	private readonly loadToolDocument: typeof loadToolDocument;

	constructor(
		newChatRequestBuilder: NewChatRequestBuilder = ChatRequestBuilder.fromIntent,
		newChatSession: NewChatSession = request => new ChatSession(request),
		toolDocumentLoader = loadToolDocument,
	) {
		this.newChatRequestBuilder = newChatRequestBuilder;
		this.newChatSession = newChatSession;
		this.loadToolDocument = toolDocumentLoader;
	}

	async resolveToolText(toolContext: ToolContext, toolText: string): Promise<ToolDefinition[]> {
		if (toolText.startsWith('@')) {
			const key = toolText.slice(1);
			const group = BUILTIN_GROUPS[key];
			if (!group) {
				throw new Error(`[tool-text-to-tools] Undefined builtin tool group: ${key}. Available groups: ${Object.keys(BUILTIN_GROUPS).join(", ")}`);
			}
			group.forEach(tool => toolContext.definitions.set(tool.name, tool));
			return [...group];
		}

		if (toolText.startsWith('^')) {
			return this.listVscodeLanguageModelTools(toolContext, toolText);
		}

		const builtin = BUILTIN_TOOL_SCHEMAS[toolText];
		if (builtin) {
			this.registerBuiltinTool(toolContext, builtin);
			return [builtin];
		}

		return [await this.registerCustomTool(toolContext, toolText)];
	}

	newToolSet(toolContext: ToolContext, toolFactories?: ProviderToolFactories): ToolSet {
		const tools: ToolSet = {};
		for (const definition of toolContext.definitions.values()) {
			if (definition.kind === 'provider') {
				if (toolFactories?.webSearch && definition.name === 'web_search') {
					tools[definition.name] = toolFactories.webSearch();
				}
				continue;
			}
			tools[definition.name] = dynamicTool({
				description: definition.description,
				inputSchema: jsonSchema(definition.parameters ?? EMPTY_OBJECT_SCHEMA),
				execute: async (input: unknown, options) => this.executeTool(
					toolContext,
					definition,
					input as Record<string, unknown>,
					options.abortSignal,
				),
			});
		}
		return tools;
	}

	private registerBuiltinTool(toolContext: ToolContext, schema: ToolDefinition) {
		toolContext.definitions.set(schema.name, schema);
	}

	private async registerCustomTool(toolContext: ToolContext, toolText: string): Promise<ToolDefinition> {
		const toolDocumentUri = resolveFragmentUri(toolContext.documentUri, toolText);
		const { tool: spec } = await this.loadToolDocument(toolDocumentUri);

		const existingDefinition = toolContext.definitions.get(spec.name);
		if (existingDefinition) {
			const position = existingDefinition.kind === 'document'
				? existingDefinition.documentUri
				: existingDefinition.kind;
			logger.info(`[tool-text-to-tools] ${spec.name} already defined: ${position}. Overwriting with ${toolDocumentUri}`);
		}

		toolContext.definitions.set(spec.name, spec);

		return spec;
	}

	private async executeTool(
		toolContext: ToolContext,
		definition: ToolDefinition,
		args: Record<string, unknown>,
		abortSignal?: AbortSignal,
	): Promise<string> {
		logger.info(`[tool] invoke ${definition.name}:`, args);
		let result: string;
		switch (definition.kind) {
			case 'builtin':
				result = await this.executeBuiltinTool(toolContext, definition.name, args);
				break;
			case 'document':
				result = await this.executeCustomTool(toolContext, definition, args, abortSignal);
				break;
			case 'vscode':
				result = await this.invokeVscodeLanguageModelTool(definition.name, args);
				break;
			default:
				throw new Error(`[invoke] Undefined tool function: ${definition.name}`);
		}
		logger.debug(`[tool] finish ${definition.name}:`, result);
		return result;
	}

	private async executeBuiltinTool(
		toolContext: ToolContext,
		name: string,
		args: Record<string, unknown>,
	): Promise<string> {
		switch (name) {
			case "eval_js":
				return this.evaluateJavaScriptCode(String(args.code ?? ''));
			case "web_request":
				return this.webRequest(
					String(args.url ?? ''),
					typeof args.method === 'string' ? args.method : 'GET',
					typeof args.request_body === 'string' ? args.request_body : null,
				);
			case "fs_read_file":
				return this.fsReadFile(
					resolveFragmentUri(toolContext.documentUri, String(args.path ?? '')),
					typeof args.startLineNumberBaseZero === 'number' ? args.startLineNumberBaseZero : 0,
					typeof args.endLineNumberBaseZero === 'number' ? args.endLineNumberBaseZero : -1,
				);
			case "fs_read_dir":
				return this.fsReadDir(
					resolveFragmentUri(toolContext.documentUri, String(args.path ?? ''))
				);
			case "fs_find_files": {
				const include = String(args.include ?? '');
				const exclude = typeof args.exclude === 'string' ? args.exclude : undefined;
				const maxResults = typeof args.max_results === 'number' ? args.max_results : undefined;
				const isUntitledDocument = toolContext.documentUri.scheme === 'untitled';
				const baseUri = isUntitledDocument ? resolveRootUri() : vscode.Uri.joinPath(toolContext.documentUri, "..");
				const results = await this.fsFindFiles(baseUri, include, exclude, maxResults);
				return isUntitledDocument ? JSON.stringify(results.map(result => path.join('/', result))) : JSON.stringify(results);
			}
			case "context_summary_and_new":
			case "context_reset_and_new":
				return `Tool ${name} is reserved for future use.`;
			default:
				throw new Error(`[invoke] Undefined builtin tool: ${name}`);
		}
	}

	private async executeCustomTool(
		toolContext: ToolContext,
		definition: ToolDefinition & { kind: 'document' },
		args: Record<string, unknown>,
		abortSignal?: AbortSignal,
	): Promise<string> {
		if (!definition.documentUri) {
			throw new Error(`[execute] Tool definition ${definition.name} is missing documentUri.`);
		}

		const { documentText } = await this.loadToolDocument(definition.documentUri);
		const toolParameterInjectionText = "```json copilot-tool-parameters\n" + JSON.stringify({
			...args,
			current_document_uri: `${toolContext.documentUri}`,
			current_date_time: new Date().toISOString(),
		}) + "\n```\n" + documentText;

		const chatIntent: ChatIntent = {
			documentUri: definition.documentUri,
			userInput: toolParameterInjectionText,
			overrides: {
				copilotOptions: { stream: false },
				toolProvider: this,
			},
			abortSignal,
		};

		const builder = await this.newChatRequestBuilder(chatIntent);
		const request = builder.build();
		const session = this.newChatSession(request);
		let resultText: string;
		try {
			resultText = await session.resultText();
		} finally {
			session.dispose();
		}
		logger.debug("[execute] response:", resultText);

		try {
			const resultJson: { final_answer: string } = JSON.parse(resultText);
			return resultJson.final_answer;
		} catch {
			throw new Error(`[execute] ${definition.documentUri} returns unexpected response. Expected JSON object with 'final_answer' property.\n\`\`\`\n${resultText}\n\`\`\``);
		}
	}

	private listVscodeLanguageModelTools(toolContext: ToolContext, prefix: string): ToolDefinition[] {
		if (!vscode.lm) {
			return [];
		}

		const toolNameMatcher = prefix === "^copilot"
			? new RegExp("^copilot")
			: new RegExp(`^(?:[0-9a-f]+_${prefix.slice(1)}|${prefix.slice(1)})`);

		const tools = vscode.lm.tools
			.filter(tool => !unavailableCopilotToolNames.has(tool.name) && toolNameMatcher.test(tool.name));

		if (tools.length === 0) {
			throw new Error(`[tool-text-to-tools] Undefined VSCode language model tool prefix: ${prefix}`);
		}

		for (const tool of tools) {
			toolContext.definitions.set(tool.name, {
				name: tool.name,
				kind: 'vscode',
				description: tool.description,
				parameters: tool.inputSchema as JSONSchema7,
			});
		}

		return tools.map(tool => ({
			name: tool.name,
			kind: "vscode",
			description: tool.description,
			parameters: tool.inputSchema as JSONSchema7,
		}));
	}

	private async webRequest(url: string, method: string, body: string | null) {
		if (!url) {
			throw new Error('web_request requires a url argument.');
		}
		const response = await fetch(url, { method, body: body ?? undefined });
		const buffer = await response.arrayBuffer();
		const encoding = chardet.detect(new Uint8Array(buffer)) || 'utf-8';
		return new TextDecoder(encoding).decode(buffer);
	}

	private async fsReadFile(fileUri: vscode.Uri, startLineNumberBaseZero = 0, endLineNumberBaseZero = -1): Promise<string> {
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

	private async fsReadDir(directoryUri: vscode.Uri) {
		const entries = await vscode.workspace.fs.readDirectory(directoryUri);
		const entriesWithStats = await Promise.all(entries.map(async ([name, type]) => {
			const entryUri = vscode.Uri.joinPath(directoryUri, name);
			const stat = await vscode.workspace.fs.stat(entryUri);
			return [name, {
				type: this.toFileTypeString(type),
				size: stat.size,
				mtime: new Date(stat.mtime).toISOString(),
			}];
		}));
		return JSON.stringify(Object.fromEntries(entriesWithStats));
	}

	private async fsFindFiles(directoryUri: vscode.Uri, include: vscode.GlobPattern, exclude?: vscode.GlobPattern, maxResults?: number) {
		const directoryPath = directoryUri.fsPath;
		const result = await vscode.workspace.findFiles(include, exclude, maxResults);
		return result.map(uri => path.relative(directoryPath, uri.fsPath));
	}

	private evaluateJavaScriptCode(code: string) {
		// eslint-disable-next-line no-eval
		return String(eval(code));
	}

	private toFileTypeString(type: vscode.FileType): "file" | "dir" | "symlink" | "unknown" {
		switch (type) {
			case vscode.FileType.File: return "file";
			case vscode.FileType.Directory: return "dir";
			case vscode.FileType.SymbolicLink: return "symlink";
			default: return "unknown";
		}
	}

	private async invokeVscodeLanguageModelTool(
		toolName: string,
		args: unknown,
	): Promise<string> {
		if (!vscode.lm) {
			return `Error: Failed to invoke tool ${toolName}. VS Code language model API unavailable.`;
		}

		try {
			const toolResult = await vscode.lm.invokeTool(
				toolName,
				{
					input: args as object,
					toolInvocationToken: undefined,
				}
			);

			return vscodeLanguageModelToolResultToText(toolResult);
		} catch (error) {
			logger.error(`Error invoking VS Code tool ${toolName}:`, error);
			return `Error: Failed to invoke tool ${toolName}. ${error instanceof Error ? error.message : String(error)}`;
		}
	}
}

async function loadToolDocument(toolDocumentUri: vscode.Uri): Promise<{ tool: ToolDefinition; documentText: string; }> {
	let toolDocumentText: string;
	try {
		const buffer = await vscode.workspace.fs.readFile(toolDocumentUri);
		const encoding = chardet.detect(buffer) || 'utf-8';
		toolDocumentText = new TextDecoder(encoding).decode(buffer);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		throw new Error(`[copilot-tool-definition] Failed to read file: ${toolDocumentUri}. Error: ${errorMessage}`);
	}

	const match = toolDocumentText.match(/```(ts|typescript) +copilot-tool-definition\n([^]*?)\n```/m);
	if (!match) {
		throw new Error(`[copilot-tool-definition] TypeScript block not found: ${toolDocumentUri}`);
	}
	toolDocumentText = toolDocumentText.replace(match[0], "");

	let functionDefinition: ToolFunctionDefinition;
	try {
		functionDefinition = parseFunctionSignature(match[2]);
	} catch {
		throw new Error(`[copilot-tool-definition] TypeScript block is not valid: ${toolDocumentUri}`);
	}

	if (functionDefinition.name === 'anonymous') {
		functionDefinition.name = toSafeFunctionName(toolDocumentUri);
	}

	const paramsMatch = toolDocumentText.match(/```(json|yaml) +copilot-tool-parameters\r?\n([^]*?)\r?\n```/m);
	if (paramsMatch) {
		toolDocumentText = toolDocumentText.replace(paramsMatch[0], "");
	}

	return {
		tool: {
			name: functionDefinition.name,
			kind: 'document',
			documentUri: toolDocumentUri,
			description: functionDefinition.description,
			parameters: functionDefinition.parameters,
		},
		documentText: toolDocumentText,
	};
}

function toSafeFunctionName(toolDocumentUri: vscode.Uri): string {
	const safeFunctionName = toolDocumentUri.path.replace(/[/\\]/g, "_").replace(/[ .]/g, "-");
	if (!/^[a-zA-Z0-9_-]+$/.test(safeFunctionName)) {
		throw new Error(`[copilot-tool-definition] Invalid function name derived from path: ${toolDocumentUri.path}. Only \`[a-zA-Z0-9_-]\` characters are allowed.`);
	}

	if (safeFunctionName.length > 64) {
		return safeFunctionName.slice(-64);
	}
	return safeFunctionName;
}

function vscodeLanguageModelToolResultToText(toolResult: vscode.LanguageModelToolResult): string {
	return toolResult.content.map(part => {
		const value = (part as { value: unknown }).value;
		if (typeof value === 'string') {
			return value;
		}

		const texts: string[] = [];
		const node = (value as PromptElementJSON | undefined)?.node;
		if (node) {
			stringifyPromptNodeJSON(node, texts);
		}
		return texts.join("");
	}).join("\n");
}
