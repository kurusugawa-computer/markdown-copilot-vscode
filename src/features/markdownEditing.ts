import * as vscode from 'vscode';
import { countChar, normalizeLineSeparators, toEolString, toOverflowAdjustedRange } from '../utils';
import { ContextOutline } from '../utils/context';
import { EditCursor } from '../utils/editCursor';
import { countQuoteIndent, getQuoteIndent, outdentQuote } from '../utils/indention';
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
	const userEndLineQuoteIndent = countQuoteIndent(userEndLineText);

	const userStartLineQuoteIndentText = getQuoteIndent(userStartLineText);
	const userEndLineQuoteIndentText = getQuoteIndent(userEndLineText);

	const selectedText = document.getText(userRange);

	const titleText = selectedText.replaceAll(/[\r\n\t]+/g, " ").trim();
	const editCursor = new EditCursor(textEditor, document.lineAt(userEnd.line).range.end);
	await editCursor.withProgress(`Markdown Copilot: ${titleText.length > 64 ? titleText.slice(0, 63) + '…' : titleText}`, async (cursor, token) => {
		let selectedUserMessage = normalizeLineSeparators(outdentQuote(
			selectedText,
			userEndLineQuoteIndent
		));

		// Check if the last user message already has a `**User:** ` prefix
		const userStartLineMatchesUser = userStartLineText.match(/\*\*User:\*\*[ \t]*/);
		if (userStartLineMatchesUser !== null) {
			// Remove `**User:** ` from the start of the last user message
			selectedUserMessage = selectedUserMessage.replace(userStartLineMatchesUser[0], "");
		} else {
			// Insert `**User:** ` at the start of the user selection
			await cursor.edit(editBuilder => {
				editBuilder.insert(
					document.positionAt(document.offsetAt(userStart) + (userStart.character > 0 ? 0 : countChar(userStartLineQuoteIndentText))),
					"**User:** "
				);
			});
		}

		const userEndLineEol = documentEol + userEndLineQuoteIndentText;
		await cursor.insertText("\n\n**Copilot:** ", userEndLineEol);

		const chatMessageBuilder = new ChatMessageBuilder(document.uri, supportsMultimodal);

		const configuration = vscode.workspace.getConfiguration();
		const systemMessage = configuration.get<string>("markdown.copilot.instructions.systemMessage");
		if (systemMessage !== undefined && systemMessage.trim().length !== 0) {
			await chatMessageBuilder.addChatMessage(ChatRoleFlags.System, systemMessage);
		}

		if (useContext) {
			await chatMessageBuilder.addLines(await outline.collectActiveLines(document, userStart));
		}

		await chatMessageBuilder.addChatMessage(ChatRoleFlags.User, selectedUserMessage);
		const completionPromise = cursor.insertCompletion(
			chatMessageBuilder.toChatMessages(),
			userEndLineEol,
			chatMessageBuilder.getCopilotOptions()
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

	const configuration = vscode.workspace.getConfiguration();
	const titleMessage = configuration.get<string>("markdown.copilot.instructions.titleMessage");
	if (titleMessage === undefined || titleMessage.trim().length === 0) { return; }

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