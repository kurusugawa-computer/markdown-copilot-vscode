import * as l10n from '@vscode/l10n';
import { AssertionError } from 'assert';
import { AzureOpenAI, OpenAI } from 'openai';
import { Stream } from "openai/streaming";
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	initializeL10n(context.extensionUri);

	const outline = new DocumentOutline();
	const contextDecorator = new ContextDecorator(outline, vscode.window.activeTextEditor);

	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT = "markdown.copilot.editing.continueInContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT = "markdown.copilot.editing.continueWithoutContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_TITLE_ACTIVE_CONTEXT = "markdown.copilot.editing.titleActiveContext";
	const COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE = "markdown.copilot.editing.indentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE = "markdown.copilot.editing.outdentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE = "markdown.copilot.editing.nameAndSave";

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_IN_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, true, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE_WITHOUT_CONTEXT,
		(selectionOverride?: vscode.Selection) => continueEditing(outline, false, selectionOverride)
	));

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_NAME_AND_SAVE, async () => {
		const configuration = vscode.workspace.getConfiguration();
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor === undefined) { return; }

		function getDate(): string {
			const date = new Date();
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			return `${year}-${month}-${day}`;
		}

		const stream = await createStream(
			[
				{ role: 'system', content: 'Provide a filename that best describes given content, using the same language as the content.' },
				{
					role: 'system', content: `Also follow the instruction: "${configuration.get<string>('markdown.copilot.instructions.titleMessage')}`
				},
				{ role: 'system', content: 'The filename must be concise, not contain any invalid filename characters, not contain any extensions, and not contain any whitespaces.' },
				{ role: 'system', content: 'The filename must be returned in JSON format with the following format: {"filename":"{generated filename}"}' },
				{ role: 'user', content: `Content:\n${textEditor.document.getText()}` }
			] as OpenAIChatMessage[], {} as OpenAI.ChatCompletionCreateParamsStreaming);
		let json = "";
		for await (const chunk of stream) {
			const chunkText = chunk.choices[0]?.delta?.content || '';
			json += chunkText;
		}

		let suggested_filename: string;
		try {
			suggested_filename = JSON.parse(json).filename;
		} catch {
			vscode.window.showErrorMessage("Failed to suggest a filename. Try again.");
			return;
		}
		const filename = await vscode.window.showInputBox({ title: "Edit filename if necessary", value: suggested_filename }) || suggested_filename;

		let filepath = configuration.get<string>("markdown.copilot.instructions.autonameFilepath");
		if (filepath === undefined || filepath.trim().length === 0) {
			filepath = "memo/${date}/${filename}.md";
		}
		filepath = filepath.replace("${date}", getDate());
		filepath = filepath.replace("${filename}", filename);

		const destUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, filepath);
		vscode.workspace.fs.writeFile(destUri, Buffer.from(textEditor.document.getText()))
			.then((_) => vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor'))
			.then((_) => vscode.workspace.openTextDocument(destUri.path))
			.then((doc) => vscode.window.showTextDocument(doc));
	}));

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

			const completion = new Completion(textEditor, document.offsetAt(activeLineRangesStart));
			token.onCancellationRequested(() => completion.cancel());

			return (match !== null
				? completion.replaceLine(match[1], lineRangeStartLine)
				: completion.insertText("# Copilot Context: \n", documentEol)
			).then(() => {
				completion.setAnchorOffset(document.offsetAt(document.lineAt(lineRangeStartLine).range.end));
				return completion.completeText([
					{ role: OpenAIChatRole.User, content: activeContextText },
					{ role: OpenAIChatRole.User, content: titleMessage },
				], "", {} as OpenAI.ChatCompletionCreateParamsStreaming);
			}).catch(error => {
				const errorMessage = error.message.replace(/^\d+ /, "");
				vscode.window.showErrorMessage(errorMessage);
				return completion.insertText(
					errorMessage,
					documentEol
				);
			}).finally(
				() => completion.dispose()
			);
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

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(
		textEditor => contextDecorator.onDidChangeActiveTextEditor(textEditor)
	));

	context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(
		event => contextDecorator.onDidChangeTextEditorSelection(event)
	));

	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(
		event => contextDecorator.onDidChangeTextDocument(event)
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
					vscode.CompletionItemKind.Module,
					'```json copilot-options\n{"temperature":${1:0.01},"max_tokens":${2:4096},"model":"${3:gpt-4o}","response_format":{"type":"${4:text}"}}\n```',
					l10n.t("command.completion.copilot-options.detail"),
					"0",
				),
			].filter((e): e is NonNullable<typeof e> => e !== undefined);

			function newCompletionItem(kind: vscode.CompletionItemKind, insertText: string, detail: string, sortPrefix: string, ignore?: RegExp): vscode.CompletionItem | undefined {
				const offset = partialEndsWith(document.lineAt(position.line).text, insertText, ignore);
				if (offset === 0) { return; }
				const item = new vscode.CompletionItem(insertText, kind);
				item.sortText = sortPrefix + insertText;
				if (kind === vscode.CompletionItemKind.Module) {
					item.insertText = new vscode.SnippetString(insertText);
				} else {
					item.insertText = insertText;
				}
				item.detail = detail;
				const range = document.lineAt(position.line).range;
				item.range = range.with(new vscode.Position(position.line, range.end.character - offset));
				return item;
			}
		}
	}));
}

