import { AssertionError } from 'assert';
import * as vscode from 'vscode';

/*
 * Utilities for characters (code points and line breaks)
 */
export const LF = '\n';
export const CRLF = '\r\n';

export function toEolString(eol: vscode.EndOfLine): string {
	switch (eol) {
		case vscode.EndOfLine.LF:
			return LF;
		case vscode.EndOfLine.CRLF:
			return CRLF;
		default:
			throw new AssertionError();
	}
}

const intlSegmenter = new Intl.Segmenter();
export function countChar(text: string): number {
	let result = 0;
	for (const data of intlSegmenter.segment(text)) {
		result += data.segment === CRLF ? 2 : 1;
	}
	return result;
}

/*
 * Utilities for ranges
 */

export function isSelectionOverflow(selection: vscode.Selection): boolean {
	return !selection.isEmpty && selection.end.character === 0;
}

export function toOverflowAdjustedRange(textEditor: vscode.TextEditor, selectionOverride?: vscode.Selection): vscode.Range {
	const document = textEditor.document;
	const selection = selectionOverride || textEditor.selection;
	return new vscode.Range(
		selection.start,
		isSelectionOverflow(selection) ? document.lineAt(selection.end.line - 1).range.end : selection.end
	);
}

export function adjustStartToLineHead(range: vscode.Range): vscode.Range {
	return range.with(range.start.with({ character: 0 }));
}

export function partialEndsWith(target: string, search: string, ignore?: RegExp): number {
	if (ignore && target.match(ignore)) { return 0; }
	const offsetEnd = Math.min(target.length, search.length);
	for (let offset = offsetEnd; offset >= 0; offset--) {
		if (target.endsWith(search.slice(0, offset))) { return offset; }
	}
	return 0;
}
