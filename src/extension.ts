import * as l10n from '@vscode/l10n';
import { AssertionError } from 'assert';
import OpenAI from 'openai';
import { Stream } from "openai/streaming";
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	initializeL10n(context.extensionUri);

	const outline = new DocumentOutline();
	const contextDecorator = new ContextDecorator(outline, vscode.window.activeTextEditor);

	const COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE = "markdown.copilot.editing.continue";
	const COMMAND_MARKDOWN_COPILOT_EDITING_INDENT_QUOTE = "markdown.copilot.editing.indentQuote";
	const COMMAND_MARKDOWN_COPILOT_EDITING_OUTDENT_QUOTE = "markdown.copilot.editing.outdentQuote";

	context.subscriptions.push(vscode.commands.registerCommand(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE, (selectionOverride?: vscode.Selection) => {
		const textEditor = vscode.window.activeTextEditor;
		if (textEditor === undefined) { return; }
		if (selectionOverride === undefined) {
			if (textEditor.selection.isEmpty) { return; }
		} else if (selectionOverride.isEmpty) { return; }

		const document = textEditor.document;

		const userRange = toOverflowAdjustedRange(textEditor, selectionOverride);
		const userStart = userRange.start;
		const userEnd = userRange.end;

		const activeLineTexts: string[] = [];

		for (const lineRange of outline.toActiveLineRanges()) {
			if (lineRange.start.isAfterOrEqual(userStart)) {
				break;
			}
			activeLineTexts.push(
				outdentQuote(
					document.getText(new vscode.Range(
						lineRange.start,
						lineRange.end.isAfterOrEqual(userStart)
							? document.positionAt(Math.max(document.offsetAt(userStart) - 1, 0))
							: lineRange.end
					)),
					lineRange.quoteIndent
				)
			);
		}

		const configuration = vscode.workspace.getConfiguration();
		const systemMessage = configuration.get<string>("markdown.copilot.openAI.systemMessage");

		const chatMessages: ChatMessage[] = systemMessage === undefined || systemMessage.trim().length === 0
			? []
			: [{ role: ChatRole.System, content: systemMessage }];
		const pushChatMessage = (role: ChatRole, lineTexts: string[]): void => {
			const message = lineTexts.join(LF);
			if (message.length === 0) { return; }
			chatMessages.push({
				role: role,
				content: message
			});
		};

		const chatMessagelineTexts: string[] = [];
		const documentEol = toEolString(document.eol);

		let previousChatRole = ChatRole.User;
		for (const lineText of activeLineTexts.join(documentEol).split(documentEol)) {
			const lineChatRole = toChatRole(lineText);
			switch (lineChatRole) {
				default:
					pushChatMessage(previousChatRole, chatMessagelineTexts);
					chatMessagelineTexts.length = 0;
					previousChatRole = lineChatRole;
				case previousChatRole:
					chatMessagelineTexts.push(removeChatRole(lineText));
					break;
				case ChatRole.None:
					chatMessagelineTexts.push(lineText);
					break;
			}
		}
		pushChatMessage(previousChatRole, chatMessagelineTexts);

		const userEndLineText = document.lineAt(userEnd.line).text;
		const userEndLineQuoteIndent = countQuoteIndent(userEndLineText);
		const userEndOffset = document.offsetAt(userEnd);

		const userStartLineQuoteIndentText = document.lineAt(userStart.line).text.match(quoteIndentRegex)?.[0] || '';
		const userEndLineQuoteIndentText = userEndLineText.match(quoteIndentRegex)?.[0] || '';

		const selectionText = document.getText(userRange);
		chatMessages.push({
			role: ChatRole.User,
			content: outdentQuote(
				selectionText,
				userEndLineQuoteIndent
			).replaceAll(documentEol, LF)
		});

		const completion = new Completion(
			document,
			document.offsetAt(userStart) + (userStart.character > 0 ? 0 : countChar(userStartLineQuoteIndentText))
		);

		const titleText = selectionText.replaceAll(/[\r\n]+/g, " ").trim();
		vscode.window.withProgress({
			location: vscode.ProgressLocation.Window,
			title: `Markdown Copilot: ${titleText.length > 64
				? titleText.slice(0, 63) + '…'
				: titleText
				}`,
			cancellable: true
		}, async (_progress, token) => {
			token.onCancellationRequested(() => completion.cancel());
			return completion.insertText(
				(userStart.character > 0 ? LF : "") + "**User:** ",
				documentEol + userStartLineQuoteIndentText
			).then(offsetDiff => {
				completion.setAnchorOffset(userEndOffset + offsetDiff);
				return completion.insertText(
					"\n\n**Copilot:** ",
					documentEol + userEndLineQuoteIndentText
				);
			}).then(offsetDiff => {
				completion.translateAnchorOffset(offsetDiff);
				return completion.completeText(
					chatMessages,
					documentEol + userEndLineQuoteIndentText
				);
			}).catch(error =>
				vscode.window.showErrorMessage(
					error.message.replace(/^\d+ /, ""),
				)
			).finally(
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
				newCodeAction(COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE, l10n.t("command.editing.continue.title")),
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

			if (activeTextEditor.selection.isEmpty) {
				return;
			}

			const item = new vscode.CompletionItem("Copilot continue");
			item.kind = vscode.CompletionItemKind.Text;
			item.insertText = document.getText(activeTextEditor.selection);
			item.detail = l10n.t("command.editing.continue.detail");
			item.keepWhitespace = false;
			item.command = {
				command: COMMAND_MARKDOWN_COPILOT_EDITING_CONTINUE,
				title: l10n.t("command.editing.continue.title"),
				arguments: [activeTextEditor.selection],
			};
			return [item];
		}
	}));

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('markdown', {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken, _context: vscode.CompletionContext) {
			const insertText = "# Copilot Session: ";
			const offset = partialEndsWith(document.lineAt(position.line).text, insertText, /(?!^)#+/);
			if (offset === 0) { return; }
			const item = new vscode.CompletionItem(insertText, vscode.CompletionItemKind.Keyword);
			item.range = document.lineAt(position.line).range;
			return [item];
		}
	}, '#'));
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

function isSessionSeparate(lineText: string): boolean {
	return lineText.match(/^#\sCopilot Session/) !== null;
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
			if (isSessionSeparate(textLineText)) {
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
	};

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
	private document: vscode.TextDocument;
	private anchorOffset: number;
	private changes: Set<string>;
	private abortController?: AbortController;

	constructor(document: vscode.TextDocument, anchorOffset: number) {
		this.document = document;
		this.anchorOffset = anchorOffset;
		this.changes = new Set();
		this.abortController = undefined;
		Completion.runningCompletions.add(this);
	}

	dispose() {
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
		edit.insert(
			this.document.uri,
			this.document.positionAt(this.anchorOffset),
			text
		);
		this.changes.add(`${this.anchorOffset},${text},${this.document.uri}`);
		return vscode.workspace.applyEdit(
			edit,
		).then(() => countChar(text));
	};

	private async createStream(chatMessages: ChatMessage[]): Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
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
		const openai = new OpenAI({ apiKey: apiKey });
		const stream = await openai.chat.completions.create({
			model: configuration.get<string>("markdown.copilot.openAI.model")!,
			messages: chatMessages as OpenAI.ChatCompletionMessageParam[],
			temperature: configuration.get<number>("markdown.copilot.openAI.temperature")!,
			stream: true,
		});
		return stream;
	}

	async completeText(chatMessages: ChatMessage[], lineSeparator: string) {
		const stream = await this.createStream(chatMessages);
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
	};
}

enum ChatRole {
	System = "system",
	User = "user",
	Assistant = "assistant",
	None = "none",
}

interface ChatMessage {
	role: ChatRole;
	content: string;
}

const roleRegex = /\*\*(System|User|Copilot):\*\*/;
const tagToChatRoles = new Map<string, ChatRole>([
	["System", ChatRole.System],
	["User", ChatRole.User],
	["Copilot", ChatRole.Assistant],
]);

function toChatRole(lineText: string): ChatRole {
	const match = lineText.match(roleRegex);
	if (match === null) { return ChatRole.None; }
	return tagToChatRoles.get(match[1])!;
};

function removeChatRole(text: string): string {
	return text.replace(roleRegex, "");
};

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
	return text.replace(new RegExp(`^(>\\s?){0,${level}}`, "gm"), "");
};