export function deactivate() {
	for (const completion of Completion.runningCompletions) {
		completion.cancel();
	}
}

interface LineRange {
	start: vscode.Position;
	end: vscode.Position;
	quoteIndent: number;
}

const isSelectionOverflow = (selection: vscode.Selection): boolean => !selection.isEmpty && selection.end.character === 0;

function isContextSeparate(lineText: string): boolean {
	return lineText.match(/^#[ \t]Copilot Context/) !== null;
}

class DocumentOutline {
	private readonly lineRanges: LineRange[] = [];
	private readonly activeLineRangeIndices: number[] = [];
	private readonly inactiveLineRangeIndices: number[] = [];

	private toRanges(lineRangeIndices: number[]): vscode.Range[] {
		const lineRanges = this.lineRanges;
		return Array.from(
			lineRangeIndices,
			e => new vscode.Range(lineRanges[e].start, lineRanges[e].end)
		);
	}

	toActiveLineRanges(): LineRange[] {
		const lineRanges = this.lineRanges;
		return Array.from(
			this.activeLineRangeIndices,
			e => lineRanges[e]
		);
	}

	toInactiveRanges(): vscode.Range[] {
		return this.toRanges(this.inactiveLineRangeIndices);
	}

	update(document: vscode.TextDocument, selection: vscode.Selection) {
		const activeLine = Math.max(
			0,
			selection.end.line - (isSelectionOverflow(selection) ? 1 : 0)
		);

		const firstLine = document.lineAt(0);
		const firstLineText = firstLine.text;

		let lineRange: LineRange = {
			start: firstLine.range.start,
			end: firstLine.range.end,
			quoteIndent: countQuoteIndent(firstLineText),
		};

		const lineRanges = this.lineRanges;
		lineRanges.length = 0;
		lineRanges.push(lineRange);

		let activeLineRangeIndex = 0;

		for (let line = 1; line < document.lineCount; ++line) {
			const textLine = document.lineAt(line);
			const textLineRange = textLine.range;
			const textLineText = textLine.text;
			if (isContextSeparate(textLineText)) {
				lineRange = {
					start: textLineRange.start,
					end: textLineRange.end,
					quoteIndent: 0,
				};
				if (line > activeLine) {
					lineRanges.push(lineRange);
					break;
				}
				lineRanges.length = 0;
				lineRanges.push(lineRange);
			}

			const quoteIndent = countQuoteIndent(textLineText);

			if (quoteIndent === lineRange.quoteIndent) {
				lineRange.end = textLineRange.end;
			} else {
				lineRange = {
					start: textLineRange.start,
					end: textLineRange.end,
					quoteIndent: quoteIndent
				};
				lineRanges.push(lineRange);
				if (line > activeLine) {
					break;
				}
			}

			if (line === activeLine) {
				activeLineRangeIndex = lineRanges.length - 1;
			}
		}
		// inactive lines up to the end
		lineRange.end = document.lineAt(document.lineCount - 1).range.end;

		const activeLineRangeIndices = this.activeLineRangeIndices;
		activeLineRangeIndices.length = 0;

		const inactiveLineRangeIndices = this.inactiveLineRangeIndices;
		inactiveLineRangeIndices.length = 0;

		let activeQuoteIndent = lineRanges[activeLineRangeIndex].quoteIndent;
		do {
			if (lineRanges[activeLineRangeIndex].quoteIndent > activeQuoteIndent) {
				inactiveLineRangeIndices.push(activeLineRangeIndex);
			} else {
				activeLineRangeIndices.push(activeLineRangeIndex);
				activeQuoteIndent = lineRanges[activeLineRangeIndex].quoteIndent;
			}
		} while (--activeLineRangeIndex >= 0);
		activeLineRangeIndices.reverse();

		const lastLineRangeIndex = lineRanges.length - 1;
		if (!activeLineRangeIndices.includes(lastLineRangeIndex)) {
			inactiveLineRangeIndices.push(lastLineRangeIndex);
		}

		// inactive lines up to the start
		if (lineRanges[0].start.line > 0) {
			inactiveLineRangeIndices.push(
				lineRanges.push({ start: document.positionAt(0), end: lineRanges[0].start, quoteIndent: 0 }) - 1
			);
		}
	}
}

class ContextDecorator {
	private _outline: DocumentOutline;
	private _activeTextEditor?: vscode.TextEditor;
	private _previousLine: number;
	private _inactiveDecorationType: vscode.TextEditorDecorationType;

	constructor(outline: DocumentOutline, activeTextEditor?: vscode.TextEditor) {
		this._outline = outline;
		this._activeTextEditor = activeTextEditor;
		this._previousLine = -1;
		this._inactiveDecorationType = ContextDecorator.toInactiveDecorationType(vscode.workspace.getConfiguration());
	}

	private updateDecorations(textEditor: vscode.TextEditor) {
		this._outline.update(textEditor.document, textEditor.selection);
		textEditor.setDecorations(
			this._inactiveDecorationType,
			this._outline.toInactiveRanges()
		);
	}

	private static toInactiveDecorationType(configuration: vscode.WorkspaceConfiguration) {
		const inactiveContextOpacity = configuration.get<number>("markdown.copilot.decorations.inactiveContextOpacity");
		return vscode.window.createTextEditorDecorationType({
			opacity: `${Math.round((inactiveContextOpacity || 0.5) * 100)}%`,
		});
	}

	get activeTextEditor() { return this._activeTextEditor; }

	onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
		if (!event.affectsConfiguration("markdown.copilot.decorations.inactiveContextOpacity")) { return; }
		this._inactiveDecorationType = ContextDecorator.toInactiveDecorationType(vscode.workspace.getConfiguration());
	}

	onDidChangeActiveTextEditor(textEditor?: vscode.TextEditor) {
		this._activeTextEditor = textEditor;
		this._previousLine = -1;
		if (textEditor === undefined) { return; }
		this.updateDecorations(textEditor);
	}

	onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent) {
		const textEditor = event.textEditor;
		if (this._activeTextEditor !== textEditor) { return; }
		const activeLine = textEditor.selection.active.line;
		if (activeLine === this._previousLine) { return; }
		this.updateDecorations(textEditor);
		this._previousLine = activeLine;
	}

	onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		for (const completion of Completion.runningCompletions) {
			completion.onDidChangeTextDocument(event);
		}
		const activeTextEditor = this._activeTextEditor;
		if (activeTextEditor === undefined) { return; }
		if (activeTextEditor.document !== event.document) { return; }
		this.updateDecorations(activeTextEditor);
	}
}

