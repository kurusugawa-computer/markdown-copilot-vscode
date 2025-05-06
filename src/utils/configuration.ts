import * as vscode from 'vscode';

let configurationInstance: Configuration | undefined;

export function get(): Configuration {
    return configurationInstance!;
}

export function set(configuration: Configuration) {
    configurationInstance = configuration;
}

export function onDidChangeConfiguration(event: vscode.ConfigurationChangeEvent) {
    if (!event.affectsConfiguration("markdown.copilot")) { return; }
    set(new Configuration(vscode.workspace.getConfiguration()));
}

export function initialize() {
    const workspaceConfiguration = vscode.workspace.getConfiguration();
    migrateConfiguration(workspaceConfiguration);
    set(new Configuration(workspaceConfiguration));
}

function migrateConfiguration(workspaceConfiguration: vscode.WorkspaceConfiguration) {
    function inspectConfigurationTarget(section: string, defaultTarget: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace): vscode.ConfigurationTarget {
        /**
         * The effective value (returned by get) is computed by overriding or merging the values in the following order:
         * 1. defaultValue (if defined in package.json otherwise derived from the value's type)
         * 2. globalValue (if defined)
         * 3. workspaceValue (if defined)
         * 4. workspaceFolderValue (if defined)
         * 5. defaultLanguageValue (if defined)
         * 6. globalLanguageValue (if defined)
         * 7. workspaceLanguageValue (if defined)
         * 8. workspaceFolderLanguageValue (if defined)
         */
        const inspection = workspaceConfiguration.inspect(section);
        if (inspection === undefined) { return defaultTarget; }
        if (inspection.workspaceFolderValue !== undefined) { return vscode.ConfigurationTarget.WorkspaceFolder; }
        if (inspection.workspaceValue !== undefined) { return vscode.ConfigurationTarget.Workspace; }
        if (inspection.globalValue !== undefined) { return vscode.ConfigurationTarget.Global; }
        return defaultTarget;
    }

    const oldApiKey = workspaceConfiguration.get<string>("markdown.copilot.openAI.apiKey");
    const newApiKey = workspaceConfiguration.get<string>("markdown.copilot.backend.apiKey");
    if (!newApiKey && oldApiKey) {
        const oldTarget = inspectConfigurationTarget("markdown.copilot.openAI.apiKey");
        workspaceConfiguration.update("markdown.copilot.backend.apiKey", oldApiKey, oldTarget);
    }

    const oldBaseUrl = workspaceConfiguration.get<string>("markdown.copilot.openAI.azureBaseUrl");
    const newBaseUrl = workspaceConfiguration.get<string>("markdown.copilot.backend.baseUrl");
    if (!newBaseUrl && oldBaseUrl) {
        const oldTarget = inspectConfigurationTarget("markdown.copilot.openAI.azureBaseUrl");
        workspaceConfiguration.update("markdown.copilot.backend.baseUrl", oldBaseUrl, oldTarget);
        workspaceConfiguration.update("markdown.copilot.backend.protocol", "Azure", oldTarget);
    }

    const newModel = workspaceConfiguration.get<string>("markdown.copilot.options.model");
    const newModelInspection = workspaceConfiguration.inspect<string>("markdown.copilot.options.model");
    const oldModel = workspaceConfiguration.get<string>("markdown.copilot.openAI.model");
    if (newModel === newModelInspection?.defaultValue && oldModel) {
        const oldTarget = inspectConfigurationTarget("markdown.copilot.openAI.model");
        workspaceConfiguration.update("markdown.copilot.options.model", oldModel, oldTarget);
    }

    const newInactiveOpacity = workspaceConfiguration.get<string>("markdown.copilot.context.inactiveOpacity");
    const newInactiveOpacityInspection = workspaceConfiguration.inspect<string>("markdown.copilot.context.inactiveOpacity");
    const oldInactiveOpacity = workspaceConfiguration.get<string>("markdown.copilot.decorations.inactiveContextOpacity");
    if (newInactiveOpacity === newInactiveOpacityInspection?.defaultValue && oldInactiveOpacity) {
        const oldTarget = inspectConfigurationTarget("markdown.copilot.decorations.inactiveContextOpacity");
        workspaceConfiguration.update("markdown.copilot.context.inactiveOpacity", oldInactiveOpacity, oldTarget);
    }
}


