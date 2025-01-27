import { AzureOpenAI, OpenAI } from 'openai';
import { Stream } from "openai/streaming";
import * as vscode from 'vscode';
import { LF, countChar } from '../utils';
import { ChatMessage, createOpenAIClient } from '../utils/llm';

export async function createChatCompletion(chatMessages: ChatMessage[], override: OpenAI.ChatCompletionCreateParams): Promise<OpenAI.Chat.Completions.ChatCompletion | Stream<OpenAI.Chat.Completions.ChatCompletionChunk>> {
	const configuration = vscode.workspace.getConfiguration();
	const openai: OpenAI | AzureOpenAI = await createOpenAIClient(configuration);
	return openai.chat.completions.create(Object.assign(
		{
			model: configuration.get<string>("markdown.copilot.openAI.model")!,
			messages: chatMessages,
			temperature: configuration.get<number>("markdown.copilot.options.temperature")!,
			stream: true,
		}, override
	));
}

/*
 * Completion
 */
export class ChatCompletion {
	// TODO: Remove dependency on events after introducing Anchor Position Update Mechanism

	private static readonly runningCompletions = new Set<ChatCompletion>();
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
		ChatCompletion.runningCompletions.add(this);
	}

	dispose() {
		this.completionIndicator.dispose();
		ChatCompletion.runningCompletions.delete(this);
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

	static onDeactivate() {
		for (const completion of ChatCompletion.runningCompletions) {
			completion.dispose();
		}
	}

	static onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
		for (const completion of ChatCompletion.runningCompletions) {
			completion.onDidChangeTextDocument(event);
		}
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
		await vscode.workspace.applyEdit(edit);
		return countChar(text);
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
		await vscode.workspace.applyEdit(edit);
		return countChar(text) - deleteCharCount;
	}

	async completeText(chatMessages: ChatMessage[], lineSeparator: string, override?: OpenAI.ChatCompletionCreateParams) {
		const completion = await createChatCompletion(chatMessages, override || {} as OpenAI.ChatCompletionCreateParams);

		if (!(completion instanceof Stream)) {
			this.anchorOffset += await this.insertText(completion.choices[0].message.content!, lineSeparator);
		} else {
			this.abortController = completion.controller;

			const chunkTextBuffer: string[] = [];
			const submitChunkText = async (chunkText: string): Promise<number> => {
				chunkTextBuffer.push(chunkText);
				if (!chunkText.includes(LF)) { return 0; }
				const chunkTextBufferText = chunkTextBuffer.join("");
				chunkTextBuffer.length = 0;
				return this.insertText(chunkTextBufferText, lineSeparator);
			};

			for await (const chunk of completion) {
				const chunkText = chunk.choices[0]?.delta?.content || '';
				if (chunkText.length === 0) { continue; }
				this.anchorOffset += await submitChunkText(chunkText);
			}
			// flush chunkTextBuffer
			this.anchorOffset += await submitChunkText(LF);
		}
	}
}