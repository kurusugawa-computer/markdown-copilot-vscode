import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { CallSettings, LanguageModel, Tool } from 'ai';
import * as vscode from 'vscode';
import type { CopilotOptions } from '.';
import type { Configuration } from '../utils/configuration';
import * as config from '../utils/configuration';
import * as l10n from '../utils/localization';

interface BackendSettings {
	protocol?: config.BackendProtocol;
	baseUrl?: string;
	apiKey?: string;
	modelId?: string;
}

interface NormalizedCallSettings {
	readonly backendSettings: BackendSettings;
	readonly callSettings: CallSettings;
	readonly stream?: boolean;
	readonly toolChoice?: CopilotOptions['toolChoice'];
	readonly responseFormat?: CopilotOptions['responseFormat'];
	readonly providerOptions?: ProviderOptions;
}

// Factory for provider web search tool; accepts provider-specific args.
type WebSearchToolFactory = (args?: unknown) => Tool;
export interface ProviderToolFactories {
	webSearch?: WebSearchToolFactory;
}

export interface ModelWithToolFactories {
	readonly model: LanguageModel;
	readonly toolFactories: ProviderToolFactories;
}

export function toCallSettings(
	copilotOptions: CopilotOptions,
	configuration?: Configuration,
): NormalizedCallSettings {
	const {
		backendProtocol,
		backendBaseUrl,
		backendApiKey,
		model,
		toolChoice,
		responseFormat,
		providerOptions,
		stream,
		...raw
	} = copilotOptions;

	if (!configuration) {
		configuration = config.get();
	}

	const backendSettings: BackendSettings = {
		protocol: backendProtocol ?? configuration.backendProtocol,
		baseUrl: backendBaseUrl ?? configuration.backendBaseUrl,
		apiKey: backendApiKey ?? configuration.backendApiKey,
		modelId: model ?? configuration.optionsModelResolved,
	};

	const callSettings: CallSettings = { ...raw };

	if (callSettings.temperature === undefined) {
		callSettings.temperature = configuration.optionsTemperature;
	}

	const legacy = copilotOptions as Record<string, unknown>;
	if (typeof legacy.max_tokens === 'number') {
		callSettings.maxOutputTokens = legacy.max_tokens;
	}
	if (typeof legacy.top_p === 'number') {
		callSettings.topP = legacy.top_p;
	}
	if (typeof legacy.frequency_penalty === 'number') {
		callSettings.frequencyPenalty = legacy.frequency_penalty;
	}
	if (typeof legacy.presence_penalty === 'number') {
		callSettings.presencePenalty = legacy.presence_penalty;
	}
	if (Array.isArray(legacy.stop)) {
		callSettings.stopSequences = legacy.stop as string[];
	}

	let resolvedProviderOptions: ProviderOptions | undefined = providerOptions;
	if (responseFormat === 'json') {
		resolvedProviderOptions = {
			...resolvedProviderOptions,
			openai: {
				...((resolvedProviderOptions as { openai?: Record<string, unknown> } | undefined)?.openai),
				response_format: { type: 'json_object' },
			},
		};
	}

	return {
		backendSettings,
		callSettings,
		stream,
		toolChoice,
		responseFormat,
		providerOptions: resolvedProviderOptions,
	};
}

