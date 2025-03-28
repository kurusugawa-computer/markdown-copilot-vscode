/*
 * Utilities for handling quote indentation in markdown text.
 */

export function outdentQuote(text: string, level: number): string {
	return text.replace(new RegExp(`^(>[ \t]?){0,${level}}`, "gm"), "");
}

export function indentQuote(text: string, level: number): string {
	const headQuoteMatch = text.match(/^(>[ \t]?)/);
	const quoteIndentText = headQuoteMatch === null
		? "> "
		: headQuoteMatch[1];
	return text.replace(/(?<!\r)^/gm, quoteIndentText.repeat(level));
}

const quoteIndentationPattern = /^(>[ \t]?)+/;
export function getQuoteIndent(lineText: string): string {
	const match = lineText.match(quoteIndentationPattern);
	if (match === null) { return ""; }
	return match[0];
}

export function countQuoteIndent(lineText: string): number {
	const quoteHead = getQuoteIndent(lineText);
	let count = 0;
	for (const c of quoteHead) {
		count += +(c === '>');
	}
	return count;
}