function indentQuote(text: string, level: number): string {
	const headQuoteMatch = text.match(/^(>\s?)/);
	const quoteIndentText = headQuoteMatch === null
		? "> "
		: headQuoteMatch[1];
	return text.replace(/(?<!\r)^/gm, quoteIndentText.repeat(level));
}

const quoteIndentRegex = /^(>\s?)+/;
function countQuoteIndent(lineText: string): number {
	const match = lineText.match(quoteIndentRegex);
	if (match === null) { return 0; }
	const quoteHead = match[0];

	let count = 0;
	for (let i = 0; i < quoteHead.length; i++) {
		count += +('>' === quoteHead[i]);
	}
	return count;
};

/*
 * Utilities for code points and line breaks
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
};

const intlSegmenter = new Intl.Segmenter();
export function countChar(text: string): number {
	let result = 0;
	for (const data of intlSegmenter.segment(text)) {
		result += data.segment === CRLF ? 2 : 1;
	}
	return result;
};

/*
 * Utilities for l10n
 */
function initializeL10n(baseUri: vscode.Uri, forcedLocale?: string) {
	const defaultPackageNlsJson = "package.nls.json";
	const locale: string = forcedLocale || JSON.parse(process.env.VSCODE_NLS_CONFIG as string).locale;
	const packageNlsJson = locale === 'en' ? defaultPackageNlsJson : `package.nls.${locale}.json`;
	try {
		l10n.config(vscode.Uri.joinPath(baseUri, packageNlsJson));
	} catch {
		console.error("Cannot load l10n resource file:", packageNlsJson);
		l10n.config(vscode.Uri.joinPath(baseUri, defaultPackageNlsJson));
	}
}