/*
 * Completion
 */
class Completion {
	static readonly runningCompletions = new Set<Completion>();
	private textEditor: vscode.TextEditor;
	private document: vscode.TextDocument;
	private anchorOffset: number;
	private changes: Set<string>;
	private abortController?: AbortController;
	private completionIndicator: vscode.TextEditorDecorationType;

	constructor(textEditor: vscode.TextEditor, anchorOffset: number) {
		this.textEditor = textEditor;
		this.document = textEditor.document;
		this.anchorOffset = anchorOffset;
		this.changes = new Set();
		this.abortController = undefined;
		this.completionIndicator = vscode.window.createTextEditorDecorationType({
			after: { contentText: "📝" },
		});
		Completion.runningCompletions.add(this);
	}

	dispose() {
		this.completionIndicator.dispose();
		Completion.runningCompletions.delete(this);
	}

	cancel(reason?: any) {
		this.abortController?.abort(reason);
	}

	setAnchorOffset(anchorOffset: number): number {
		this.anchorOffset = anchorOffset;
		return this.anchorOffset;
	}

	translateAnchorOffset(diffAnchorOffset: number) {
		this.anchorOffset += diffAnchorOffset;
		return this.anchorOffset;
	}

	onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		if (event.document !== this.document) { return; }
		for (const change of event.contentChanges) {
			const changeStartOffset = change.rangeOffset;
			if (changeStartOffset > this.anchorOffset) { continue; }
			if (this.changes.delete(`${changeStartOffset},${change.text},${event.document.uri}`)) { continue; }

			const changeOffsetDiff = countChar(change.text) - change.rangeLength;
			const changeEndOffset = change.rangeOffset + change.rangeLength;
			if (changeEndOffset > this.anchorOffset) {
				this.anchorOffset = changeEndOffset;
			} else {
				this.anchorOffset += changeOffsetDiff;
			}
		}
	}

	async insertText(text: string, lineSeparator: string): Promise<number> {
		text = lineSeparator === LF ? text : text.replaceAll(LF, lineSeparator);
		const edit = new vscode.WorkspaceEdit();
		const anchorPosition = this.document.positionAt(this.anchorOffset);
		edit.insert(
			this.document.uri,
			anchorPosition,
			text
		);
		this.textEditor.setDecorations(this.completionIndicator, [new vscode.Range(anchorPosition, anchorPosition)]);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		return vscode.workspace.applyEdit(
			edit,
		).then(() => countChar(text));
	}

	async replaceLine(text: string, line: number): Promise<number> {
		const textLine = this.document.lineAt(line);
		const deleteCharCount = countChar(textLine.text);
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			this.document.uri,
			textLine.range,
			text
		);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		return vscode.workspace.applyEdit(
			edit,
		).then(() => countChar(text) - deleteCharCount);
	}

	async completeText(chatMessages: OpenAIChatMessage[], lineSeparator: string, override: OpenAI.ChatCompletionCreateParamsStreaming) {
		const stream = await createStream(chatMessages, override);
		this.abortController = stream.controller;

		const chunkTextBuffer: string[] = [];
		const submitChunkText = async (chunkText: string): Promise<number> => {
			chunkTextBuffer.push(chunkText);
			if (!chunkText.includes(LF)) { return 0; }
			const chunkTextBufferText = chunkTextBuffer.join("");
			chunkTextBuffer.length = 0;
			return this.insertText(chunkTextBufferText, lineSeparator);
		};

		for await (const chunk of stream) {
			const chunkText = chunk.choices[0]?.delta?.content || '';
			if (chunkText.length === 0) { continue; }
			this.anchorOffset += await submitChunkText(chunkText);
		}
		// flush chunkTextBuffer
		this.anchorOffset += await submitChunkText(LF);
	}
}

