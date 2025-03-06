import chardet from 'chardet';
import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { resolveFragmentUri, splitLines } from ".";
import { ChatMessageBuilder, executeChatCompletionWithTools } from './llm';
import { logger } from './logging';

// ```json copilot-tool-definition
// https://platform.openai.com/docs/api-reference/chat/create#chat-create-tools
// ```json copilot-tool-parameters

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

		const match = toolDocumentText.match(/```json +copilot-tool-definition\n([^]*?)\n```/m);
		if (!match) {
			throw new Error(`[copilot-tool-definition] JSON block not found: ${toolDocumentUri}`);
		}
		const toolDefinitionJson = match[1];

		let chatCompletionTool: OpenAI.ChatCompletionTool | undefined;
		try {
			chatCompletionTool = JSON.parse(toolDefinitionJson) as OpenAI.ChatCompletionTool;
		} catch {
			throw new Error(`[copilot-tool-definition] JSON block is not valid JSON: ${toolDocumentUri}`);
		}

		if (chatCompletionTool.function === undefined) {
			throw new Error(`[copilot-tool-definition] JSON block is missing required 'function' property: ${toolDocumentUri}`);
		}

		if (chatCompletionTool.function.name === undefined) {
			chatCompletionTool.function.name = ToolContent.toSafeFunctionName(toolDocumentUri);
		}

		toolDocumentText = toolDocumentText.replace(match[0], "");
		return new ToolContent(chatCompletionTool.function.name, chatCompletionTool, toolDocumentText);
	}

	private static toSafeFunctionName(toolDocumentUri: vscode.Uri): string {
		// replace path separators (`/` or `\`) with underscores
		// and replace spaces with hyphens
		const safeFunctionName = toolDocumentUri.path.replace(/[/\\]/g, "_").replace(/[ .]/g, "-");
		if (!/^[a-zA-Z0-9_-]+$/.test(safeFunctionName)) {
			throw new Error(`[copilot-tool-definition] Invalid function name derived from path: ${toolDocumentUri.path}. Only alphanumeric characters, underscores, and hyphens are allowed.`);
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

	async execute(parentToolContext: ToolContext, args: { [key: string]: string | number | boolean | null }): Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
		const toolContent = await this.toolContent;
		const match = toolContent.toolDocumentText.match(/```json +copilot-tool-parameters\r?\n([^]*?)\r?\n```/gm);
		if (!match) {
			throw new Error(`[copilot-tool-parameters] not found in tool document: ${this.toolDocumentUri}`);
		}

		const documentUri = parentToolContext.documentUri;
		args.current_document_uri = `${documentUri}`;
		args.current_date_time = new Date().toISOString();

		const toolParameterInjectionText = toolContent.toolDocumentText.replace(match[0], "```json copilot-tool-parameters\n" + JSON.stringify(args) + "\n```");

		const chatMessageBuilder = new ChatMessageBuilder(this.toolDocumentUri, false);
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

		try {
			const resultJson: { final_answer: string } = JSON.parse(joinedText);
			return resultJson.final_answer;
		} catch {
			throw new Error(`[copilot-tools] ${this.toolDocumentUri} returns unexpected response. Expected JSON object with 'final_answer' property.`);
		}
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
			throw new Error(`[copilot-tools] Undefined builtin tool: ${builtinToolsKey}. Available builtin tools: ${Object.keys(BUILTIN_TOOLS).join(", ")}`);
		}
		return builtinTools;
	}

	const { documentUri, toolDefinitions } = toolContext;
	const toolDocumentUri = resolveFragmentUri(documentUri, toolText);
	const toolDefinition = await ToolDefinition.create(toolDocumentUri);
	const toolContent = await toolDefinition.toolContent;

	const storedToolDefinition = toolDefinitions.get(toolContent.toolName);
	if (storedToolDefinition !== undefined) {
		logger.info(`[copilot-tools] ${toolContent.toolName} already defined: ${storedToolDefinition.toolDocumentUri}. Overwriting with ${toolDocumentUri}`);
	}

	toolDefinitions.set(toolContent.toolName, toolDefinition);

	return [toolContent.chatCompletionTool];
}

