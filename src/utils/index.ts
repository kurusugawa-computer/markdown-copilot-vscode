import { AssertionError } from 'assert';
import * as vscode from 'vscode';
import * as l10n from './localization';

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

export function splitLines(text: string): string[] {
	return text.split(/\r?\n/);
}

export function replaceLineSeparatorsWith(text: string, lineSeparator: string): string {
	return text.replaceAll(/\r?\n/g, lineSeparator);
}

/**
 * Normalizes line separators in a string by converting all line separator variants to LF ('\n').
 * 
 * @param text - The input string whose line separators will be normalized
 * @returns A new string with all line separators normalized to LF
 */
export function normalizeLineSeparators(text: string): string {
	return replaceLineSeparatorsWith(text, LF);
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

/**
 * Determines the largest matching prefix length of the search string that is a suffix of the target string.
 *
 * @param target - The string to search within for a matching suffix.
 * @param search - The string whose prefix is used to check for a matching suffix in the target.
 * @param ignore - An optional regular expression used to determine if the target string should be ignored.
 * @returns The length of the largest prefix of the search string that matches a suffix of the target, or 0 if no match is found,
 *          or if the ignore pattern matches the target.
 */
export function partialEndsWith(target: string, search: string, ignore?: RegExp): number {
	if (ignore && ignore.test(target)) { return 0; }
	const offsetEnd = Math.min(target.length, search.length);
	for (let offset = offsetEnd; offset >= 0; offset--) {
		if (target.endsWith(search.slice(0, offset))) { return offset; }
	}
	return 0;
}

/**
 * Resolves a fragment URI text relative to a document URI.
 *
 * @param documentUri - The document URI to use as the base for resolving the fragment URI.
 * @param fragmentUriText - The fragment URI text to resolve.
 * @returns The resolved URI.
 * @throws Error if the fragment URI text is invalid or cannot be resolved.
 */
export function resolveFragmentUri(documentUri: vscode.Uri, fragmentUriText: string) {
	function throwError() {
		throw l10n.t(
			"command.editing.continueInContext.import.error",
			fragmentUriText,
			vscode.workspace.asRelativePath(documentUri.fsPath)
		);
	}
	if (fragmentUriText.startsWith('/')) {
		const rootUri = resolveRootUri(documentUri);
		if (!rootUri) { throwError(); }
		return vscode.Uri.joinPath(rootUri, fragmentUriText);
	}
	if (documentUri.scheme === 'untitled') { throwError(); }
	return vscode.Uri.joinPath(documentUri, '..', fragmentUriText);
}

/**
 * Resolves a workspace root URI for a given URI.
 * 
 * @param uri - An optional URI to resolve. If not provided, the active text editor's document URI is used.
 * @returns The resolved workspace root URI.
 * @throws Error if no workspace folder is identified for the given URI.
 */
export function resolveRootUri(uri = vscode.window.activeTextEditor?.document.uri): vscode.Uri {
	const folders = vscode.workspace.workspaceFolders;
	if (uri) {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		return folder?.uri ?? (folders?.[0]?.uri ?? vscode.Uri.file('/'));
	}
	return folders?.[0]?.uri ?? vscode.Uri.file('/');
}