async function createStream(chatMessages: OpenAIChatMessage[], override: OpenAI.ChatCompletionCreateParamsStreaming): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
	const configuration = vscode.workspace.getConfiguration();
	let apiKey = configuration.get<string>("markdown.copilot.openAI.apiKey");
	const isValidApiKey = (apiKey?: string): boolean => apiKey !== undefined && apiKey.length > 6;
	if (!isValidApiKey(apiKey)) {
		apiKey = await vscode.window.showInputBox({ placeHolder: 'Enter your OpenAI API key.' });
		if (!isValidApiKey(apiKey)) {
			throw new Error(`401 Incorrect API key provided: ${apiKey}. You can find your API key at https://platform.openai.com/account/api-keys.`);
		}
		configuration.update("markdown.copilot.openAI.apiKey", apiKey);
	}
	const baseUrl = configuration.get<string>("markdown.copilot.openAI.azureBaseUrl");
	const openai: OpenAI | AzureOpenAI = (() => {
		if (!baseUrl) {
			return new OpenAI({ apiKey: apiKey });
		}
		try {
			const url = new URL(baseUrl);
			return new AzureOpenAI({
				endpoint: url.origin,
				deployment: decodeURI(url.pathname.match("/openai/deployments/([^/]+)/completions")![1]),
				apiKey: apiKey,
				apiVersion: url.searchParams.get("api-version")!,
			});
		} catch {
			throw new TypeError(l10n.t(
				"config.openAI.azureBaseUrl.error",
				baseUrl,
				l10n.t("config.openAI.azureBaseUrl.description"),
			));
		}
	})();
	const stream = await openai.chat.completions.create(Object.assign(
		{
			model: configuration.get<string>("markdown.copilot.openAI.model")!,
			messages: chatMessages,
			temperature: configuration.get<number>("markdown.copilot.options.temperature")!,
			stream: true,
		}, override
	));
	return stream;
}

