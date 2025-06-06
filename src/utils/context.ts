import { debounce } from "ts-debounce";
import * as vscode from 'vscode';
import { isSelectionOverflow, resolveFragmentUri, splitLines, toEolString } from '.';
import * as config from "./configuration";
import { countContextIndentLevel, outdentContext } from './indention';

interface LineRange {
	start: vscode.Position;
	end: vscode.Position;
	contextIndent: number;
}

function isContextSeparateLine(lineText: string): boolean {
	return lineText.match(/^#[ \t]Copilot Context/) !== null;
}

export async function resolveImport(
	document: vscode.TextDocument,
	sourceDocumentContent: string,
	importedDocumentUriTexts: string[],
	eol: string = toEolString(document.eol),
): Promise<string> {
	const textLines: string[] = [];
	const documentUriText = document.uri.toString();
	if (importedDocumentUriTexts.includes(documentUriText)) { return ""; }
	importedDocumentUriTexts.push(documentUriText);
	try {
		for (const line of splitLines(sourceDocumentContent)) {
			const match = line.match(/^@import\s+"([^"]+)"/);
			if (match === null) {
				textLines.push(line);
				continue;
			}
			const importedDocument = await vscode.workspace.openTextDocument(resolveFragmentUri(document.uri, match[1].trim()));
			textLines.push(await resolveImport(importedDocument, importedDocument.getText(), importedDocumentUriTexts, eol));
		}
	} finally {
		importedDocumentUriTexts.pop();
	}
	return textLines.join(eol);
}

export class ContextOutline {
	private readonly lineRanges: LineRange[] = [];
	private readonly activeLineRangeIndices: number[] = [];
	private readonly inactiveLineRangeIndices: number[] = [];

	private toRanges(lineRangeIndices: number[]): vscode.Range[] {
		const lineRanges = this.lineRanges;
		return lineRangeIndices.map(e => new vscode.Range(lineRanges[e].start, lineRanges[e].end));
	}

	toActiveLineRanges(): LineRange[] {
		const lineRanges = this.lineRanges;
		return Array.from(
			this.activeLineRangeIndices,
			e => lineRanges[e]
		);
	}

	toInactiveRanges(): vscode.Range[] {
		return this.toRanges(this.inactiveLineRangeIndices);
	}

	update(document: vscode.TextDocument, selection: vscode.Selection) {
		this.lineRanges.length = 0;
		this.activeLineRangeIndices.length = 0;
		this.inactiveLineRangeIndices.length = 0;

		const activeLine = Math.max(
			0,
			selection.end.line - (isSelectionOverflow(selection) ? 1 : 0)
		);
		const activeLineRangeIndex = this.initializeLineRanges(document, activeLine);
		this.finalizeLineRanges(activeLineRangeIndex);
	}

	private initializeLineRanges(document: vscode.TextDocument, activeLine: number): number {
		const firstLine = document.lineAt(0);
		const firstLineText = firstLine.text;

		let lineRange: LineRange = {
			start: firstLine.range.start,
			end: firstLine.range.end,
			contextIndent: countContextIndentLevel(firstLineText),
		};

		const lineRanges = this.lineRanges;
		lineRanges.push(lineRange);

		let activeLineRangeIndex = 0;

		for (let line = 1; line < document.lineCount; ++line) {
			const textLine = document.lineAt(line);
			const textLineRange = textLine.range;
			const textLineText = textLine.text;
			if (isContextSeparateLine(textLineText)) {
				lineRange = {
					start: textLineRange.start,
					end: textLineRange.end,
					contextIndent: 0,
				};
				if (line > activeLine) {
					lineRanges.push(lineRange);
					break;
				}
				lineRanges.length = 0;
				lineRanges.push(lineRange);
			}

			const contextIndent = countContextIndentLevel(textLineText);

			if (contextIndent === lineRange.contextIndent) {
				lineRange.end = textLineRange.end;
			} else {
				lineRange = {
					start: textLineRange.start,
					end: textLineRange.end,
					contextIndent,
				};
				lineRanges.push(lineRange);
				if (line > activeLine) {
					break;
				}
			}

			if (line === activeLine) {
				activeLineRangeIndex = lineRanges.length - 1;
			}
		}
		// inactive lines up to the end
		lineRange.end = document.lineAt(document.lineCount - 1).range.end;

		return activeLineRangeIndex;
	}

