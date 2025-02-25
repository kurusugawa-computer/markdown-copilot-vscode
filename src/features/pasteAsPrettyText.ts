import * as vscode from 'vscode';
import { toOverflowAdjustedRange } from '../utils';
import { EditCursor } from '../utils/editCursor';
import { ChatRole } from '../utils/llm';

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
        await textEditor.edit(editBuilder => {
            editBuilder.delete(userRange);
        });
    }

    return new EditCursor(textEditor, userStart).withProgress(
        "Markdown Copilot: Pasting clipboard content as Pretty text",
        async (editCursor, token) => {
            const configuration = vscode.workspace.getConfiguration();
            const pasteMessage = configuration.get<string>("markdown.copilot.instructions.pasteAsPrettyTextMessage");
            if (pasteMessage === undefined || pasteMessage.trim().length === 0) {
                return;
            }

            const completionPromise = editCursor.insertCompletion([
                // eslint-disable-next-line no-template-curly-in-string
                { role: ChatRole.System, content: pasteMessage.replaceAll("${languageId}", languageId) },
                { role: ChatRole.User, content: clipboardContent },
            ], editCursor.getLineEolWithIndent());
            token.onCancellationRequested(() => completionPromise.cancel());
            await completionPromise;
        }
    );
}
