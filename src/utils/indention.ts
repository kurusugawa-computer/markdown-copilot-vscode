/*
 * Utilities for handling context indentation in markdown text.
 */
import * as vscode from 'vscode';
import * as config from "./configuration";

let contextIndentPattern: RegExp | null = null;
let contextHeadPattern: RegExp | null = null;
let currentContextIndentCharacters: string = '';
let escapedContextIndentCharacters: string = '';

const ControlEscape: Record<string, string> = {
	'\u0009': 't',
	'\u000A': 'n',
	'\u000B': 'v',
	'\u000C': 'f',
	'\u000D': 'r'
};
const FIRST_DIGIT_OR_ASCII = /^[0-9a-z]/i;
const SYNTAX_SOLIDUS = /^[$()*+./?[\\\]^{|}]/;
const OTHER_PUNCTUATORS_AND_WHITESPACES = /^[!"#%&',\-:;<=>@`~\s]/;

function escapeChar(chr: string): string {
	const hex = chr.charCodeAt(0).toString(16);
	return hex.length < 3 ? '\\x' + hex.padStart(2, '0') : '\\u' + hex.padStart(4, '0');
}

function escapeRegExp(string: string): string {
	let result = '';
	for (let i = 0; i < string.length; i++) {
		const chr = string[i];
		if (i === 0 && FIRST_DIGIT_OR_ASCII.test(chr)) {
			result += escapeChar(chr);
		} else if (Object.prototype.hasOwnProperty.call(ControlEscape, chr)) {
			result += '\\' + ControlEscape[chr];
		} else if (SYNTAX_SOLIDUS.test(chr)) {
			result += '\\' + chr;
		} else if (OTHER_PUNCTUATORS_AND_WHITESPACES.test(chr)) {
			result += escapeChar(chr);
		} else {
			const charCode = chr.charCodeAt(0);
			// single UTF-16 code unit
			if ((charCode & 0xF800) !== 0xD800) {
				result += chr;
			}
			// unpaired surrogate
			else if (
				charCode >= 0xDC00 ||
				i + 1 >= string.length ||
				(string.charCodeAt(i + 1) & 0xFC00) !== 0xDC00
			) {
				result += escapeChar(chr);
			}
			// surrogate pair
			else {
				result += chr + string[++i];
			}
		}
	}
	return result;
}

/**
 * Initialize or update the RegExp cache based on the current configuration
 */
function updateRegExpCache(): void {
	const contextIndentCharacters = config.get().contextIndentCharacters;

	if (currentContextIndentCharacters === contextIndentCharacters) { return; }

	currentContextIndentCharacters = contextIndentCharacters;
	escapedContextIndentCharacters = escapeRegExp(contextIndentCharacters);
	contextIndentPattern = new RegExp(`^(${escapedContextIndentCharacters}[ \t]?)+`);
	contextHeadPattern = new RegExp(`^(${escapedContextIndentCharacters}[ \t]?)`);
}

/**
 * Handle configuration changes for indentation settings
 */
export function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent): void {
	if (!event.affectsConfiguration('markdown.copilot.context.indentCharacters')) { return; }
	updateRegExpCache();
}

/**
 * Get the cached context indentation pattern
 */
function getContextIndentationPattern(): RegExp {
	if (!contextIndentPattern) {
		updateRegExpCache();
	}
	return contextIndentPattern!;
}

/**
 * Get the cached context head pattern
 */
function getContextHeadPattern(): RegExp {
	if (!contextHeadPattern) {
		updateRegExpCache();
	}
	return contextHeadPattern!;
}

export function outdentContext(text: string, level: number): string {
	return text.replace(new RegExp(`^(${escapedContextIndentCharacters}[ \t]?){0,${level}}`, "gm"), "");
}

export function indentContext(text: string, level: number): string {
	const contextIndentCharacters = currentContextIndentCharacters;
	const headContextIndentMatch = text.match(getContextHeadPattern());
	const contextIndentText = headContextIndentMatch === null
		? contextIndentCharacters + " "
		: headContextIndentMatch[1];
	return text.replace(/(?<!\r)^/gm, contextIndentText.repeat(level));
}

export function getContextIndent(lineText: string): string {
	const match = lineText.match(getContextIndentationPattern());
	if (match === null) { return ""; }
	return match[0];
}

export function countContextIndentLevel(lineText: string): number {
	const contextIndent = getContextIndent(lineText);
	const contextIndentCharacters = currentContextIndentCharacters;
	let count = 0;
	let i = 0;

	while (i < contextIndent.length) {
		if (contextIndent.substring(i, i + contextIndentCharacters.length) === contextIndentCharacters) {
			count++;
			i += contextIndentCharacters.length;
		} else {
			i++;
		}
	}

	return count;
}
