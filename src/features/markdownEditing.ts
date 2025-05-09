import * as vscode from 'vscode';
import { countChar, normalizeLineSeparators, toEolString, toOverflowAdjustedRange } from '../utils';
import * as config from '../utils/configuration';
import { ContextOutline, resolveImport } from '../utils/context';
import { EditCursor } from '../utils/editCursor';
import { countContextIndentLevel, getContextIndent, outdentContext } from '../utils/indention';
import { ChatMessageBuilder, ChatRole, ChatRoleFlags } from '../utils/llm';

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
	const editCursor = new EditCursor(textEditor, document.lineAt(userEnd.line).range.end);
	await editCursor.withProgress(`Markdown Copilot: ${titleText.length > 64 ? titleText.slice(0, 63) + '…' : titleText}`, async (cursor, token) => {
		let selectedUserMessage = normalizeLineSeparators(outdentContext(
			selectedText,
			userEndLineContextIndent
		));

		// Check if the last user message already has a `**User:** ` prefix
		const userStartLineMatchesUser = userStartLineText.match(/\*\*User:\*\*[ \t]*/);
		if (userStartLineMatchesUser !== null) {
			// Remove `**User:** ` from the start of the last user message
			selectedUserMessage = selectedUserMessage.replace(userStartLineMatchesUser[0], "");
		} else {
			// Insert `**User:** ` at the start of the user selection
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

		const chatMessageBuilder = new ChatMessageBuilder(document.uri, supportsMultimodal);

		const systemMessage = config.get().instructionsSystemMessage;
		if (systemMessage) {
			await chatMessageBuilder.addChatMessage(ChatRoleFlags.System, systemMessage);
		}

		if (useContext) {
			await chatMessageBuilder.addLines(await outline.collectActiveLines(document, userStart));
		}

		await chatMessageBuilder.addChatMessage(ChatRoleFlags.User, await resolveImport(document, selectedUserMessage, [], documentEol));

		const { chatMessages, copilotOptions, toolContext } = chatMessageBuilder.build();
		const completionPromise = cursor.insertCompletion(
			chatMessages,
			userEndLineEol,
			copilotOptions,
			toolContext,
		);
		token.onCancellationRequested(() => completionPromise.cancel());
		await completionPromise;
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

	const editCursor = new EditCursor(textEditor, activeLineRangesStart);
	await editCursor.withProgress("Markdown Copilot: Title the context", async (cursor, token) => {
		const lineRangeStartLine = activeLineRangesStart.line;
		const match = document.lineAt(lineRangeStartLine).text.match(/^(#[ \t]Copilot Context:[ \t]).*$/);

		if (match !== null) {
			await cursor.replaceLineText(match[1], lineRangeStartLine);
		} else {
			await cursor.insertText("# Copilot Context: \n", documentEol);
			cursor.setPosition(document.lineAt(lineRangeStartLine).range.end);
		}
		const completionPromise = cursor.insertCompletion([
			{ role: ChatRole.User, content: activeContextText },
			{ role: ChatRole.User, content: titleMessage },
		], documentEol);
		token.onCancellationRequested(() => completionPromise.cancel());
		await completionPromise;
	});
}