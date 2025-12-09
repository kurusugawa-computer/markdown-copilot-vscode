import { Mutex } from 'async-mutex';
import * as vscode from 'vscode';
import { LF, replaceLineSeparatorsWith, splitLines, toEolString } from '.';
import type { ChatStreamPart } from '../llm/sessions';
import { getContextIndent } from './indention';

type StreamingCompletionState = 'success' | 'canceled' | 'error';

export class Cursor {
	private static readonly editLock = new Mutex();
	private static readonly runningSessions = new Set<Cursor>();

	private readonly textEditor: vscode.TextEditor;
	private readonly document: vscode.TextDocument;
	private position: vscode.Position;
	private readonly cursorIndicator: vscode.TextEditorDecorationType;
	private lineSeparator: string;
	private chunkTexts: string[];
	private canceled = false;
	private abortController?: AbortController;
	private abortDisposers: (() => void)[] = [];

	constructor(textEditor: vscode.TextEditor, position: vscode.Position) {
		this.textEditor = textEditor;
		this.document = textEditor.document;
		this.position = position;
		this.cursorIndicator = vscode.window.createTextEditorDecorationType({
			after: { contentText: "📝" },
		});
		this.lineSeparator = this.getLineEolWithIndent();
		this.chunkTexts = [];
		Cursor.runningSessions.add(this);
	}

	setPosition(position: vscode.Position): vscode.Position {
		this.position = position;
		return this.position;
	}

	dispose() {
		this.cursorIndicator.dispose();
		this.cleanupAbortController();
		Cursor.runningSessions.delete(this);
	}

	static onDeactivate() {
		for (const session of Cursor.runningSessions) {
			session.dispose();
		}
	}

