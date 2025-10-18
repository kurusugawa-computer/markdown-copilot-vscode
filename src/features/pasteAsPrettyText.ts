import * as vscode from 'vscode';
import { ChatRequest, type ChatIntent } from '../llm/requests';
import { ChatSession } from '../llm/sessions';
import { toOverflowAdjustedRange } from '../utils';
import * as config from '../utils/configuration';
import { Cursor } from '../utils/cursor';

export async function pasteAsPrettyText() {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const clipboardContent = (await vscode.env.clipboard.readText()).trim();
	if (!clipboardContent) { return; }

	const userRange = toOverflowAdjustedRange(textEditor);
	const userStart = userRange.start;

	const document = textEditor.document;
	const languageId = document.languageId;

	if (!userRange.isEmpty) {
		await textEditor.edit(editBuilder => editBuilder.delete(userRange));
	}

	return new Cursor(textEditor, userStart).withProgress(
		"Markdown Copilot: Pasting clipboard content as Pretty text",
		async (cursor, signal) => {
			const pasteAsPrettyTextMessage = config.get().instructionsPasteAsPrettyTextMessage;
			if (!pasteAsPrettyTextMessage) {
				return;
			}

			const chatIntent: ChatIntent = {
				documentUri: document.uri,
				userInput: clipboardContent,
				overrides: {
					// eslint-disable-next-line no-template-curly-in-string
					systemPrompt: pasteAsPrettyTextMessage.replaceAll("${languageId}", languageId),
				},
				abortSignal: signal,
			};

			const request = await ChatRequest.fromIntent(chatIntent);
			const session = new ChatSession(request);
			try {
				await cursor.consume(session.stream());
			} finally {
				session.dispose();
			}
		},
		true
	);
}