async function continueEditing(outline: DocumentOutline, useContext: boolean, selectionOverride?: vscode.Selection) {
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

	const chatMessageBuilder = new ChatMessageBuilder();

	const configuration = vscode.workspace.getConfiguration();
	const systemMessage = configuration.get<string>("markdown.copilot.instructions.systemMessage");
	if (systemMessage !== undefined && systemMessage.trim().length !== 0) {
		chatMessageBuilder.addChatMessage(ChatRoleFlags.System, systemMessage);
	}

	let errorMessage = null;

	if (useContext) {
		const importedDocumentUriTexts: string[] = [];
		const activeLineTexts: string[] = [];

		async function resolveImport(document: vscode.TextDocument, lineTexts: string) {
			async function resolveFragmentUri(document: vscode.TextDocument, fragmentUriText: string) {
				try {
					let fullUri = null;
					if (fragmentUriText.startsWith('/')) {
						fullUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, fragmentUriText);
					} else {
						if (document.uri.scheme === 'untitled') {
							throw new AssertionError();
						}
						fullUri = vscode.Uri.joinPath(document.uri, '..', fragmentUriText);
					}
					return await vscode.workspace.openTextDocument(fullUri);
				} catch {
					throw new Error(l10n.t(
						"command.editing.continueInContext.import.error",
						fragmentUriText,
						vscode.workspace.asRelativePath(document.fileName)
					));
				}
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
					await resolveFragmentUri(
						document, match[1].trim()
					).then(
						(importedDocument) => resolveImport(importedDocument, importedDocument.getText())
					);
				}
			} finally {
				importedDocumentUriTexts.pop();
			}
		}

		try {
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
		} catch (e) {
			if (e instanceof Error) {
				errorMessage = e.message;
			}
		}

		chatMessageBuilder.addLines(
			activeLineTexts.join(documentEol).split(documentEol)
		);
	}

	const userStartLineText = document.lineAt(userStart.line).text;
	const userEndLineText = document.lineAt(userEnd.line).text;
	const userEndLineQuoteIndent = countQuoteIndent(userEndLineText);
	const userEndOffset = document.offsetAt(userEnd);

	const userStartLineQuoteIndentText = userStartLineText.match(quoteIndentRegex)?.[0] || '';
	const userEndLineQuoteIndentText = userEndLineText.match(quoteIndentRegex)?.[0] || '';

	const selectionText = document.getText(userRange);

	let lastUserMessage = outdentQuote(
		selectionText,
		userEndLineQuoteIndent
	).replaceAll(documentEol, LF);

	const userStartLineMatchesUser = userStartLineText.match(/\*\*User:\*\*[ \t]*/);

	if (userStartLineMatchesUser !== null) {
		lastUserMessage = lastUserMessage.replace(userStartLineMatchesUser[0], "");
	}

	chatMessageBuilder.addChatMessage(ChatRoleFlags.User, lastUserMessage);

	const titleText = selectionText.replaceAll(/[\r\n]+/g, " ").trim();
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Window,
		title: `Markdown Copilot: ${titleText.length > 64
			? titleText.slice(0, 63) + '…'
			: titleText
			}`,
		cancellable: true
	}, async (_progress, token) => {
		const userEndLineEol = documentEol + userEndLineQuoteIndentText;
		const completion = new Completion(
			textEditor,
			document.offsetAt(userStart) + (userStart.character > 0 ? 0 : countChar(userStartLineQuoteIndentText))
		);
		token.onCancellationRequested(() => completion.cancel());
		return completion.insertText(
			userStartLineMatchesUser !== null ? "" : `${userStart.character > 0 ? documentEol : ""}**User:** `,
			documentEol + userStartLineQuoteIndentText
		).then(offsetDiff => {
			completion.setAnchorOffset(userEndOffset + offsetDiff);
			return completion.insertText(
				"\n\n**Copilot:** ",
				userEndLineEol
			);
		}).then(offsetDiff => {
			completion.translateAnchorOffset(offsetDiff);
			if (errorMessage !== null) {
				// Show errors to help users correct their text
				return completion.insertText(
					errorMessage,
					userEndLineEol
				).then(() => { });
			} else {
				return completion.completeText(
					chatMessageBuilder.toChatMessages(),
					userEndLineEol,
					chatMessageBuilder.getCopilotOptions(),
				);
			}
		}).catch(async error => {
			// remove head error code
			const errorMessage = error.message.replace(/^\d+ /, "");
			vscode.window.showErrorMessage(errorMessage);
			return completion.insertText(
				errorMessage,
				userEndLineEol
			);
		}).finally(
			() => completion.dispose()
		);
	});
}

