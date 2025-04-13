import { OpenAI } from 'openai';
import * as vscode from 'vscode';

const unavailableCopilotToolNames = new Set([
    "copilot_searchCodebase",
    "copilot_getVSCodeAPI",
    "copilot_think",
    "copilot_runInTerminal",
    "copilot_getTerminalOutput",
    "copilot_getErrors",
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

export function listVscodeLanguageModelTools(toolNamePattern: string): OpenAI.ChatCompletionTool[] {
    const toolNameMatcher = toolNamePattern === "^copilot"
        ? new RegExp("^copilot")
        : new RegExp(`^(?:[0-9a-f]+_${toolNamePattern.slice(1)}|${toolNamePattern})`);

    return vscode.lm.tools
        .filter(tool => !unavailableCopilotToolNames.has(tool.name) && toolNameMatcher.test(tool.name))
        .map(vscodeLanguageModelToolInformationToOpenAIChatCompletionTool);
}

export function isVscodeLanguageModelToolAvailable(toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function): boolean {
    return vscode.lm.tools.some(tool => tool.name === toolCallFunction.name);
}

export async function invokeVscodeLanguageModelTool(toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function, args: unknown): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
    try {
        const toolResult = await vscode.lm.invokeTool(
            toolCallFunction.name,
            { input: args } as vscode.LanguageModelToolInvocationOptions<object>
        );

        return vscodeLanguageModelToolResultToChatCompletionContentPart(toolResult);
    } catch (error) {
        console.error(`Error invoking VS Code tool ${toolCallFunction?.name}:`, error);
        return [{
            type: 'text',
            text: `Error: Failed to invoke tool ${toolCallFunction?.name}. ${error instanceof Error ? error.message : String(error)}`
        } as OpenAI.Chat.Completions.ChatCompletionContentPart];
    }
}

function vscodeLanguageModelToolInformationToOpenAIChatCompletionTool(tool: vscode.LanguageModelToolInformation): OpenAI.ChatCompletionTool {
    return {
        type: "function",
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        }
    } as OpenAI.ChatCompletionTool;
}

function vscodeLanguageModelToolResultToChatCompletionContentPart(toolResult: vscode.LanguageModelToolResult): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
    return toolResult.content.map(part => {
        const value = (part as { value: unknown }).value;
        if (typeof value === 'string') {
            return {
                type: 'text',
                text: value,
            } as OpenAI.Chat.Completions.ChatCompletionContentPart;
        }

        const texts: string[] = [];
        stringifyPromptNodeJSON((value as PromptElementJSON).node, texts);
        return {
            type: 'text',
            text: texts.join(""),
        } as OpenAI.Chat.Completions.ChatCompletionContentPart;
    });
}

/*
see: https://github.com/microsoft/vscode-prompt-tsx
see: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/chat/common/tools/promptTsxTypes.ts
*/

const enum PromptNodeType {
    Piece = 1,
    Text = 2,
}

interface TextJSON {
    type: PromptNodeType.Text;
    text: string;
    priority: number | undefined;
    lineBreakBefore: boolean | undefined;
}

/**
 * Constructor kind of the node represented by {@link PieceJSON}. This is
 * less descriptive than the actual constructor, as we only care to preserve
 * the element data that the renderer cares about.
 */
const enum PieceCtorKind {
    BaseChatMessage = 1,
    Other = 2,
    ImageChatMessage = 3,
}

interface BasePieceJSON {
    type: PromptNodeType.Piece;
    ctor: PieceCtorKind.BaseChatMessage | PieceCtorKind.Other;
    ctorName: string | undefined;
    children: PromptNodeJSON[];
    props: Record<string, unknown>;
    keepWithId?: number;
    flags?: number; // ContainerFlags
}

interface ImageChatMessagePieceJSON {
    type: PromptNodeType.Piece;
    ctor: PieceCtorKind.ImageChatMessage;
    children: PromptNodeJSON[];
    props: {
        src: string;
        detail?: 'low' | 'high';
    };
}

type PieceJSON = BasePieceJSON | ImageChatMessagePieceJSON;
type PromptNodeJSON = PieceJSON | TextJSON;
interface PromptElementJSON { node: PieceJSON; }

function stringifyPromptNodeJSON(node: PromptNodeJSON, strs: string[]): void {
    if (node.type === PromptNodeType.Text) {
        if (node.lineBreakBefore) {
            strs.push('\n');
        }
        if (typeof node.text === 'string') {
            strs.push(node.text);
        }
    } else if (node.ctor === PieceCtorKind.ImageChatMessage) {
        strs.push('<image>');
    } else if (node.ctor === PieceCtorKind.BaseChatMessage || node.ctor === PieceCtorKind.Other) {
        for (const child of node.children) {
            stringifyPromptNodeJSON(child, strs);
        }
    }
}
