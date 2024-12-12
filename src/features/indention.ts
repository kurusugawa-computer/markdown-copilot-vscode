/*
 * Utilities for quote indent
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

const quoteIndentRegex = /^(>[ \t]?)+/;
export function getQuoteIndent(lineText: string): string {
	const match = lineText.match(quoteIndentRegex);
	if (match === null) { return ""; }
	return match[0];
}

export function countQuoteIndent(lineText: string): number {
	const quoteHead = getQuoteIndent(lineText);
	let count = 0;
	for (let i = 0; i < quoteHead.length; i++) {
		count += +('>' === quoteHead[i]);
	}
	return count;
}