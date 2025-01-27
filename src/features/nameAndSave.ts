import OpenAI from 'openai';
import path from 'path';
import * as vscode from 'vscode';
import { ChatMessage, ChatRole, executeTask } from '../utils/llm';

export async function nameAndSaveAs() {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const document = textEditor.document;

	const configuration = vscode.workspace.getConfiguration();
	const nameMessage = configuration.get<string>("markdown.copilot.instructions.nameMessage");
	if (nameMessage === undefined || nameMessage.trim().length === 0) {
		return;
	}

	const currentDateTime = new Date().toLocaleString('sv').replace(' ', 'T');
	const workspaceFolder = vscode.workspace.workspaceFolders![0];

	const namePathFormat = document.uri.scheme === 'untitled'
		? configuration.get<string>("markdown.copilot.instructions.namePathFormat")
		: path.relative(workspaceFolder.uri.fsPath, vscode.Uri.joinPath(document.uri, '..', `\${filename}${path.extname(document.fileName)}`).fsPath);

	if (namePathFormat === undefined || namePathFormat.trim().length === 0) {
		return;
	}

	const json = await executeTask(
		[
			{ role: ChatRole.System, content: nameMessage.replace("${namePathFormat}", namePathFormat) },
			{ role: ChatRole.User, content: `Defined variables: \`{ "datetime": "${currentDateTime}", "workspaceFolder": "${workspaceFolder.uri.fsPath}" }\`` },
			{ role: ChatRole.User, content: `Content:\n${document.getText()}` },
		] as ChatMessage[],
		{ "temperature": Number.EPSILON, "response_format": { "type": "json_object" } } as OpenAI.ChatCompletionCreateParams
	);

	let filepath: string;
	try {
		filepath = JSON.parse(json).filepath;
	} catch {
		vscode.window.showErrorMessage("Failed to suggest a filepath. Try again.");
		return;
	}

	const saveFileUri = vscode.Uri.joinPath(workspaceFolder.uri, filepath);
	const saveDirUri = vscode.Uri.joinPath(saveFileUri, "..");

	const topCreatedDirUri = await makeDirectories(saveDirUri);
	const uri = await vscode.window.showSaveDialog({ defaultUri: saveFileUri });

	if (uri) {
		await vscode.workspace.fs.writeFile(uri, Buffer.from(document.getText()));
		await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
		const doc = await vscode.workspace.openTextDocument(uri);
		await vscode.window.showTextDocument(doc);
	} else if (topCreatedDirUri !== null) {
		await pruneEmptyDirectories(topCreatedDirUri, saveDirUri);
	}
}

/*
 * Utilities for filesystem
 */
async function makeDirectories(dirUri: vscode.Uri): Promise<vscode.Uri | null> {
	const segments = dirUri.path.split('/').filter(segment => segment);
	const rootUri = dirUri.with({ path: '/' });

	for (let i = 1; i <= segments.length; i++) {
		const currentUri = vscode.Uri.joinPath(rootUri, ...segments.slice(0, i));
		try {
			// Check if currentUri already exists.
			await vscode.workspace.fs.stat(currentUri);
		} catch (error) {
			// If currentUri does not exist, create directories and return the top of created directory URI.
			await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, ...segments));
			return currentUri;
		}
	}
	return null;
}

async function pruneEmptyDirectories(rootDirUri: vscode.Uri, leafDirUri: vscode.Uri): Promise<void> {
	async function isDirectoryEmpty(dirUri: vscode.Uri): Promise<boolean> {
		const files = await vscode.workspace.fs.readDirectory(dirUri);
		return files.length === 0;
	}

	async function deleteIfEmpty(targetDirUri: vscode.Uri): Promise<boolean> {
		const isEmpty = await isDirectoryEmpty(targetDirUri);
		if (!isEmpty) { return false; }
		await vscode.workspace.fs.delete(targetDirUri, { recursive: false });
		return true;
	}

	const rootDirUriString = rootDirUri.toString();

	async function purgeRecursive(currentDirUri: vscode.Uri): Promise<void> {
		if (!await deleteIfEmpty(currentDirUri)) { return; }
		if (currentDirUri.toString() === rootDirUriString) { return; }
		await purgeRecursive(vscode.Uri.joinPath(currentDirUri, '..'));
	}

	return purgeRecursive(leafDirUri);
}
