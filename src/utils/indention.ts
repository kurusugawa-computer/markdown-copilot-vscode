/*
 * Utilities for handling quote indentation in markdown text.
 */
import * as vscode from 'vscode';
import * as config from "./configuration";

let quoteIndentationPatternCache: RegExp | null = null;
let quoteHeadPatternCache: RegExp | null = null;
let currentQuoteChar: string = '';

/**
 * Initialize or update the RegExp cache based on the current configuration
 */
export function updateRegExpCache(): void {
	const quoteChar = config.get().indentationQuoteCharacter;

	if (currentQuoteChar === quoteChar) { return; }
	currentQuoteChar = quoteChar;
	quoteIndentationPatternCache = new RegExp(`^(${quoteChar}[ \t]?)+`);
	quoteHeadPatternCache = new RegExp(`^(${quoteChar}[ \t]?)`);
}

/**
 * Handle configuration changes for indentation settings
 */
export function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent): void {
	if (!event.affectsConfiguration('markdown.copilot.indentation.quoteCharacter')) { return; }
	updateRegExpCache();
}

/**
 * Get the cached quote indentation pattern
 */
function getQuoteIndentationPattern(): RegExp {
	if (!quoteIndentationPatternCache) {
		updateRegExpCache();
	}
	return quoteIndentationPatternCache!;
}

/**
 * Get the cached quote head pattern
 */
function getQuoteHeadPattern(): RegExp {
	if (!quoteHeadPatternCache) {
		updateRegExpCache();
	}
	return quoteHeadPatternCache!;
}

export function outdentQuote(text: string, level: number): string {
	const quoteChar = currentQuoteChar || config.get().indentationQuoteCharacter;
	return text.replace(new RegExp(`^(${quoteChar}[ \t]?){0,${level}}`, "gm"), "");
}

export function indentQuote(text: string, level: number): string {
	const quoteChar = currentQuoteChar || config.get().indentationQuoteCharacter;
	const headQuoteMatch = text.match(getQuoteHeadPattern());
	const quoteIndentText = headQuoteMatch === null
		? quoteChar + " "
		: headQuoteMatch[1];
	return text.replace(/(?<!\r)^/gm, quoteIndentText.repeat(level));
}

export function getQuoteIndent(lineText: string): string {
	const match = lineText.match(getQuoteIndentationPattern());
	if (match === null) { return ""; }
	return match[0];
}

export function countQuoteIndent(lineText: string): number {
	const quoteHead = getQuoteIndent(lineText);
	const quoteChar = currentQuoteChar || config.get().indentationQuoteCharacter;
	let count = 0;
	let i = 0;

	while (i < quoteHead.length) {
		if (quoteHead.substring(i, i + quoteChar.length) === quoteChar) {
			count++;
			i += quoteChar.length;
		} else {
			i++;
		}
	}

	return count;
}
