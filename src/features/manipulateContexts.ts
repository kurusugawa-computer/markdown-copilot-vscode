import * as vscode from 'vscode';
import { ChatRequest, type ChatIntent } from '../llm/requests';
import { ChatSession } from '../llm/sessions';
import { normalizeLineSeparators, toEolString, toOverflowAdjustedRange } from '../utils';
import * as config from '../utils/configuration';
import { ContextOutline } from '../utils/context';
import { Cursor } from '../utils/cursor';

export async function summarizeAndNewContext(outline: ContextOutline) {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const activeLineRanges = outline.toActiveLineRanges();
	if (activeLineRanges.length === 0) { return; }

	const document = textEditor.document;
	const documentEol = toEolString(document.eol);

	const userRange = toOverflowAdjustedRange(textEditor);
	const userEnd = userRange.end;

	const activeLineRangesStart = activeLineRanges[0].start;
	const activeContextRange = new vscode.Range(
		activeLineRangesStart,
		userEnd
	)
	const activeContextText = normalizeLineSeparators(document.getText(activeContextRange));

	if (activeContextText.trim().length === 0) { return; }

	const summarizeContextMessage = config.get().instructionsSummarizeContextMessage;
	if (!summarizeContextMessage) { return; }

	await new Cursor(textEditor, document.lineAt(userEnd.line).range.end)
		.withProgress("Markdown Copilot: Summarize the context", async (cursor, signal) => {
			await cursor.insertText("\n\n# Copilot Context: \n## ", documentEol);
			const chatIntent: ChatIntent = {
				documentUri: document.uri,
				userInput: `${activeContextText}\n\n${summarizeContextMessage}`,
				abortSignal: signal,
			};
			const request = await ChatRequest.fromIntent(chatIntent);
			const session = new ChatSession(request);
			try {
				await cursor.consume(session.stream());
			} finally {
				session.dispose();
			}
		}, true);
}
