import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { logger } from './logging';

/*
 * Utilities for l10n
 */
export function getLocale(): string {
	return vscode.env.language;
}

export function initialize(baseUri: vscode.Uri, forcedLocale?: string) {
	const defaultPackageNlsJson = "package.nls.json";
	const locale: string = forcedLocale || getLocale();
	const packageNlsJson = locale === 'en' ? defaultPackageNlsJson : `package.nls.${locale}.json`;
	try {
		l10n.config({ uri: vscode.Uri.joinPath(baseUri, packageNlsJson).toString() });
	} catch {
		logger.warn("Cannot load l10n resource file:", packageNlsJson);
		l10n.config({ uri: vscode.Uri.joinPath(baseUri, defaultPackageNlsJson).toString() });
	}
}

export const t = l10n.t;