class ChatMessageBuilder {
	private copilotOptions: OpenAI.ChatCompletionCreateParamsStreaming;
	private chatMessages: OpenAIChatMessage[];
	private isInvalid: boolean;

	constructor() {
		this.copilotOptions = {} as OpenAI.ChatCompletionCreateParamsStreaming;
		this.chatMessages = [];
		this.isInvalid = false;
	}

	addChatMessage(flags: ChatRoleFlags, message: string): void {
		if (this.isInvalid) { return; }
		if (message.length === 0) { return; }

		for (const match of message.matchAll(/```json +copilot-options\n([^]*?)\n```/gm)) {
			try {
				Object.assign(this.copilotOptions, JSON.parse(match[1]));
				message = message.replace(match[0], "");
			} catch {
				flags = ChatRoleFlags.User;
				message = "Correct the following JSON and answer in the language of the `" + getLocale() + "` locale:\n```\n" + match[1] + "\n```";
				this.copilotOptions = {} as OpenAI.ChatCompletionCreateParamsStreaming;
				this.chatMessages = [];
				this.isInvalid = true;
				break;
			}
		}

		const role = toOpenAIChatRole(flags);

		if (flags & ChatRoleFlags.Override) {
			this.chatMessages = this.chatMessages.filter(m => m.role !== role);
		}

		this.chatMessages.push({
			role: role,
			content: message,
		});
	}

	addLines(lines: string[]) {
		let previousChatRole = ChatRoleFlags.User;
		let chatMessagelineTexts: string[] = [];
		for (const lineText of lines) {
			const lineChatRoleFlags = toChatRole(lineText);
			if (ChatRoleFlags.None === lineChatRoleFlags) {
				chatMessagelineTexts.push(lineText);
				continue;
			}

			if (lineChatRoleFlags !== previousChatRole) {
				this.addChatMessageLines(previousChatRole, chatMessagelineTexts);
				previousChatRole = lineChatRoleFlags;
				chatMessagelineTexts = [];
			}

			chatMessagelineTexts.push(removeChatRole(lineText));
		}
		this.addChatMessageLines(previousChatRole, chatMessagelineTexts);
	}

	toChatMessages(): OpenAIChatMessage[] {
		return this.chatMessages;
	}

	getCopilotOptions(): OpenAI.ChatCompletionCreateParamsStreaming {
		return this.copilotOptions;
	}

	private addChatMessageLines(flags: ChatRoleFlags, textLines: string[]): void {
		this.addChatMessage(flags, textLines.join(LF));
	}
}

enum OpenAIChatRole {
	None = "none",
	System = "system",
	User = "user",
	Assistant = "assistant",
}

enum ChatRoleFlags {
	None = 0,
	Override = 1 << 0,
	System = 1 << 1,
	User = 1 << 2,
	Assistant = 1 << 3,
}

interface OpenAIChatMessage {
	role: OpenAIChatRole;
	content: string;
}

