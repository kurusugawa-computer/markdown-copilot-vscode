import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { LF } from '../utils';
import { ChatMessage, executeChatCompletionWithTools } from '../utils/llm';
import { CancelablePromise } from '../utils/promise';

/**
 * Manages an editable text cursor within a vscode.TextEditor.
 *
 * This class encapsulates the functionality for controlling a text cursor,
 * including updating its position in response to document changes, visually
 * indicating its location, and performing text insertions and replacements.
 *
 * @remarks
 * The class maintains a static registry of active cursors to ensure proper
 * lifecycle management and cleanup. It listens for document changes to update
 * cursor positions and provides integrations for handling chat completions.
 *
 * @example
 * ```typescript
 * const editCursor = new EditCursor(textEditor, initialPosition);
 * await editCursor.insertText("Hello, World!", "\n");
 * editCursor.dispose();
 * ```
 */
export class EditCursor {
	private static readonly runningCursors = new Set<EditCursor>();
	private textEditor: vscode.TextEditor;
	private document: vscode.TextDocument;
	private position: vscode.Position;
	private cursorIndicator: vscode.TextEditorDecorationType;

	constructor(textEditor: vscode.TextEditor, position: vscode.Position) {
		this.textEditor = textEditor;
		this.document = textEditor.document;
		this.position = position;
		this.cursorIndicator = vscode.window.createTextEditorDecorationType({
			after: { contentText: "📝" },
		});
		EditCursor.runningCursors.add(this);
	}

	dispose() {
		this.cursorIndicator.dispose();
		EditCursor.runningCursors.delete(this);
	}

	setPosition(position: vscode.Position): vscode.Position {
		this.position = position;
		return this.position;
	}

	static onDeactivate() {
		for (const cursor of EditCursor.runningCursors) {
			cursor.dispose();
		}
	}

	static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		const sortedChanges = [...event.contentChanges].sort((a, b) => b.range.start.compareTo(a.range.start));
		for (const cursor of EditCursor.runningCursors) {
			if (cursor.document !== event.document) { continue; }
			cursor.updatePosition(sortedChanges);
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
		this.textEditor.setDecorations(this.cursorIndicator, [new vscode.Range(this.position, this.position)]);
		await vscode.workspace.applyEdit(edit);
		return this.position;
	}

	async replaceLineText(text: string, line: number): Promise<vscode.Position> {
		const range = this.document.lineAt(line).range;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			this.document.uri,
			range,
			text,
		);
		this.position = range.end;
		await vscode.workspace.applyEdit(edit);
		return this.position;
	}

	insertCompletion(chatMessages: ChatMessage[], lineSeparator: string, override?: OpenAI.ChatCompletionCreateParams) {
		const chunkTexts: string[] = [];
		const submitChunkText = async (chunkText: string): Promise<vscode.Position> => {
			chunkTexts.push(chunkText);
			if (!chunkText.includes(LF)) { return this.position; }
			const joinedText = chunkTexts.join("");
			chunkTexts.length = 0;
			return this.insertText(joinedText, lineSeparator);
		};

		return new CancelablePromise<vscode.Position>((resolve, reject, onCancel) => {
			let isCanceled = false;
			let abortController: AbortController | undefined = undefined;

			onCancel(() => {
				isCanceled = true;
				abortController?.abort();
			});

			executeChatCompletionWithTools(
				chatMessages,
				override || {} as OpenAI.ChatCompletionCreateParams,
				async chunkText => submitChunkText(chunkText),
				async toolFunction => {
					const args = JSON.parse(toolFunction.arguments || 'null');
					switch (toolFunction.name) {
						case "eval_javascript":
							console.log(args);
							const result = String(eval(args.code));
							console.log(result);
							return result;
					}
					return `Not implemented tool: ${toolFunction.name}`;
				},
				async completion => {
					abortController = completion.controller;
					if (isCanceled) {
						abortController.abort();
					}
				}
			).then(() => chunkTexts.length > 0
				? this.insertText(chunkTexts.join(""), lineSeparator)
				: Promise.resolve(this.position)
			).then(resolve).catch(reject);
		}, false);
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
