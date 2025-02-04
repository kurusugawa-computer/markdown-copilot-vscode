import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { LF } from '../utils';
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
	private static readonly runningConversations = new Set<Conversation>();
	private textEditor: vscode.TextEditor;
	private document: vscode.TextDocument;
	private position: vscode.Position;
	private abortController?: AbortController;
	private completionIndicator: vscode.TextEditorDecorationType;

	constructor(textEditor: vscode.TextEditor, position: vscode.Position) {
		this.textEditor = textEditor;
		this.document = textEditor.document;
		this.position = position;
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

	setPosition(position: vscode.Position): vscode.Position {
		this.position = position;
		return this.position;
	}

	static onDeactivate() {
		for (const conversation of Conversation.runningConversations) {
			conversation.dispose();
		}
	}

	static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		const sortedChanges = [...event.contentChanges].sort((a, b) => b.range.start.compareTo(a.range.start));
		for (const conversation of Conversation.runningConversations) {
			if (conversation.document !== event.document) { continue; }
			conversation.updatePosition(sortedChanges);
		}
	}

	private updatePosition(contentChanges: vscode.TextDocumentContentChangeEvent[]) {
		this.position = contentChanges.reduce(toUpdatedPosition, this.position);
	}

	async insertText(text: string, lineSeparator: string): Promise<vscode.Position> {
		const edit = new vscode.WorkspaceEdit();
		edit.insert(
			this.document.uri,
			this.position,
			lineSeparator === LF ? text : text.replaceAll(LF, lineSeparator),
		);
		this.textEditor.setDecorations(this.completionIndicator, [new vscode.Range(this.position, this.position)]);
		await vscode.workspace.applyEdit(edit);
		return this.position;
	}

	async replaceLine(text: string, line: number): Promise<vscode.Position> {
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			this.document.uri,
			this.document.lineAt(line).range,
			text,
		);
		await vscode.workspace.applyEdit(edit);
		return this.position;
	}

	async completeText(chatMessages: ChatMessage[], lineSeparator: string, override?: OpenAI.ChatCompletionCreateParams) {
		const chunkTextBuffer: string[] = [];
		const submitChunkText = async (chunkText: string): Promise<vscode.Position> => {
			chunkTextBuffer.push(chunkText);
			if (!chunkText.includes(LF)) { return this.position; }
			const chunkTextBufferText = chunkTextBuffer.join("");
			chunkTextBuffer.length = 0;
			return this.insertText(chunkTextBufferText, lineSeparator);
		};

		return executeChatCompletion(
			chatMessages,
			override || {} as OpenAI.ChatCompletionCreateParams,
			async chunkText => submitChunkText(chunkText),
			async completion => {
				this.abortController = completion.controller;
			}
		).then(() => submitChunkText(LF));
	}
}

/**
 * Updates a given position based on a text document content change.
 *
 * The function adjusts the provided position based on a change event by:
 * - Returning the position unchanged if the change occurs completely after it.
 * - Resetting the position to the start of the change if it falls within a replaced (deleted) range.
 * - Shifting the position backwards when the deletion occurs before the original position.
 * - Updating for any inserted text by increasing the line count and adjusting the character offset,
 *   taking into account whether the insertion is on the same line or spans multiple lines.
 *
 * @param position - The current position to be updated.
 * @param change - The text document change event that includes the range affected, deleted content, and any inserted text.
 * @returns The new position after applying the text change.
 */
function toUpdatedPosition(
	position: vscode.Position,
	change: vscode.TextDocumentContentChangeEvent,
): vscode.Position {
	const { start, end } = change.range;

	// If the change occurs completely after the position, no update needed.
	if (start.isAfter(position)) {
		return position;
	}

	let { line, character } = position;

	// If the position is within the replaced (deleted) range, move it to the start of the change.
	if (start.isBeforeOrEqual(position) && end.isAfter(position)) {
		line = start.line;
		character = start.character;
	} else {
		// The deletion is entirely before the position.
		if (!start.isEqual(end)) {
			if (end.line === line) {
				const characterDelta = end.character - start.character;
				character -= characterDelta;
			}
			const lineDelta = end.line - start.line;
			line -= lineDelta;
		}
	}

	// Process insertion.
	const text = change.text;
	if (text) {
		const newLineCount = text.split(LF).length - 1;
		// If the change started on the same line as the updated position,
		// adjust character based on the inserted text.
		if (start.line === line) {
			if (newLineCount === 0) {
				character += text.length;
			} else {
				// For multi-line insertions, the new character offset
				// becomes that from the last LF to the end in the inserted text.
				character = text.slice(text.lastIndexOf(LF) + 1).length;
			}
		}
		line += newLineCount;
	}

	return new vscode.Position(line, character);
}
