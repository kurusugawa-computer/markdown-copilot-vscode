import * as vscode from 'vscode';
import { resolveRootUri, toEolString, toOverflowAdjustedRange } from '../utils';
import { EditCursor } from '../utils/editCursor';
import * as l10n from '../utils/localization';

export async function listFilePathDiff(targetUri: vscode.Uri) {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const document = textEditor.document;
	const userRange = toOverflowAdjustedRange(textEditor);

	return new EditCursor(textEditor, userRange.end).withProgress("Listing file path diff", async (editCursor, _token) => {
		const stack: vscode.Uri[] = [targetUri];
		const documentEol = toEolString(document.eol);

		await editCursor.insertText("```diff\n", documentEol);

		while (stack.length > 0) {
			const dirUri = stack.pop()!;
			try {
				const entries = await vscode.workspace.fs.readDirectory(dirUri);
				for (const [name, fileType] of entries) {
					const fileUri = vscode.Uri.joinPath(dirUri, name);
					switch (fileType) {
						case vscode.FileType.Directory:
							stack.push(fileUri);
							break;
						case vscode.FileType.File:
						case vscode.FileType.SymbolicLink: {
							const path = vscode.workspace.asRelativePath(fileUri, false);
							await editCursor.insertText(`- ${path}\n+ ${path}\n`, documentEol);
							break;
						}
						default:
							throw new Error(`Unexpected file type: ${fileType}`);
					}
				}
			} catch {
				// Ignore directories that cannot be read
			}
		}

		await editCursor.insertText("```\n", documentEol);
	});
}

export async function applyFilePathDiff(selectionOverride?: vscode.Selection) {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const effectiveSelection = selectionOverride ?? textEditor.selection;
	if (effectiveSelection.isEmpty) { return; }

	const document = textEditor.document;
	const userRange = toOverflowAdjustedRange(textEditor, effectiveSelection);
	const rootUri = resolveRootUri(document.uri);

	return new EditCursor(textEditor, userRange.end).withProgress("Applying file path diff", async (editCursor, _token) => {
		const documentEol = toEolString(document.eol);

		function insertErrorText(message: string) {
			return editCursor.insertText(`\nERROR: ${message}`, documentEol);
		}

		// Extract diffs using pair iteration
		const diffText = document.getText(userRange);
		const lines = diffText.split(/\r?\n/).filter(line => line.trim() !== '');
		if (lines.length % 2 !== 0) {
			await insertErrorText(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
			return;
		}
		const diffList: { from: string; to: string; }[] = [];
		for (let i = 0; i < lines.length; i += 2) {
			const fromMatch = lines[i].match(/^-\s+(.+)$/);
			if (!fromMatch) {
				await insertErrorText(l10n.t("command.editing.applyFilePathDiff.error.incomplete"));
				return;
			}
			const fromPath = fromMatch[1];
			const toMatch = lines[i + 1].match(/^\+\s+(.+)$/);
			const toPath = toMatch ? toMatch[1] : "";
			diffList.push({ from: fromPath, to: toPath });
		}

		let someFilesMissing = false;
		for (const { from } of diffList) {
			try {
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(rootUri, from));
			} catch {
				await insertErrorText(l10n.t("command.editing.applyFilePathDiff.error.fileNotFound", from));
				someFilesMissing = true;
			}
		}
		if (someFilesMissing) { return; }

		// Check if there are duplicated destination files
		const tos = new Set<string>();
		for (const { to } of diffList) {
			if (to === "") { continue; }
			if (tos.has(to)) {
				await insertErrorText(l10n.t("command.editing.applyFilePathDiff.error.duplicatedDestination", to));
				return;
			}
			tos.add(to);
		}

		// Check this before applying any diffs
		for (const { from, to } of diffList) {
			if (to === "") { continue; } // Represents deletion
			if (from === to) { continue; } // Represents no change
			try {
				await vscode.workspace.fs.stat(vscode.Uri.joinPath(rootUri, to));
				await insertErrorText(l10n.t("command.editing.applyFilePathDiff.error.destinationExists", to));
				return;
			} catch {
				// expected: destination does not exist
			}
		}

		// Apply diffs
		for (const { from, to } of diffList) {
			try {
				if (to === "") {
					await vscode.workspace.fs.delete(vscode.Uri.joinPath(rootUri, from));
				} else {
					await vscode.workspace.fs.rename(
						vscode.Uri.joinPath(rootUri, from),
						vscode.Uri.joinPath(rootUri, to)
					);
				}
			} catch (error) {
				await insertErrorText(`${l10n.t("command.editing.applyFilePathDiff.error.fatal", from, to)}\n${error}`);
				return;
			}
		}

		vscode.window.showInformationMessage(l10n.t("command.editing.applyFilePathDiff.success"));
	});
}
