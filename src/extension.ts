import * as vscode from 'vscode';
import { applyFilePathDiff, listFilePathDiff } from './features/filePathDiff';
import { continueEditing, titleActiveContext } from './features/markdownEditing';
import { summarizeAndNewContext } from './features/manipulateContexts';
import { nameAndSaveAs } from './features/nameAndSave';
import { pasteAsPrettyText } from './features/pasteAsPrettyText';
import { adjustStartToLineHead, toOverflowAdjustedRange } from './utils';
import * as config from './utils/configuration';
import { ContextDecorator, ContextOutline } from './utils/context';
import { EditCursor } from './utils/editCursor';
import * as indention from './utils/indention';
import * as l10n from './utils/localization';
import * as logging from './utils/logging';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(logging.initialize());

	l10n.initialize(context.extensionUri);
	config.initialize();

	const outline = new ContextOutline();
	const contextDecorator = new ContextDecorator(outline, vscode.window.activeTextEditor);

	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT = "markdown.copilot.editing.continueInContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_MULTIMODAL_CONTEXT = "markdown.copilot.editing.continueInMultimodalContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT = "markdown.copilot.editing.continueWithoutContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE_AS = "markdown.copilot.editing.nameAndSaveAs";
	const COMMAND_MARKDOWN_COPILOT_EDITING_TITLE_ACTIVE_CONTEXT = "markdown.copilot.editing.titleActiveContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_SUMMARIZE_AND_NEW_CONTEXT = "markdown.copilot.editing.summarizeAndNewContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE = "markdown.copilot.editing.indentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE = "markdown.copilot.editing.outdentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_APPLY_FILE_PATH_DIFF = "markdown.copilot.editing.applyFilePathDiff";
	const COMMAND_MARKDOWN_COPILOT_EDITING_LIST_FILE_PATH_DIFF = "markdown.copilot.editing.listFilePathDiff";
	const COMMAND_MARKDOWN_COPILOT_EDITING_PASTE_AS_PRETTY_TEXT = "markdown.copilot.editing.pasteAsPrettyText";

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_LIST_FILE_PATH_DIFF,
		(uri: vscode.Uri) => listFilePathDiff(uri)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_APPLY_FILE_PATH_DIFF,
		(selectionOverride?: vscode.Selection) => applyFilePathDiff(selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, true, false, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_MULTIMODAL_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, true, true, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, false, false, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE_AS,
		() => nameAndSaveAs()
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_TITLE_ACTIVE_CONTEXT,
		() => titleActiveContext(outline)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_SUMMARIZE_AND_NEW_CONTEXT,
		() => summarizeAndNewContext(outline)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE, () => {
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor === undefined || textEditor.selection.isEmpty) { return; }

		const range = adjustStartToLineHead(toOverflowAdjustedRange(textEditor));
		textEditor.edit(editBuilder =>
			editBuilder.replace(
				range,
				indention.indentQuote(textEditor.document.getText(range), 1)
			)
		);
	}));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE, () => {
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor === undefined || textEditor.selection.isEmpty) { return; }

		const range = adjustStartToLineHead(toOverflowAdjustedRange(textEditor));
		textEditor.edit(editBuilder =>
			editBuilder.replace(
				range,
				indention.outdentQuote(textEditor.document.getText(range), 1)
			)
		);
	}));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_PASTE_AS_PRETTY_TEXT,
		() => pasteAsPrettyText()
	));

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
		textEditor => contextDecorator.onDidChangeActiveTextEditor(textEditor)
	));

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(
		event => contextDecorator.onDidChangeTextEditorSelection(event)
	));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(
		event => {
			try { contextDecorator.onDidChangeTextDocument(event); }
			catch { /* Ignore errors */ }
			try { EditCursor.onDidChangeTextDocument(event); }
			catch { /* Ignore errors */ }
		}
	));

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(
		event => {
			try { config.onDidChangeConfiguration(event); }
			catch { /* Ignore errors */ }
			try { contextDecorator.onDidChangeConfiguration(event); }
			catch { /* Ignore errors */ }
			try { indention.onDidChangeConfiguration(event); }
			catch { /* Ignore errors */ }
		}
	));

	const allDocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }];

	context.subscriptions.push(vscode.languages.registerCodeActionsProvider(allDocumentSelector, {
		provideCodeActions(_document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] | undefined {
			if (range.isEmpty) { return; }
			return [
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT, l10n.t("command.editing.continueInContext.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_MULTIMODAL_CONTEXT, l10n.t("command.editing.continueInMultimodalContext.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT, l10n.t("command.editing.continueWithoutContext.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE, l10n.t("command.editing.indentQuote.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE, l10n.t("command.editing.outdentQuote.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_APPLY_FILE_PATH_DIFF, l10n.t("command.editing.applyFilePathDiff.title")),
			];

			function newCodeAction(command: string, title: string): vscode.CodeAction {
				const action = new vscode.CodeAction(title, vscode.CodeActionKind.Empty);
				action.command = { command, title };
				return action;
			}
		}
	}, { providedCodeActionKinds: [vscode.CodeActionKind.Empty] }));

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider(allDocumentSelector, {
		provideCompletionItems(document: vscode.TextDocument, _position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext) {
			const activeTextEditor = contextDecorator.activeTextEditor;
			if (activeTextEditor === undefined) { return; }
			if (activeTextEditor.document !== document) { return; }
			if (activeTextEditor.selection.isEmpty) { return; }

			// Define newCompletionItem function here
			function newCompletionItem(command: string, name: string, detail: string, title: string, selection: vscode.Selection) {
				const item = new vscode.CompletionItem(name);
				item.kind = vscode.CompletionItemKind.Text;
				item.insertText = document.getText(selection);
				item.detail = detail;
				item.keepWhitespace = false;
				item.command = {
					command,
					title,
					arguments: [selection],
				};
				return item;
			}

			return [
				newCompletionItem(
					COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT,
					"Copilot continue in context",
					l10n.t("command.editing.continueInContext.detail"),
					l10n.t("command.editing.continueInContext.title"),
					activeTextEditor.selection,
				),
				newCompletionItem(
					COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_MULTIMODAL_CONTEXT,
					"Copilot continue in multimodal context",
					l10n.t("command.editing.continueInMultimodalContext.detail"),
					l10n.t("command.editing.continueInMultimodalContext.title"),
					activeTextEditor.selection,
				),
				newCompletionItem(
					COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT,
					"Copilot continue without context",
					l10n.t("command.editing.continueWithoutContext.detail"),
					l10n.t("command.editing.continueWithoutContext.title"),
					activeTextEditor.selection,
				),
			];
		}
	}));
}

export function deactivate() {
	EditCursor.onDeactivate();
}
