
import { OpenAI } from 'openai';
import * as vscode from 'vscode';

const availableCopilotToolNames = new Set([
    "copilot_semanticSearch",
    "copilot_searchWorkspaceSymbols",
    "copilot_listCodeUsages",
    "copilot_findFiles",
    "copilot_findTextInFiles",
    "copilot_readFile",
    "copilot_listDirectory",
    "copilot_readProjectStructure",
    "copilot_getChangedFiles",
    "copilot_getTerminalSelection",
    "copilot_getTerminalLastCommand",
    "copilot_fetchWebPage",
]);

export function listCopilotTools(): OpenAI.ChatCompletionTool[] {
    return vscode.lm.tools
        .filter(tool => availableCopilotToolNames.has(tool.name))
        .map(vscodeLanguageModelToolInformationToOpenAIChatCompletionTool);
}

export function isCopilotToolAvailable(toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function): boolean {
    return availableCopilotToolNames.has(toolCallFunction.name);
}

export async function invokeCopilotTool(toolCallFunction: OpenAI.Chat.Completions.ChatCompletionMessageToolCall.Function, args: unknown): Promise<OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
    return vscodeLanguageModelToolResultToChatCompletionContentPart(await vscode.lm.invokeTool(
        toolCallFunction.name,
        { input: args } as vscode.LanguageModelToolInvocationOptions<object>,
    ))
};

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
