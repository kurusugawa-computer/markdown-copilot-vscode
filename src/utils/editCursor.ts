import { Mutex } from 'async-mutex';
import { OpenAI } from 'openai';
import * as vscode from 'vscode';
import { LF, toEolString } from ".";
import { getQuoteIndent } from './indention';
import { ChatMessage, executeChatCompletionWithTools } from './llm';
import { CancelablePromise } from './promise';
import { executeToolFunction } from './llmTools';

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
    private static readonly editLock = new Mutex();
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

    getLineEolWithIndent(): string {
        return toEolString(this.document.eol) + getQuoteIndent(this.document.lineAt(this.position.line).text);
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

    private updatePosition(contentChanges: readonly vscode.TextDocumentContentChangeEvent[]) {
        this.position = contentChanges.reduce(toUpdatedPosition, this.position);
    }

    async edit(editCallback: (editBuilder: vscode.TextEditorEdit) => void) {
        return EditCursor.editLock.runExclusive(async () => {
            await this.textEditor.edit(editCallback);
        });
    }

    async insertText(text: string, lineSeparator: string): Promise<vscode.Position> {
        await this.edit(editBuilder => {
            editBuilder.insert(this.position, lineSeparator === LF ? text : text.replaceAll(LF, lineSeparator));
        });
        this.textEditor.setDecorations(this.cursorIndicator, [new vscode.Range(this.position, this.position)]);
        return this.position;
    }

    async replaceLineText(text: string, line: number): Promise<vscode.Position> {
        await this.edit(editBuilder => {
            const range = this.document.lineAt(line).range;
            this.position = range.end;
            editBuilder.replace(range, text);
        });
        return this.position;
    }

    insertCompletion(chatMessages: ChatMessage[], lineSeparator: string, override?: OpenAI.ChatCompletionCreateParams) {
        const chunkTexts: string[] = [];
        const submitChunkText = async (chunkText: string): Promise<void> => {
            chunkTexts.push(chunkText);
            if (!chunkText.includes(LF)) { return; }
            const joinedText = chunkTexts.join("");
            chunkTexts.length = 0;
            await this.insertText(joinedText, lineSeparator);
        };

        return new CancelablePromise<vscode.Position>(async (resolve, reject, onCancel) => {
            let isCanceled = false;
            let abortController: AbortController | undefined;

            onCancel(() => {
                isCanceled = true;
                abortController?.abort();
            });

            try {
                await executeChatCompletionWithTools(
                    chatMessages,
                    override || {} as OpenAI.ChatCompletionCreateParams,
                    chunkText => submitChunkText(chunkText),
                    toolFunction => executeToolFunction(this.document.uri, toolFunction),
                    async completion => {
                        abortController = completion.controller;
                        if (isCanceled) {
                            abortController.abort();
                        }
                    }
                );

                if (chunkTexts.length > 0) {
                    resolve(await this.insertText(chunkTexts.join(""), lineSeparator));
                } else {
                    resolve(this.position);
                }
            } catch (error) {
                reject(error);
            }
        }, false);
    }

    async withProgress(title: string, task: (editCursor: EditCursor, token: vscode.CancellationToken) => Promise<void>, disposeOnFinally = true): Promise<EditCursor> {
        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Window,
                title,
                cancellable: true,
            }, async (_progress, token) => {
                await task(this, token);
            });
        } catch (e) {
            const errorMessage = (e instanceof Error ? e.message.replace(/^\d+ /, "") : String(e));
            vscode.window.showErrorMessage(errorMessage);
            await this.insertText(errorMessage, this.getLineEolWithIndent());
        } finally {
            if (disposeOnFinally) {
                this.dispose();
            }
        }
        return this;
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
    // Note: the VS Code API treats ranges as closed interval "[start, end]".
    const { start, end } = change.range;

    // If the change comes completely after the cursor, do nothing.
    if (start.isAfter(position)) {
        return position;
    }

    const text = change.text;

    // Split the inserted text into lines.
    const insertedLines = text.split(/\r?\n/);
    const insertedLineCount = insertedLines.length - 1;

    // If the cursor is within the range that was replaced...
    // (i.e. it falls between the start and end of the changed range)
    if (!position.isAfter(end)) {
        // For a single-line insertion, place the cursor right after the inserted text.
        // For multi-line, the new column is on the last inserted line.
        const newCharacter = insertedLineCount === 0
            ? start.character + insertedLines[0].length
            : insertedLines[insertedLines.length - 1].length;
        return new vscode.Position(start.line + insertedLineCount, newCharacter);
    }

    // Otherwise, the change occurs entirely before the cursor.
    // Calculate the new line number: subtract removed lines and add inserted ones.
    const newLine = start.line + insertedLineCount + (position.line - end.line);

    // For characters, if the cursor was on the same line as the end of the change,
    // adjust for the character difference. Otherwise, leave it unchanged.
    let newCharacter = position.character;
    if (position.line === end.line) {
        const charOffset = position.character - end.character;
        if (insertedLineCount === 0) {
            newCharacter = start.character + insertedLines[0].length + charOffset;
        } else {
            // With multi-line insertion, the cursor lands on the last inserted line.
            newCharacter = insertedLines[insertedLines.length - 1].length + charOffset;
        }
    }

    return new vscode.Position(newLine, newCharacter);
}
