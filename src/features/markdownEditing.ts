import * as vscode from 'vscode';
import { ChatRequest, type ChatIntent } from '../llm/requests';
import { ChatSession } from '../llm/sessions';
import { countChar, normalizeLineSeparators, toEolString, toOverflowAdjustedRange } from '../utils';
import * as config from '../utils/configuration';
import { ContextOutline, resolveImport } from '../utils/context';
import { Cursor } from '../utils/cursor';
import { countContextIndentLevel, getContextIndent, outdentContext } from '../utils/indention';

export async function continueEditing(outline: ContextOutline, useContext: boolean, supportsMultimodal: boolean, selectionOverride?: vscode.Selection) {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	if (selectionOverride === undefined) {
		if (textEditor.selection.isEmpty) { return; }
	} else if (selectionOverride.isEmpty) { return; }

	const document = textEditor.document;
	const documentEol = toEolString(document.eol);

	const userRange = toOverflowAdjustedRange(textEditor, selectionOverride);
	const userStart = userRange.start;
	const userEnd = userRange.end;

	const userStartLineText = document.lineAt(userStart.line).text;
	const userEndLineText = document.lineAt(userEnd.line).text;
	const userEndLineContextIndent = countContextIndentLevel(userEndLineText);

	const userStartLineContextIndentText = getContextIndent(userStartLineText);
	const userEndLineContextIndentText = getContextIndent(userEndLineText);

	const selectedText = document.getText(userRange);

	const titleText = selectedText.replaceAll(/[\r\n\t]+/g, " ").trim();
	await new Cursor(textEditor, document.lineAt(userEnd.line).range.end)
		.withProgress(`Markdown Copilot: ${titleText.length > 64 ? titleText.slice(0, 63) + '…' : titleText}`, async (cursor, signal) => {
			let selectedUserMessage = normalizeLineSeparators(outdentContext(
				selectedText,
				userEndLineContextIndent
			));

			const userStartLineMatchesUser = userStartLineText.match(/\*\*User:\*\*[ \t]*/);
			if (userStartLineMatchesUser !== null) {
				selectedUserMessage = selectedUserMessage.replace(userStartLineMatchesUser[0], "");
			} else {
				await cursor.edit(workspaceEdit => {
					workspaceEdit.insert(
						document.uri,
						document.positionAt(document.offsetAt(userStart) + (userStart.character > 0 ? 0 : countChar(userStartLineContextIndentText))),
						"**User:** "
					);
				});
			}

			const userEndLineEol = documentEol + userEndLineContextIndentText;
			await cursor.insertText("\n\n**Copilot:** ", userEndLineEol);

			const systemMessage = config.get().instructionsSystemMessage;

			const contextLines = useContext
				? await outline.collectActiveLines(document, userStart)
				: [];

			const selectionText = await resolveImport(
				document,
				selectedUserMessage,
				[],
				documentEol,
			);

			const chatIntent: ChatIntent = {
				documentUri: document.uri,
				userInput: selectionText,
				contextLines,
				overrides: systemMessage
					? { systemPrompt: systemMessage }
					: undefined,
				supportsMultimodal,
				abortSignal: signal,
			};

			const request = await ChatRequest.fromIntent(chatIntent);
			const session = new ChatSession(request);
			try {
				await cursor.consume(session.stream());
			} finally {
				session.dispose();
			}
		});
}

export async function titleActiveContext(outline: ContextOutline): Promise<void> {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	const activeLineRanges = outline.toActiveLineRanges();
	if (activeLineRanges.length === 0) { return; }

	const document = textEditor.document;
	const documentEol = toEolString(document.eol);
	const activeLineRangesStart = activeLineRanges[0].start;
	const activeContextText = normalizeLineSeparators(document.getText(
		new vscode.Range(
			activeLineRangesStart,
			activeLineRanges.at(-1)!.end
		)
	));

	if (activeContextText.trim().length === 0) { return; }

	const titleMessage = config.get().instructionsTitleMessage;
	if (!titleMessage) { return; }

	const edit = new Cursor(textEditor, activeLineRangesStart);
	await edit.withProgress("Markdown Copilot: Title the context", async (cursor, signal) => {
		const lineRangeStartLine = activeLineRangesStart.line;
		const match = document.lineAt(lineRangeStartLine).text.match(/^(#[ \t]Copilot Context:[ \t]).*$/);

		if (match !== null) {
			await cursor.replaceLineText(match[1], lineRangeStartLine);
		} else {
			await cursor.insertText("# Copilot Context: \n", documentEol);
			cursor.setPosition(document.lineAt(lineRangeStartLine).range.end);
		}
		const chatIntent: ChatIntent = {
			documentUri: document.uri,
			userInput: `${activeContextText}\n\n${titleMessage}`,
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
