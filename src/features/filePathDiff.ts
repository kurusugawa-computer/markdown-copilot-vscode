import * as vscode from 'vscode';
import { toEolString, toOverflowAdjustedRange } from '../utils';
import * as l10n from '../utils/localization';

export async function listFilePathDiff(uri: vscode.Uri) {
	async function insertMessage(message: string) {
		const edit = new vscode.WorkspaceEdit();
		const anchorPosition = document.positionAt(document.offsetAt(userRange.end));
		edit.insert(document.uri, anchorPosition, `${message}\n`.replaceAll("\n", toEolString(document.eol)));
		return vscode.workspace.applyEdit(edit);
	}

	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const document = textEditor.document;
	const userRange = toOverflowAdjustedRange(textEditor, undefined);

	// List all files under the `uri` directory recursively

	let diffs = "```diff\n";
	const pendingDirs: vscode.Uri[] = [uri];

	while (pendingDirs.length > 0) {
		const currentDir = pendingDirs.pop()!;
		const entries = await vscode.workspace.fs.readDirectory(currentDir);
		for (const [name, fileType] of entries) {
			const fileUri = vscode.Uri.joinPath(currentDir, name);
			if (fileType === vscode.FileType.Directory) {
				pendingDirs.push(fileUri);
			} else if (fileType === vscode.FileType.File) {
				const path = vscode.workspace.asRelativePath(fileUri, false);
				diffs += `- ${path}\n+ ${path}\n`;
			}
		}
	}

	diffs += "```";
	await insertMessage(diffs);
}

export async function applyFilePathDiff(selectionOverride?: vscode.Selection) {
	class Diff {
		from: string;
		to: string;

		constructor(from: string, to: string) {
			this.from = from;
			this.to = to;
		}
	}

	async function insertErrorMessage(message: string) {
		const edit = new vscode.WorkspaceEdit();
		const anchorPosition = document.positionAt(document.offsetAt(userRange.end));
		edit.insert(document.uri, anchorPosition, `\nERROR: ${message}`.replaceAll("\n", toEolString(document.eol)));
		return vscode.workspace.applyEdit(edit);
	}

	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	if (selectionOverride === undefined) {
		if (textEditor.selection.isEmpty) { return; }
	} else if (selectionOverride.isEmpty) { return; }

	const document = textEditor.document;
	const userRange = toOverflowAdjustedRange(textEditor, selectionOverride);
	const workspaceFolder = vscode.workspace.workspaceFolders![0];
	const text = document.getText(userRange);

	// Extract diffs

	let path_from = null, path_to = null;
	let diff_list: Diff[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (path_from === null) { // expecting `-`
			const match = line.match(/^\-\s*([^\s]+)$/);
			if (match === null) { // Invalid line
				insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
				return;
			}
			path_from = match[1];
		} else if (path_to === null) { // expecting `+` or blank line
			if (line.match(/^\+?\s*$/)) {
				// The line only containing `+` is used to delete the file.
				path_to = "";
			} else {
				const match = line.match(/^\+\s*([^\s]+)$/);
				if (match === null) { // Invalid line
					insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
					return;
				}
				path_to = match[1];
			}
		}

		if (path_from !== null && path_to !== null) {
			diff_list.push(new Diff(path_from, path_to));
			path_from = path_to = null;
		}
	}

	// Detect errors

	// Incomplete diff
	if (path_from !== null || path_to !== null) {
		insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
		return;
	}

	// File not found
	let some_files_missing = false;
	for (const { from } of diff_list) {
		let reason = await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, from))
			.then(() => null, (reason) => reason);
		if (reason !== null) {
			insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.fileNotFound", from));
			some_files_missing = true;
		}
	}
	if (some_files_missing) {
		return;
	}

	// Duplicated destination file
	const to_set = new Set<string>();
	for (const { to } of diff_list) {
		if (to === "") { continue; } // Represents deletion
		if (to_set.has(to)) {
			insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.duplicatedDestination", to));
			return;
		}
		to_set.add(to);
	}

	// Destination file already exists
	for (const { from, to } of diff_list) {
		if (to === "") { continue; } // Represents deletion
		if (from === to) { continue; } // Represents no change
		let reason = await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, to))
			.then(() => null, (reason) => reason);
		if (reason === null) {
			insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.destinationExists", to));
			return;
		}
	}

	// Apply diffs

	for (const { from, to } of diff_list) {
		let reason = null;
		if (to === "") {
			reason = await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceFolder.uri, from))
				.then(() => null, (reason) => reason);
		} else {
			reason = await vscode.workspace.fs.rename(vscode.Uri.joinPath(workspaceFolder.uri, from),
				vscode.Uri.joinPath(workspaceFolder.uri, to)).then(() => null, (reason) => reason);
		}
		if (reason !== null) {
			insertErrorMessage(`${l10n.t("command.editing.applyFilePathDiff.error.fatal", from, to)}\n${reason}`);
			return;
		}
	}

	vscode.window.showInformationMessage(l10n.t("command.editing.applyFilePathDiff.success"));
}

