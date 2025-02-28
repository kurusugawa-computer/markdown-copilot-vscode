import * as vscode from 'vscode';
import { applyFilePathDiff, listFilePathDiff } from './features/filePathDiff';
import { continueEditing, titleActiveContext } from './features/markdownEditing';
import { nameAndSaveAs } from './features/nameAndSave';
import { pasteAsPrettyText } from './features/pasteAsPrettyText';
import { adjustStartToLineHead, partialEndsWith, toOverflowAdjustedRange } from './utils';
import { ContextDecorator, ContextOutline } from './utils/context';
import { EditCursor } from './utils/editCursor';
import { indentQuote, outdentQuote } from './utils/indention';
import * as l10n from './utils/localization';
import * as logging from './utils/logging';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(logging.initialize());

	l10n.initialize(context.extensionUri);

	const outline = new ContextOutline();
	const contextDecorator = new ContextDecorator(outline, vscode.window.activeTextEditor);

	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT = "markdown.copilot.editing.continueInContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_MULTIMODAL_CONTEXT = "markdown.copilot.editing.continueInMultimodalContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT = "markdown.copilot.editing.continueWithoutContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE_AS = "markdown.copilot.editing.nameAndSaveAs";
	const COMMAND_MARKDOWN_COPILOT_EDITING_TITLE_ACTIVE_CONTEXT = "markdown.copilot.editing.titleActiveContext";
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

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE, () => {
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor === undefined || textEditor.selection.isEmpty) { return; }

		const range = adjustStartToLineHead(toOverflowAdjustedRange(textEditor));
		textEditor.edit(editBuilder =>
			editBuilder.replace(
				range,
				indentQuote(textEditor.document.getText(range), 1)
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
				outdentQuote(textEditor.document.getText(range), 1)
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
		event => contextDecorator.onDidChangeConfiguration(event)
	));

	context.subscriptions.push(vscode.languages.registerCodeActionsProvider('markdown', {
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

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems(document: vscode.TextDocument, _position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext) {
			const activeTextEditor = contextDecorator.activeTextEditor;
			if (activeTextEditor === undefined) { return; }
			if (activeTextEditor.document !== document) { return; }
			if (activeTextEditor.selection.isEmpty) { return; }

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
		}
	}));

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext) {
			return [
				newCompletionItem(
					vscode.CompletionItemKind.Snippet,
					"# Copilot Context: ",
					l10n.t("command.completion.context.detail"),
					"0",
					/(?!^)#+/,
				),
				newCompletionItem(
					vscode.CompletionItemKind.Snippet,
					"**User:** ",
					l10n.t("command.completion.user.detail"),
					"1",
					/:\*\* ?/,
				),
				newCompletionItem(
					vscode.CompletionItemKind.Snippet,
					"**System(Override):** ",
					l10n.t("command.completion.system-override.detail"),
					"0",
					/:\*\* ?/,
				),
				newCompletionItem(
					vscode.CompletionItemKind.Snippet,
					"**System:** ",
					l10n.t("command.completion.system.detail"),
					"0",
					/:\*\* ?/,
				),
				newCompletionItem(
					vscode.CompletionItemKind.Snippet,
					"**Copilot:** ",
					l10n.t("command.completion.copilot.detail"),
					"2",
					/:\*\* ?/,
				),
				newCompletionItem(
					vscode.CompletionItemKind.Reference,
					// eslint-disable-next-line no-template-curly-in-string
					'@import "${1:target_file_path}"',
					l10n.t("command.completion.import.detail"),
					"1",
				),
				newCompletionItem(
					vscode.CompletionItemKind.Module,
					// eslint-disable-next-line no-template-curly-in-string
					'```json copilot-options\n{"model":"${1:gpt-4o}","response_format":{"type":"${2:text}","temperature":${3:0.01},"max_tokens":${4:4096}}}\n```',
					l10n.t("command.completion.copilot-options.detail"),
					"0",
					/``` *$/,
				),
				newCompletionItem(
					vscode.CompletionItemKind.Module,
					// eslint-disable-next-line no-template-curly-in-string
					'```json copilot-options\n{"model":"${1:o3-mini}","temperature":1}\n```',
					l10n.t("command.completion.copilot-options.detail"),
					"0",
					/``` *$/,
				),
			].filter((e): e is NonNullable<typeof e> => e !== undefined);

			function newCompletionItem(kind: vscode.CompletionItemKind, insertText: string, detail: string, sortPrefix: string, ignore?: RegExp): vscode.CompletionItem | undefined {
				const offset = partialEndsWith(document.lineAt(position.line).text, insertText, ignore);
				if (offset === 0) { return; }
				const item = new vscode.CompletionItem(insertText, kind);
				item.sortText = sortPrefix + insertText;
				item.insertText = new vscode.SnippetString(insertText);
				item.detail = detail;
				const range = document.lineAt(position.line).range;
				item.range = range.with(position.with({ character: range.end.character - offset }));
				return item;
			}
		}
	}));
}

export function deactivate() {
	EditCursor.onDeactivate();
}