export class Configuration {
    private readonly workspaceConfiguration: vscode.WorkspaceConfiguration;

    constructor(workspaceConfiguration: vscode.WorkspaceConfiguration) {
        this.workspaceConfiguration = workspaceConfiguration;
    }

    get backendProtocol(): "OpenAI" | "Azure" | "Ollama" | "OpenRouter" | undefined {
        return this.workspaceConfiguration.get<"OpenAI" | "Azure" | "Ollama" | "OpenRouter">("markdown.copilot.backend.protocol");
    }

    get backendBaseUrl(): string | undefined {
        const baseUrl = this.workspaceConfiguration.get<string>("markdown.copilot.backend.baseUrl");
        if (baseUrl === undefined || baseUrl.trim().length === 0) {
            return undefined;
        }
        return baseUrl;
    }

    get backendApiKey(): string | undefined {
        const apiKey = this.workspaceConfiguration.get<string>("markdown.copilot.backend.apiKey");
        if (apiKey === undefined || apiKey.trim().length === 0) {
            return undefined;
        }
        return apiKey;
    }

    set backendApiKey(value: string) {
        this.workspaceConfiguration.update("markdown.copilot.backend.apiKey", value);
    }

    get contextInactiveOpacity(): number {
        return this.workspaceConfiguration.get<number>("markdown.copilot.context.inactiveOpacity")!;
    }

    get contextIndentCharacters(): string {
        const indentCharacters = this.workspaceConfiguration.get<string>("markdown.copilot.context.indentCharacters");
        return indentCharacters !== undefined && indentCharacters.trim().length > 0 ? indentCharacters : ">";
    }

    get instructionsSystemMessage(): string | undefined {
        const systemMessage = this.workspaceConfiguration.get<string>("markdown.copilot.instructions.systemMessage");
        if (systemMessage === undefined || systemMessage.trim().length === 0) {
            return undefined;
        }
        return systemMessage;
    }

    get instructionsTitleMessage(): string | undefined {
        const titleMessage = this.workspaceConfiguration.get<string>("markdown.copilot.instructions.titleMessage");
        if (titleMessage === undefined || titleMessage.trim().length === 0) {
            return undefined;
        }
        return titleMessage;
    }

    get instructionsPasteAsPrettyTextMessage(): string | undefined {
        const pasteMessage = this.workspaceConfiguration.get<string>("markdown.copilot.instructions.pasteAsPrettyTextMessage");
        if (pasteMessage === undefined || pasteMessage.trim().length === 0) {
            return undefined;
        }
        return pasteMessage;
    }

    get instructionsNameMessage(): string | undefined {
        const nameMessage = this.workspaceConfiguration.get<string>("markdown.copilot.instructions.nameMessage");
        if (nameMessage === undefined || nameMessage.trim().length === 0) {
            return undefined;
        }
        return nameMessage;
    }

    get instructionsNamePathFormat(): string | undefined {
        const namePathFormat = this.workspaceConfiguration.get<string>("markdown.copilot.instructions.namePathFormat");
        if (namePathFormat === undefined || namePathFormat.trim().length === 0) {
            return undefined;
        }
        return namePathFormat;
    }

    get instructionsSummarizeContextMessage(): string | undefined {
        const summarizeMessage = this.workspaceConfiguration.get<string>("markdown.copilot.instructions.summarizeContextMessage");
        if (summarizeMessage === undefined || summarizeMessage.trim().length === 0) {
            return undefined;
        }
        return summarizeMessage;
    }

    get optionsModel(): string | undefined {
        const model = this.workspaceConfiguration.get<string>("markdown.copilot.options.model");
        if (model === undefined || model.trim().length === 0) {
            return undefined;
        }
        return model;
    }

    get optionsModelNameText(): string | undefined {
        const modelNameText = this.workspaceConfiguration.get<string>("markdown.copilot.options.modelNameText");
        if (modelNameText === undefined || modelNameText.trim().length === 0) {
            return undefined;
        }
        return modelNameText;
    }

    get optionsModelResolved(): string | undefined {
        const model = this.optionsModel;
        return model === "→ Model Name Text" ? this.optionsModelNameText : model;
    }

    get optionsTemperature(): number {
        return this.workspaceConfiguration.get<number>("markdown.copilot.options.temperature")!;
    }
}
