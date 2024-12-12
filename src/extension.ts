import * as vscode from 'vscode';
import { ChatCompletion, ChatMessageBuilder, ChatRole, ChatRoleFlags } from './agents/chatCompletion';
import { applyFilePathDiff, listFilePathDiff } from './features/filePathDiff';
import { nameAndSaveAs } from './features/nameAndSave';
import { adjustStartToLineHead, countChar, LF, partialEndsWith, resolveFragmentUri, toEolString, toOverflowAdjustedRange } from './utils';
import { ContextDecorator, ContextOutline } from './utils/context';
import { countQuoteIndent, getQuoteIndent, indentQuote, outdentQuote } from './utils/indention';
import * as l10n from './utils/localization';

export function activate(context: vscode.ExtensionContext) {
	l10n.initialize(context.extensionUri);

	const outline = new ContextOutline();
	const contextDecorator = new ContextDecorator(outline, vscode.window.activeTextEditor);

	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT = "markdown.copilot.editing.continueInContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT = "markdown.copilot.editing.continueWithoutContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE_AS = "markdown.copilot.editing.nameAndSaveAs";
	const COMMAND_MARKDOWN_COPILOT_EDITING_TITLE_ACTIVE_CONTEXT = "markdown.copilot.editing.titleActiveContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE = "markdown.copilot.editing.indentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE = "markdown.copilot.editing.outdentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_APPLY_FILE_PATH_DIFF = "markdown.copilot.editing.applyFilePathDiff";
	const COMMAND_MARKDOWN_COPILOT_EDITING_LIST_FILE_PATH_DIFF = "markdown.copilot.editing.listFilePathDiff";
	const COMMAND_MARKDOWN_COPILOT_EDITING_PASTE_AS_MARKDOWN = "markdown.copilot.editing.pasteAsMarkdown";

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_LIST_FILE_PATH_DIFF,
		(uri: vscode.Uri) => listFilePathDiff(uri)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_APPLY_FILE_PATH_DIFF,
		(selectionOverride?: vscode.Selection) => applyFilePathDiff(selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, true, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, false, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE_AS,
		() => nameAndSaveAs()
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_TITLE_ACTIVE_CONTEXT, async () => {
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor === undefined) { return; }

		const activeLineRanges = outline.toActiveLineRanges();
		if (activeLineRanges.length === 0) { return; }

		const document = textEditor.document;
		const documentEol = toEolString(document.eol);

		const activeLineRangesStart = activeLineRanges[0].start;

		const activeContextText = document.getText(
			new vscode.Range(
				activeLineRangesStart,
				activeLineRanges.at(-1)!.end
			)
		).replaceAll(documentEol, LF);

		if (activeContextText.trim().length === 0) { return; }

		const configuration = vscode.workspace.getConfiguration();
		const titleMessage = configuration.get<string>("markdown.copilot.instructions.titleMessage");
		if (titleMessage === undefined || titleMessage.trim().length === 0) {
			return;
		}

		vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: "Markdown Copilot: Title the context",
			cancellable: true
		}, async (_progress, token) => {
			const lineRangeStartLine = activeLineRangesStart.line;
			const match = document.lineAt(lineRangeStartLine).text.match(/^(#[ \t]Copilot Context:[ \t]).*$/);

			const completion = new ChatCompletion(textEditor, document.offsetAt(activeLineRangesStart));
			token.onCancellationRequested(() => completion.cancel());

			try {
				if (match !== null) {
					await completion.replaceLine(match[1], lineRangeStartLine);
				} else {
					await completion.insertText("# Copilot Context: \n", documentEol);
				}
				completion.setAnchorOffset(document.offsetAt(document.lineAt(lineRangeStartLine).range.end));
				await completion.completeText([
					{ role: ChatRole.User, content: activeContextText },
					{ role: ChatRole.User, content: titleMessage },
				], documentEol);
			} catch (error) {
				if (error instanceof Error) {
					const errorMessage = error.message.replace(/^\d+ /, "");
					vscode.window.showErrorMessage(errorMessage);
					await completion.insertText(errorMessage, documentEol);
				}
			} finally {
				completion.dispose();
			}
		});
	}));

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

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_PASTE_AS_MARKDOWN,
		() => pasteAsMarkdown()
	));

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
		textEditor => contextDecorator.onDidChangeActiveTextEditor(textEditor)
	));

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(
		event => contextDecorator.onDidChangeTextEditorSelection(event)
	));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(
		event => {
			contextDecorator.onDidChangeTextDocument(event);
			ChatCompletion.onDidChangeTextDocument(event);
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
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT, l10n.t("command.editing.continueWithoutContext.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE, l10n.t("command.editing.indentQuote.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE, l10n.t("command.editing.outdentQuote.title")),
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_APPLY_FILE_PATH_DIFF, l10n.t("command.editing.applyFilePathDiff.title")),
			];

			function newCodeAction(command: string, title: string): vscode.CodeAction {
				const action = new vscode.CodeAction(title, vscode.CodeActionKind.Empty);
				action.command = { command: command, title: title };
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
					command: command,
					title: title,
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
					'@import "${1:target_file_path}"',
					l10n.t("command.completion.import.detail"),
					"1",
				),
				newCompletionItem(
					vscode.CompletionItemKind.Module,
					'```json copilot-options\n{"temperature":${1:0.01},"max_tokens":${2:4096},"model":"${3:gpt-4o}","response_format":{"type":"${4:text}"}}\n```',
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
				item.range = range.with(new vscode.Position(position.line, range.end.character - offset));
				return item;
			}
		}
	}));
}

