import * as vscode from 'vscode';
import { normalizeLineSeparators, toEolString, toOverflowAdjustedRange } from '../utils';
import * as config from '../utils/configuration';
import { ContextOutline } from '../utils/context';
import { EditCursor } from '../utils/editCursor';

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

    const editCursor = new EditCursor(textEditor, document.lineAt(userEnd.line).range.end);
    await editCursor.withProgress("Markdown Copilot: Summarize the context", async (cursor, token) => {
        cursor.insertText("\n\n# Copilot Context: \n## ", documentEol);
        const completionPromise = cursor.insertCompletion([
            { role: "user", content: activeContextText },
            { role: "user", content: summarizeContextMessage },
        ], documentEol);
        token.onCancellationRequested(() => completionPromise.cancel());
        await completionPromise;
    });
}