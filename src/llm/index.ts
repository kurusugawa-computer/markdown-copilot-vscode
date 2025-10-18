import { CallSettings, JSONSchema7, JSONValue, ModelMessage } from 'ai';
import * as vscode from 'vscode';
import { BackendProtocol } from '../utils/configuration';

export type ToolChoiceDirective = 'auto' | 'required' | 'none' | {
    type: 'tool';
    toolName: string;
};

export type ProviderOptions = Record<string, Record<string, JSONValue>>;

export type ToolDefinition = {
    readonly name: string;
} & ({
    readonly kind: 'builtin';
    readonly description: string;
    readonly parameters: JSONSchema7;
} | {
    readonly kind: 'document';
    readonly documentUri: vscode.Uri;
    readonly description: string;
    readonly parameters: JSONSchema7;
} | {
    readonly kind: 'vscode';
    readonly description: string;
    readonly parameters: JSONSchema7;
} | {
    readonly kind: 'provider';
});

export class ToolContext {
    readonly documentUri: vscode.Uri;
    readonly definitions: Map<string, ToolDefinition>;

    constructor(documentUri: vscode.Uri, definitions?: Map<string, ToolDefinition>) {
        this.documentUri = documentUri;
        this.definitions = definitions ?? new Map();
    }
}

export type Messages = ModelMessage[];

export interface CopilotOptions extends Partial<CallSettings> {
    backendProtocol?: BackendProtocol;
    backendBaseUrl?: string;
    backendApiKey?: string;
    model?: string;
    toolChoice?: ToolChoiceDirective;
    responseFormat?: 'json' | 'text';
    providerOptions?: ProviderOptions;
    stream?: boolean;
}