export function deactivate() {
	ChatCompletion.onDeactivate();
}

async function continueEditing(outline: ContextOutline, useContext: boolean, selectionOverride?: vscode.Selection) {
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

	const chatMessageBuilder = new ChatMessageBuilder(document);

	const configuration = vscode.workspace.getConfiguration();
	const systemMessage = configuration.get<string>("markdown.copilot.instructions.systemMessage");
	if (systemMessage !== undefined && systemMessage.trim().length !== 0) {
		chatMessageBuilder.addChatMessage(ChatRoleFlags.System, systemMessage);
	}

	const userStartLineText = document.lineAt(userStart.line).text;
	const userEndLineText = document.lineAt(userEnd.line).text;
	const userEndLineQuoteIndent = countQuoteIndent(userEndLineText);
	let userEndOffset = document.offsetAt(userEnd);

	const userStartLineQuoteIndentText = getQuoteIndent(userStartLineText);
	const userEndLineQuoteIndentText = getQuoteIndent(userEndLineText);

	const selectedText = document.getText(userRange);

	let selectedUserMessage = outdentQuote(
		selectedText,
		userEndLineQuoteIndent
	).replaceAll(documentEol, LF);

	// Check if the last user message already has a `**User:** ` prefix
	const userStartLineMatchesUser = userStartLineText.match(/\*\*User:\*\*[ \t]*/);
	if (userStartLineMatchesUser !== null) {
		// Remove `**User:** ` from the start of the last user message
		selectedUserMessage = selectedUserMessage.replace(userStartLineMatchesUser[0], "");
	} else {
		// Insert `**User:** ` at the start of the user selection
		const edit = new vscode.WorkspaceEdit();
		const insertText = "**User:** ";
		edit.insert(
			document.uri,
			document.positionAt(document.offsetAt(userStart) + (userStart.character > 0 ? 0 : countChar(userStartLineQuoteIndentText))),
			insertText
		);
		await vscode.workspace.applyEdit(edit);
		userEndOffset += countChar(insertText);
	}

	const titleText = selectedText.replaceAll(/[\r\n]+/g, " ").trim();
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: `Markdown Copilot: ${titleText.length > 64
			? titleText.slice(0, 63) + '…'
			: titleText
			}`,
		cancellable: true
	}, async (_progress, token) => {
		const userEndLineEol = documentEol + userEndLineQuoteIndentText;
		const completion = new ChatCompletion(textEditor, userEndOffset);
		token.onCancellationRequested(() => completion.cancel());
		try {
			const offsetDiff = await completion.insertText("\n\n**Copilot:** ", userEndLineEol);
			completion.translateAnchorOffset(offsetDiff);

			if (useContext) {
				chatMessageBuilder.addLines(await collectActiveLines(outline, document, userStart));
			}
			chatMessageBuilder.addChatMessage(ChatRoleFlags.User, selectedUserMessage);

			return await completion.completeText(
				chatMessageBuilder.toChatMessages(),
				userEndLineEol,
				chatMessageBuilder.getCopilotOptions(),
			);
		} catch (e) {
			if (e instanceof Error) {
				// remove head error code
				const errorMessage = e.message.replace(/^\d+ /, "");
				vscode.window.showErrorMessage(errorMessage);
				return completion.insertText(
					errorMessage,
					userEndLineEol
				);
			}
		} finally {
			completion.dispose();
		}
	});
}

