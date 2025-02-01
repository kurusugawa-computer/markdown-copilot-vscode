import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { LF, countChar } from '../utils';
import { ChatMessage, executeChatCompletion } from '../utils/llm';

/**
 * Represents a conversation session within the VSCode editor.
 *
 * The `Conversation` class manages the lifecycle of a conversation, including tracking
 * running conversations, handling text insertions and replacements, and managing
 * text document changes. It interacts with the VSCode API to apply workspace edits
 * and display completion indicators. Additionally, it interfaces with an OpenAI
 * chat completion service to generate and insert text based on user interactions.
 *
 * @remarks
 * - Utilizes a static `runningConversations` set to keep track of active sessions.
 * - Listens to document changes to update anchor offsets accordingly.
 * - Supports cancellation of ongoing completions via an `AbortController`.
 * - Provides methods to insert text, replace lines, and complete text using chat messages.
 * - Cleans up resources and disposes decorations upon disposal.
 */
export class Conversation {
	// TODO: Remove dependency on events after introducing Anchor Position Update Mechanism

	private static readonly runningConversations = new Set<Conversation>();
	private textEditor: vscode.TextEditor;
	private document: vscode.TextDocument;
	private anchorOffset: number;
	private changes: Set<string>;
	private abortController?: AbortController;
	private completionIndicator: vscode.TextEditorDecorationType;

	constructor(textEditor: vscode.TextEditor, anchorOffset: number) {
		this.textEditor = textEditor;
		this.document = textEditor.document;
		this.anchorOffset = anchorOffset;
		this.changes = new Set();
		this.abortController = undefined;
		this.completionIndicator = vscode.window.createTextEditorDecorationType({
			after: { contentText: "📝" },
		});
		Conversation.runningConversations.add(this);
	}

	dispose() {
		this.completionIndicator.dispose();
		Conversation.runningConversations.delete(this);
	}

	cancel(reason?: any) {
		this.abortController?.abort(reason);
	}

	setAnchorOffset(anchorOffset: number): number {
		this.anchorOffset = anchorOffset;
		return this.anchorOffset;
	}

	translateAnchorOffset(diffAnchorOffset: number) {
		this.anchorOffset += diffAnchorOffset;
		return this.anchorOffset;
	}

	static onDeactivate() {
		for (const conversation of Conversation.runningConversations) {
			conversation.dispose();
		}
	}

	static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		for (const conversation of Conversation.runningConversations) {
			conversation.onDidChangeTextDocument(event);
		}
	}

	onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		if (event.document !== this.document) { return; }
		for (const change of event.contentChanges) {
			const changeStartOffset = change.rangeOffset;
			if (changeStartOffset > this.anchorOffset) { continue; }
			if (this.changes.delete(`${changeStartOffset},${change.text},${event.document.uri}`)) { continue; }

			const changeOffsetDiff = countChar(change.text) - change.rangeLength;
			const changeEndOffset = change.rangeOffset + change.rangeLength;
			if (changeEndOffset > this.anchorOffset) {
				this.anchorOffset = changeEndOffset;
			} else {
				this.anchorOffset += changeOffsetDiff;
			}
		}
	}

	async insertText(text: string, lineSeparator: string): Promise<number> {
		text = lineSeparator === LF ? text : text.replaceAll(LF, lineSeparator);
		const edit = new vscode.WorkspaceEdit();
		const anchorPosition = this.document.positionAt(this.anchorOffset);
		edit.insert(
			this.document.uri,
			anchorPosition,
			text
		);
		this.textEditor.setDecorations(this.completionIndicator, [new vscode.Range(anchorPosition, anchorPosition)]);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		await vscode.workspace.applyEdit(edit);
		return countChar(text);
	}

	async replaceLine(text: string, line: number): Promise<number> {
		const textLine = this.document.lineAt(line);
		const deleteCharCount = countChar(textLine.text);
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			this.document.uri,
			textLine.range,
			text
		);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		await vscode.workspace.applyEdit(edit);
		return countChar(text) - deleteCharCount;
	}

	async completeText(chatMessages: ChatMessage[], lineSeparator: string, override?: OpenAI.ChatCompletionCreateParams) {
		const chunkTextBuffer: string[] = [];
		const submitChunkText = async (chunkText: string): Promise<number> => {
			chunkTextBuffer.push(chunkText);
			if (!chunkText.includes(LF)) { return 0; }
			const chunkTextBufferText = chunkTextBuffer.join("");
			chunkTextBuffer.length = 0;
			return this.insertText(chunkTextBufferText, lineSeparator);
		};

		return executeChatCompletion(
			chatMessages,
			override || {} as OpenAI.ChatCompletionCreateParams,
			async chunkText => {
				this.anchorOffset += await submitChunkText(chunkText);
			},
			async completion => {
				this.abortController = completion.controller;
			}
		).then(async () => {this.anchorOffset += await submitChunkText(LF);});
	}
}