export async function executeToolFunction(toolContext: ToolContext, toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function): Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
	const args = JSON.parse(toolCallFunction.arguments || 'null');
	switch (toolCallFunction.name) {
		case "eval_js":
			return evaluateJavaScriptCode(args.code);
		case "web_fetch":
			return webFetch(args.url, args.method, args.request_body);
		case "fs_read_file":
			return fsReadFile(resolveFragmentUri(toolContext.documentUri, args.path));
		case "fs_read_dir":
			return fsReadDir(resolveFragmentUri(toolContext.documentUri, args.path));
		case "fs_search_tree": {
			const results = await fsSearchTree(
				resolveFragmentUri(toolContext.documentUri, args.path),
				args.pattern,
				args.max_depth || 10,
				args.ignore_dotfiles,
			);
			return JSON.stringify(results);
		}
		default: {
			const toolDefinition = toolContext.toolDefinitions.get(toolCallFunction.name);
			if (!toolDefinition) {
				throw new Error(`[copilot-tools] Undefined tool function: ${toolCallFunction.name}`);
			}
			return toolDefinition.execute(toolContext, args);
		}
	}
}

async function webFetch(url: string, method: string, body: string | null) {
	const response = await fetch(url, { method, body });
	const buffer = await response.arrayBuffer();
	const encoding = chardet.detect(new Uint8Array(buffer));
	if (encoding === null) { return ''; }
	return new TextDecoder(encoding).decode(buffer);
}

async function fsReadFile(fileUri: vscode.Uri) {
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

/**
 * Recursively searches files in a directory tree that match a regex pattern.
 * @param directoryUri The URI of the directory to search in. This directory will be recursively searched.
 * @param regexPattern The regular expression pattern to match file paths (relative to the `directoryUri`) against. Uses JS regex syntax.
 * @param maxDepth Maximum directory depth to search (default: 10).
 * @param ignoreDotfiles Whether to ignore files and directories that start with a dot (default: true).
 * @returns An array of objects with the path (relative to the `directoryUri`) of the files that match the regex pattern.
 */
async function fsSearchTree(directoryUri: vscode.Uri, regexPattern: string, maxDepth: number = 10, ignoreDotfiles: boolean = true): Promise<{ path: string }[]> {
  const regex = new RegExp(regexPattern);
  const results: { path: string }[] = [];
  
  async function searchDirectory(dir: vscode.Uri, currentDepth: number): Promise<void> {
    if (currentDepth > maxDepth) {
      return;
    }
    
    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      
      for (const [name, type] of entries) {
        // Skip dotfiles if ignoring them
        if (ignoreDotfiles && name.startsWith('.')) {
          continue;
        }
        
        const entryUri = vscode.Uri.joinPath(dir, name);
        // Get path relative to the search root directory
        const relativePath = entryUri.path.slice(directoryUri.path.length + (directoryUri.path.endsWith('/') ? 0 : 1));
        
        if (type === vscode.FileType.File) {
          if (regex.test(relativePath)) {
            results.push({ path: relativePath });
          }
        } else if (type === vscode.FileType.Directory) {
          await searchDirectory(entryUri, currentDepth + 1);
        }
      }
    } catch (error) {
      logger.warn(`Error reading directory ${dir.path}:`, error);
    }
  }
  
  await searchDirectory(directoryUri, 0);
  return results;
}

async function evaluateJavaScriptCode(code: string) {
	// eslint-disable-next-line no-eval
	return String(eval(code));
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
				name: "fs_search_tree",
				description: "Finds files that match a regex pattern in a directory tree",
				parameters: {
					type: "object",
					properties: {
						path: {
							type: "string",
							description: "Root directory to search from"
						},
						pattern: {
							type: "string",
							description: "Regex pattern to match against relative file paths"
						},
						max_depth: {
							type: "integer",
							description: "Maximum directory depth to search",
							default: 10
						},
						ignore_dotfiles: {
							type: "boolean",
							description: "Whether to ignore files and directories starting with a dot",
							default: true
						}
					},
					required: ["path", "pattern"],
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
				description: "Fetches content from a web URL and returns it as text",
				parameters: {
					type: "object",
					properties: {
						url: {
							type: "string",
							description: "URL to fetch content from"
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
	"eval": [
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