	static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		const sortedChanges = [...event.contentChanges].sort((a, b) => b.range.start.compareTo(a.range.start));
		for (const session of Cursor.runningSessions) {
			if (session.document !== event.document) { continue; }
			session.updatePosition(sortedChanges);
		}
	}

	cancel(): void {
		this.canceled = true;
		this.abortController?.abort();
	}

	async edit(editCallback: (workspaceEdit: vscode.WorkspaceEdit) => void) {
		return Cursor.editLock.runExclusive(async () => {
			const edit = new vscode.WorkspaceEdit();
			editCallback(edit);
			await vscode.workspace.applyEdit(edit);
		});
	}

	async insertText(text: string, lineSeparator: string): Promise<vscode.Position> {
		await this.edit(workspaceEdit => {
			workspaceEdit.insert(this.document.uri, this.position, lineSeparator === LF ? text : replaceLineSeparatorsWith(text, lineSeparator));
		});
		this.textEditor.setDecorations(this.cursorIndicator, [new vscode.Range(this.position, this.position)]);
		return this.position;
	}

	async replaceLineText(text: string, line: number): Promise<vscode.Position> {
		await this.edit(workspaceEdit => {
			const range = this.document.lineAt(line).range;
			this.position = range.end;
			workspaceEdit.replace(this.document.uri, range, text);
		});
		return this.position;
	}

	async consume(parts: AsyncIterable<ChatStreamPart>, progress?: vscode.Progress<{ message?: string, increment?: number }>): Promise<void> {
		let reasoningRingBuffer: string = "";
		try {
			for await (const part of parts) {
				if (this.canceled) {
					await this.complete('canceled');
					return;
				}

				switch (part.type) {
					case 'text-delta':
						if (part.text) {
							this.chunkTexts.push(part.text);
							if (part.text.includes(LF)) {
								await this.flushChunks();
							}
						}
						break;
					case 'reasoning-delta':
						if (progress) {
							reasoningRingBuffer = reasoningRingBuffer.concat(part.text).slice(-100);
							progress.report({ message: reasoningRingBuffer });
						}
						break;
					case 'error':
						throw part.error instanceof Error ? part.error : new Error(String(part.error));
					default:
						break;
				}
			}
			await this.complete('success');
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			await this.complete('error', err);
			throw err;
		}
	}

	async withProgress(title: string, task: (cursor: Cursor, signal: AbortSignal, progress: vscode.Progress<{ message?: string, increment?: number }>) => Promise<void>, disposeOnFinally = true): Promise<Cursor> {
		try {
			await vscode.window.withProgress({
				location: vscode.ProgressLocation.Window,
				title,
				cancellable: true,
			}, async (progress, token) => {
				const controller = new AbortController();
				this.attachAbortController(controller, token);
				try {
					await task(this, controller.signal, progress);
				} finally {
					this.cleanupAbortController();
				}
			});
		} catch (e) {
			const errorMessage = e instanceof Error ? e.message.replace(/^\d+ /, "") : String(e);
			vscode.window.showErrorMessage(errorMessage);
			await this.insertText(errorMessage, this.getLineEolWithIndent());
			throw e;
		} finally {
			if (disposeOnFinally) {
				this.dispose();
			}
		}
		return this;
	}

	private getLineEolWithIndent(): string {
		return toEolString(this.document.eol) + getContextIndent(this.document.lineAt(this.position.line).text);
	}


	private async complete(finalState: StreamingCompletionState, _error?: Error): Promise<void> {
		if (finalState === 'success') {
			await this.flushChunks();
		} else {
			this.chunkTexts.length = 0;
		}
	}

	private async flushChunks() {
		if (this.chunkTexts.length === 0) { return; }
		const joined = this.chunkTexts.join("");
		this.chunkTexts.length = 0;
		await this.insertText(joined, this.lineSeparator);
	}

	private updatePosition(contentChanges: readonly vscode.TextDocumentContentChangeEvent[]) {
		this.position = contentChanges.reduce(Cursor.toUpdatedPosition, this.position);
	}

	private attachAbortController(controller: AbortController, token: vscode.CancellationToken) {
		this.abortController = controller;
		const disposers: (() => void)[] = [];
		if (token.isCancellationRequested) {
			controller.abort();
		} else {
			const disposable = token.onCancellationRequested(() => controller.abort());
			disposers.push(() => disposable.dispose());
		}
		this.abortDisposers = disposers;
	}

	private cleanupAbortController() {
		for (const dispose of this.abortDisposers) {
			try { dispose(); } catch { /* ignore */ }
		}
		this.abortDisposers = [];
		this.abortController = undefined;
	}

	private static toUpdatedPosition(
		position: vscode.Position,
		change: vscode.TextDocumentContentChangeEvent,
	): vscode.Position {
		const { start, end } = change.range;

		if (start.isAfter(position)) {
			return position;
		}

		const text = change.text;
		const insertedLines = splitLines(text);
		const insertedLineCount = insertedLines.length - 1;

		if (!position.isAfter(end)) {
			if (insertedLineCount === 0) {
				return new vscode.Position(start.line, start.character + insertedLines[0].length);
			}

			return new vscode.Position(
				start.line + insertedLineCount,
				insertedLines.at(-1)!.length,
			);
		}

		if (insertedLineCount === 0) {
			if (start.line === position.line) {
				const characterDelta = insertedLines[0].length - (end.character - start.character);
				return new vscode.Position(position.line, position.character + characterDelta);
			}
			return new vscode.Position(position.line + insertedLineCount, position.character);
		}

		const firstInsertedLineLength = insertedLines[0].length;

		if (start.line === position.line) {
			const offsetInFirstLine = position.character - start.character;
			if (offsetInFirstLine <= firstInsertedLineLength) {
				return new vscode.Position(start.line, firstInsertedLineLength);
			}
			return new vscode.Position(start.line + insertedLineCount, offsetInFirstLine - firstInsertedLineLength);
		}

		return new vscode.Position(position.line + insertedLineCount, position.character);
	}
}