	private finalizeLineRanges(activeLineRangeIndex: number) {
		const lineRanges = this.lineRanges;

		const activeLineRangeIndices = this.activeLineRangeIndices;
		const inactiveLineRangeIndices = this.inactiveLineRangeIndices;

		let activeContextIndent = lineRanges[activeLineRangeIndex].contextIndent;
		do {
			if (lineRanges[activeLineRangeIndex].contextIndent > activeContextIndent) {
				inactiveLineRangeIndices.push(activeLineRangeIndex);
			} else {
				activeLineRangeIndices.push(activeLineRangeIndex);
				activeContextIndent = lineRanges[activeLineRangeIndex].contextIndent;
			}
		} while (--activeLineRangeIndex >= 0);
		activeLineRangeIndices.reverse();

		const lastLineRangeIndex = lineRanges.length - 1;
		if (!activeLineRangeIndices.includes(lastLineRangeIndex)) {
			inactiveLineRangeIndices.push(lastLineRangeIndex);
		}

		// inactive lines up to the start
		if (lineRanges[0].start.line > 0) {
			inactiveLineRangeIndices.push(
				lineRanges.push({
					start: new vscode.Position(0, 0),
					end: lineRanges[0].start,
					contextIndent: 0
				}) - 1
			);
		}
	}

	async collectActiveLines(document: vscode.TextDocument, userStart: vscode.Position): Promise<string[]> {
		const documentEol = toEolString(document.eol);
		const importedDocumentUriTexts: string[] = [];
		const activeLineTexts: string[] = [];

		for (const lineRange of this.toActiveLineRanges()) {
			if (lineRange.start.isAfterOrEqual(userStart)) { break; }
			const range = new vscode.Range(
				lineRange.start,
				lineRange.end.isAfterOrEqual(userStart)
					? document.positionAt(Math.max(document.offsetAt(userStart) - 1, 0))
					: lineRange.end
			);
			activeLineTexts.push(await resolveImport(
				document,
				outdentContext(document.getText(range), lineRange.contextIndent),
				importedDocumentUriTexts,
				documentEol,
			));
		}
		return activeLineTexts.join(documentEol).split(documentEol);
	}
}

export class ContextDecorator {
	private readonly _outline: ContextOutline;
	private _activeTextEditor?: vscode.TextEditor;
	private _previousLine: number;
	private _inactiveDecorationType: vscode.TextEditorDecorationType;

	constructor(outline: ContextOutline, activeTextEditor?: vscode.TextEditor) {
		this._outline = outline;
		this._activeTextEditor = activeTextEditor;
		this._previousLine = -1;
		this._inactiveDecorationType = ContextDecorator.newInactiveDecorationType();
	}

	private updateDecorations(textEditor: vscode.TextEditor) {
		this._outline.update(textEditor.document, textEditor.selection);
		textEditor.setDecorations(
			this._inactiveDecorationType,
			this._outline.toInactiveRanges()
		);
	}

	private readonly debouncedUpdateDecorations = debounce((activeTextEditor) => this.updateDecorations(activeTextEditor), 100);

	private static newInactiveDecorationType() {
		return vscode.window.createTextEditorDecorationType({
			opacity: `${Math.round(config.get().contextInactiveOpacity * 100)}%`,
		});
	}

	get activeTextEditor() { return this._activeTextEditor; }

	onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
		if (!event.affectsConfiguration("markdown.copilot.context.inactiveOpacity")) { return; }
		this._inactiveDecorationType = ContextDecorator.newInactiveDecorationType();
	}

	onDidChangeActiveTextEditor(textEditor?: vscode.TextEditor) {
		this._activeTextEditor = textEditor;
		this._previousLine = -1;
		if (textEditor === undefined) { return; }
		this.updateDecorations(textEditor);
	}

	onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent) {
		const textEditor = event.textEditor;
		if (this._activeTextEditor !== textEditor) { return; }
		const activeLine = textEditor.selection.active.line;
		if (activeLine === this._previousLine) { return; }
		this.debouncedUpdateDecorations(textEditor);
		this._previousLine = activeLine;
	}

	onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		const activeTextEditor = this._activeTextEditor;
		if (activeTextEditor === undefined) { return; }
		if (activeTextEditor.document !== event.document) { return; }
		this.debouncedUpdateDecorations(activeTextEditor);
	}
}