async function collectActiveLines(outline: ContextOutline, document: vscode.TextDocument, userStart: vscode.Position) {
	const documentEol = toEolString(document.eol);

	const importedDocumentUriTexts: string[] = [];
	const activeLineTexts: string[] = [];

	async function resolveImport(document: vscode.TextDocument, lineTexts: string) {
		function openRelativeTextDocument(document: vscode.TextDocument, fragmentUriText: string) {
			const fullUri = resolveFragmentUri(document, fragmentUriText);
			if (fullUri === null) {
				throw new Error(l10n.t(
					"command.editing.continueInContext.import.error",
					fragmentUriText,
					vscode.workspace.asRelativePath(document.fileName)
				));
			}
			return vscode.workspace.openTextDocument(fullUri);
		}

		// Avoid recursive import infinity loop.
		const documentUriText = document.uri.toString();
		if (importedDocumentUriTexts.includes(documentUriText)) {
			return;
		}
		importedDocumentUriTexts.push(documentUriText);
		try {
			// Find lines with `@import "file.md"` and append its content to the active context.
			for (const line of lineTexts.split(/\r?\n/)) {
				// Format conforms to crossnote filepath
				// see: https://github.com/shd101wyy/crossnote/blob/master/src/markdown-engine/transformer.ts#L601
				const match = line.match(/\@import\s+\"([^\"]+)\"/);
				if (match === null) {
					activeLineTexts.push(line);
					continue;
				}
				const importDocument = await openRelativeTextDocument(document, match[1].trim());
				await resolveImport(importDocument, importDocument.getText());
			}
		} finally {
			importedDocumentUriTexts.pop();
		}
	}

	for (const lineRange of outline.toActiveLineRanges()) {
		if (lineRange.start.isAfterOrEqual(userStart)) {
			break;
		}
		const lineTexts = outdentQuote(
			document.getText(new vscode.Range(
				lineRange.start,
				lineRange.end.isAfterOrEqual(userStart)
					? document.positionAt(Math.max(document.offsetAt(userStart) - 1, 0))
					: lineRange.end
			)),
			lineRange.quoteIndent
		);
		await resolveImport(document, lineTexts);
	}

	return activeLineTexts.join(documentEol).split(documentEol);
}

async function pasteAsMarkdown() {
	const textEditor = vscode.window.activeTextEditor;
	if (textEditor === undefined) { return; }

	let clipboardContent = await vscode.env.clipboard.readText();
	clipboardContent = clipboardContent.trim();
	if (!clipboardContent) { return; }

	const userRange = toOverflowAdjustedRange(textEditor);
	const userStart = userRange.start;
	const userEnd = userRange.end;

	const document = textEditor.document;
	const documentEol = toEolString(document.eol);

	const userEndLineText = document.lineAt(userEnd.line).text;
	const userEndLineQuoteIndentText = getQuoteIndent(userEndLineText);

	if (!userRange.isEmpty) {
		const edit = new vscode.WorkspaceEdit();
		edit.delete(textEditor.document.uri, userRange);
		await vscode.workspace.applyEdit(edit);
	}

	const titleText = "Pasting clipboard content as Markdown";
	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: `Markdown Copilot: ${titleText}`,
		cancellable: true
	}, async (_progress, token) => {
		const userEndLineEol = documentEol + userEndLineQuoteIndentText;
		const completion = new ChatCompletion(textEditor, document.offsetAt(userStart));
		token.onCancellationRequested(() => completion.cancel());
		try {
			const configuration = vscode.workspace.getConfiguration();
			const pasteAsMarkdownMessage = configuration.get<string>("markdown.copilot.instructions.pasteAsMarkdownMessage");
			if (pasteAsMarkdownMessage === undefined || pasteAsMarkdownMessage.trim().length === 0) {
				return;
			}

			await completion.completeText(
				[
					{ role: ChatRole.User, content: pasteAsMarkdownMessage },
					{ role: ChatRole.User, content: clipboardContent },
				],
				userEndLineEol,
			);
		} catch (e) {
			if (e instanceof Error) {
				// remove head error code
				const errorMessage = e.message.replace(/^\d+ /, "");
				vscode.window.showErrorMessage(errorMessage);
				await completion.insertText(
					errorMessage,
					userEndLineEol
				);
			}
		} finally {
			completion.dispose();
		}
	});
}
