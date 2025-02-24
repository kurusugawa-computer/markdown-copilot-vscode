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
 * The function checks if the target string ends with a prefix of the search string, starting from the full length of the shorter string
 * and decreasing the match length until a match is found. If the optional ignore regular expression is provided and matches the target,
 * the function returns 0 immediately.
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
 * Resolves a URI based on the provided fragment URI text and the document's URI.
 *
 * @param document - The text document from which the URI is resolved.
 * @param fragmentUriText - The fragment URI text to resolve.
 * @returns The resolved URI, or `null` if the document is not saved.
 */
export function resolveFragmentUri(document: vscode.TextDocument, fragmentUriText: string) {
	function throwError() {
		throw l10n.t(
			"command.editing.continueInContext.import.error",
			fragmentUriText,
			vscode.workspace.asRelativePath(document.fileName)
		);
	}
	if (fragmentUriText.startsWith('/')) {
		const rootUri = resolveRootUri(document.uri);
		if (!rootUri) { throwError(); }
		return vscode.Uri.joinPath(rootUri, fragmentUriText);
	}
	if (document.uri.scheme === 'untitled') { throwError(); }
	return vscode.Uri.joinPath(document.uri, '..', fragmentUriText);
}

/**
 * Resolves and returns the root URI of the current workspace.
 *
 * This function determines the workspace's root by using a provided URI or falling back to the URI
 * associated with the currently active text editor's document. It attempts to locate the corresponding
 * workspace folder for the URI. If no folder is found, it defaults to the first configured workspace folder,
 * and if none exists, it falls back to a URI representing the filesystem root ('/').
 *
 * @param uri - An optional URI to resolve. If not provided, the active text editor's document URI is used.
 * @returns The resolved workspace root URI, or a fallback URI if no workspace folder is identified.
 */
export function resolveRootUri(uri = vscode.window.activeTextEditor?.document.uri): vscode.Uri {
	const folders = vscode.workspace.workspaceFolders;
	if (uri) {
		const folder = vscode.workspace.getWorkspaceFolder(uri);
		return folder?.uri ?? (folders?.[0]?.uri ?? vscode.Uri.file('/'));
	}
	return folders?.[0]?.uri ?? vscode.Uri.file('/');
}