const roleRegex = /\*\*(System|User|Copilot)(\(Override\))?:\*\*/;
const matchToChatRoles = new Map<string, ChatRoleFlags>([
	["System", ChatRoleFlags.System],
	["User", ChatRoleFlags.User],
	["Copilot", ChatRoleFlags.Assistant],
]);

function toChatRole(text: string): ChatRoleFlags {
	const match = text.match(roleRegex);
	if (match === null) { return ChatRoleFlags.None; }
	return matchToChatRoles.get(match[1])!
		| (match[2] === "(Override)" ? ChatRoleFlags.Override : ChatRoleFlags.None);
}

function toOpenAIChatRole(flags: ChatRoleFlags): OpenAIChatRole {
	if (flags & ChatRoleFlags.User) { return OpenAIChatRole.User; }
	if (flags & ChatRoleFlags.Assistant) { return OpenAIChatRole.Assistant; }
	if (flags & ChatRoleFlags.System) { return OpenAIChatRole.System; }
	throw new AssertionError();
}

function removeChatRole(text: string): string {
	return text.replace(roleRegex, "");
}

/*
 * Utilities for ranges
 */
function toOverflowAdjustedRange(textEditor: vscode.TextEditor, selectionOverride?: vscode.Selection): vscode.Range {
	const document = textEditor.document;
	const selection = selectionOverride || textEditor.selection;
	return new vscode.Range(
		selection.start,
		isSelectionOverflow(selection) ? document.lineAt(selection.end.line - 1).range.end : selection.end
	);
}

function adjustStartToLineHead(range: vscode.Range): vscode.Range {
	return range.with(range.start.with({ character: 0 }));
}

function partialEndsWith(target: string, search: string, ignore?: RegExp): number {
	if (ignore && target.match(ignore)) { return 0; }
	const offsetEnd = Math.min(target.length, search.length);
	for (let offset = offsetEnd; offset >= 0; offset--) {
		if (target.endsWith(search.slice(0, offset))) { return offset; }
	}
	return 0;
}

/*
 * Utilities for quote indent
 */
function outdentQuote(text: string, level: number): string {
	return text.replace(new RegExp(`^(>[ \t]?){0,${level}}`, "gm"), "");
}

function indentQuote(text: string, level: number): string {
	const headQuoteMatch = text.match(/^(>[ \t]?)/);
	const quoteIndentText = headQuoteMatch === null
		? "> "
		: headQuoteMatch[1];
	return text.replace(/(?<!\r)^/gm, quoteIndentText.repeat(level));
}

const quoteIndentRegex = /^(>[ \t]?)+/;
function countQuoteIndent(lineText: string): number {
	const match = lineText.match(quoteIndentRegex);
	if (match === null) { return 0; }
	const quoteHead = match[0];

	let count = 0;
	for (let i = 0; i < quoteHead.length; i++) {
		count += +('>' === quoteHead[i]);
	}
	return count;
}

/*
 * Utilities for characters (code points and line breaks)
 */
const LF = '\n';
const CRLF = '\r\n';

function toEolString(eol: vscode.EndOfLine): string {
	switch (eol) {
		case vscode.EndOfLine.LF:
			return LF;
		case vscode.EndOfLine.CRLF:
			return CRLF;
		default:
			throw new AssertionError();
	}
}

const intlSegmenter = new Intl.Segmenter();
export function countChar(text: string): number {
	let result = 0;
	for (const data of intlSegmenter.segment(text)) {
		result += data.segment === CRLF ? 2 : 1;
	}
	return result;
}

/*
 * Utilities for l10n
 */
function getLocale(): string {
	return JSON.parse(process.env.VSCODE_NLS_CONFIG as string).locale;
}

function initializeL10n(baseUri: vscode.Uri, forcedLocale?: string) {
	const defaultPackageNlsJson = "package.nls.json";
	const locale: string = forcedLocale || getLocale();
	const packageNlsJson = locale === 'en' ? defaultPackageNlsJson : `package.nls.${locale}.json`;
	try {
		l10n.config(vscode.Uri.joinPath(baseUri, packageNlsJson));
	} catch {
		console.warn("Cannot load l10n resource file:", packageNlsJson);
		l10n.config(vscode.Uri.joinPath(baseUri, defaultPackageNlsJson));
	}
}