export async function newModelWithToolFactories(settings: BackendSettings): Promise<ModelWithToolFactories> {
	const { protocol, baseUrl, modelId, apiKey: initialApiKey } = settings;
	const configuration = config.get();
	let apiKey = initialApiKey;

	switch (protocol) {
		case 'OpenAI': {
			apiKey = await ensureApiKey(apiKey, 'openai', l10n.t("config.backend.apiKey.error.openai"));
			if (!apiKey) {
				throw new Error(l10n.t("config.backend.apiKey.error.openai"));
			}
			configuration.backendApiKey = apiKey;
			const openai = createOpenAI({
				apiKey,
				baseURL: baseUrl,
			});

			return { model: openai.chat(requireModelId(modelId)), toolFactories: {} };
		}

		case 'OpenAI Responses': {
			apiKey = await ensureApiKey(apiKey, 'openai', l10n.t("config.backend.apiKey.error.openai"));
			if (!apiKey) {
				throw new Error(l10n.t("config.backend.apiKey.error.openai"));
			}
			configuration.backendApiKey = apiKey;
			const openai = createOpenAI({
				apiKey,
				baseURL: baseUrl,
			});

			return {
				model: openai.responses(requireModelId(modelId)),
				toolFactories: { webSearch: openai.tools.webSearch as WebSearchToolFactory },
			};
		}

		case 'Azure': {
			apiKey = await ensureApiKey(apiKey, 'azure', l10n.t("config.backend.apiKey.error.azure"));
			if (!apiKey) {
				throw new Error(l10n.t("config.backend.apiKey.error.azure"));
			}
			const azureConfig = parseAzureBaseUrl(requireBaseUrl(baseUrl));
			const azure = createAzure({
				apiKey,
				baseURL: azureConfig.endpoint,
				apiVersion: azureConfig.apiVersion,
				useDeploymentBasedUrls: true,
			});
			return {
				model: azure(azureConfig.deployment),
				toolFactories: { webSearch: azure.tools.webSearchPreview as WebSearchToolFactory },
			};
		}

		case 'Ollama': {
			const openai = createOpenAI({
				apiKey: apiKey || "ollama",
				baseURL: baseUrl || "http://localhost:11434/v1",
			});
			return { model: openai(requireModelId(modelId)), toolFactories: {} };
		}

		case 'OpenRouter': {
			apiKey = await ensureApiKey(apiKey, 'openrouter', l10n.t("config.backend.baseUrl.error.openRouter"));
			if (!apiKey) {
				throw new Error(l10n.t("config.backend.baseUrl.error.openRouter"));
			}
			const openai = createOpenAI({
				apiKey,
				baseURL: baseUrl || "https://openrouter.ai/api/v1",
				headers: {
					'HTTP-Referer': 'https://github.com/kurusugawa-computer/markdown-copilot-vscode',
					'X-Title': 'Markdown Copilot'
				}
			});
			return { model: openai(requireModelId(modelId)), toolFactories: {} };
		}

		default:
			throw new Error(`Invalid backend protocol: ${protocol}`);
	}
}

function requireModelId(modelId?: string): string {
	if (!modelId) {
		throw new Error('Model is not configured. Set markdown.copilot.options.model in settings.');
	}
	return modelId;
}

function requireBaseUrl(baseUrl?: string): string {
	if (!baseUrl) {
		throw new Error(l10n.t("config.backend.baseUrl.error.azure", ""));
	}
	return baseUrl;
}

async function ensureApiKey(currentKey: string | undefined, provider: string, errorMessage: string): Promise<string | undefined> {
	if (currentKey) {
		return currentKey;
	}
	const input = await vscode.window.showInputBox({
		placeHolder: `Enter your ${provider} API key`,
		validateInput: value => value?.length > 6 ? null : "Invalid API key",
	});
	if (!input) {
		throw new Error(errorMessage);
	}
	return input;
}

export function parseAzureBaseUrl(backendBaseUrl: string) {
	try {
		const url = new URL(backendBaseUrl);
		const deploymentMatch = url.pathname.match(/\/openai\/deployments\/([^/]+)\/(?:(?:chat\/)?completions)/);
		if (!deploymentMatch) {
			throw new Error();
		}
		const deployment = decodeURI(deploymentMatch[1]);
		const apiVersion = url.searchParams.get("api-version") || "2024-02-01";
		return {
			endpoint: url.origin,
			deployment,
			apiVersion,
		};
	} catch {
		throw new Error(l10n.t("config.backend.baseUrl.error.azure", backendBaseUrl || ""));
	}
}
