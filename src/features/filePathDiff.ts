import * as vscode from 'vscode';
import { toEolString, toOverflowAdjustedRange } from '../utils';
import * as l10n from '../utils/localization';

export async function listFilePathDiff(uri: vscode.Uri) {
	function insertMessage(message: string) {
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

	let pathFrom = null;
	let pathTo = null;
	const diffList: { from: string; to: string; }[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (pathFrom === null) { // expecting `-`
			const match = line.match(/^\-\s*([^\s]+)$/);
			if (match === null) { // Invalid line
				await insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
				return;
			}
			pathFrom = match[1];
		} else if (pathTo === null) { // expecting `+` or blank line
			if (line.match(/^\+?\s*$/)) {
				// The line only containing `+` is used to delete the file.
				pathTo = "";
			} else {
				const match = line.match(/^\+\s*([^\s]+)$/);
				if (match === null) { // Invalid line
					await insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
					return;
				}
				pathTo = match[1];
			}
		}

		if (pathFrom !== null && pathTo !== null) {
			diffList.push({ from: pathFrom, to: pathTo });
			pathFrom = pathTo = null;
		}
	}

	// Detect errors

	// Incomplete diff
	if (pathFrom !== null || pathTo !== null) {
		await insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
		return;
	}

	// File not found
	let someFilesMissing = false;
	for (const { from } of diffList) {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, from));
		} catch (error) {
			await insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.fileNotFound", from));
			someFilesMissing = true;
		}
	}

	if (someFilesMissing) {
		return;
	}

	// Duplicated destination file
	const tos = new Set<string>();
	for (const { to } of diffList) {
		if (to === "") { continue; } // Represents deletion
		if (tos.has(to)) {
			await insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.duplicatedDestination", to));
			return;
		}
		tos.add(to);
	}

	// Destination file already exists
	for (const { from, to } of diffList) {
		if (to === "") { continue; } // Represents deletion
		if (from === to) { continue; } // Represents no change
		try {
			await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, to));
			await insertErrorMessage(l10n.t("command.editing.applyFilePathDiff.error.destinationExists", to));
			return;
		} catch (error) {
		}
	}

	// Apply diffs
	for (const { from, to } of diffList) {
		try {
			if (to === "") {
				await vscode.workspace.fs.delete(vscode.Uri.joinPath(workspaceFolder.uri, from));
			} else {
				await vscode.workspace.fs.rename(
					vscode.Uri.joinPath(workspaceFolder.uri, from),
					vscode.Uri.joinPath(workspaceFolder.uri, to)
				);
			}
		} catch (error) {
			await insertErrorMessage(`${l10n.t("command.editing.applyFilePathDiff.error.fatal", from, to)}\n${error}`);
			return;
		}
	}

	vscode.window.showInformationMessage(l10n.t("command.editing.applyFilePathDiff.success"));
}
