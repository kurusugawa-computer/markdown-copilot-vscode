import * as vscode from 'vscode';
import { toEolString, toOverflowAdjustedRange } from '../utils';
import { getQuoteIndent } from '../utils/indention';
import { ChatRole } from '../utils/llm';
import { EditCursor } from './editCursor';

export async function pasteAsPrettyText() {
    const textEditor = vscode.window.activeTextEditor;
    if (textEditor === undefined) { return; }

    const clipboardContent = (await vscode.env.clipboard.readText()).trim();
    if (!clipboardContent) { return; }

    const userRange = toOverflowAdjustedRange(textEditor);
    const userStart = userRange.start;
    const userEnd = userRange.end;

    const document = textEditor.document;
    const documentEol = toEolString(document.eol);
    const languageId = document.languageId;

    const userEndLineText = document.lineAt(userEnd.line).text;
    const userEndLineQuoteIndentText = getQuoteIndent(userEndLineText);

    if (!userRange.isEmpty) {
        const edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, userRange);
        await vscode.workspace.applyEdit(edit);
    }

    const titleText = "Pasting clipboard content as Pretty text";
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title: `Markdown Copilot: ${titleText}`,
        cancellable: true
    }, async (_progress, token) => {
        const userEndLineEol = documentEol + userEndLineQuoteIndentText;
        const editCursor = new EditCursor(textEditor, userStart);
        try {
            const configuration = vscode.workspace.getConfiguration();
            const pasteMessage = configuration.get<string>("markdown.copilot.instructions.pasteAsPrettyTextMessage");
            if (pasteMessage === undefined || pasteMessage.trim().length === 0) {
                return;
            }

            const completionPromise = editCursor.insertCompletion([
                { role: ChatRole.System, content: pasteMessage.replaceAll("${languageId}", languageId) },
                { role: ChatRole.User, content: clipboardContent },
            ], userEndLineEol);
            token.onCancellationRequested(() => completionPromise.cancel());
            await completionPromise;
        } catch (e) {
            if (e instanceof Error) {
                const errorMessage = e.message.replace(/^\d+ /, "");
                vscode.window.showErrorMessage(errorMessage);
                await editCursor.insertText(errorMessage, userEndLineEol);
            }
        } finally {
            editCursor.dispose();
        }
    });
}
