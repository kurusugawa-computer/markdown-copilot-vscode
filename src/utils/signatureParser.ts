import OpenAI from "openai";

// Types and interfaces
interface TSDocParam {
    name: string;
    type: string | null;
    description: string;
}

interface TSDocReturn {
    type: string | null;
    description: string;
}

interface TSDocInfo {
    description: string;
    params: TSDocParam[];
    returns: TSDocReturn | null;
    tags: Record<string, string[]>;
}

interface JsonSchemaType {
    type: string;
    items?: JsonSchemaType;
    properties?: Record<string, JsonSchemaType>;
    required?: string[];
    description?: string;
}

interface ParsedParam {
    name: string;
    optional: boolean;
}

// Core parsing functions
function parseJSDoc(code: string): TSDocInfo {
    // Default structure
    const docInfo: TSDocInfo = {
        description: '',
        params: [],
        returns: null,
        tags: {}
    };

    // Extract JSDoc comment blocks
    const jsDocRegex = /\/\*\*\s*\n([\s\S]*?)\*\//g;
    const jsDocMatch = jsDocRegex.exec(code);
    if (!jsDocMatch) return docInfo;

    const jsDocContent = normalizeJSDocContent(jsDocMatch[1]);

    // Parse description (everything before first @tag)
    const descriptionEndIndex = jsDocContent.search(/\n\s*@\w+/);
    docInfo.description = descriptionEndIndex > 0
        ? jsDocContent.substring(0, descriptionEndIndex).trim()
        : jsDocContent.trim();

    // Extract params
    const paramRegex = /@param\s+({[\s\S]*?}|\S+)?\s*(\[?\w+(?:=\w+)?\]?)(?:\s+-\s*|\s+)?([\s\S]*?)(?=\n\s*@|\n*$)/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(jsDocContent)) !== null) {
        const [, typeWithBraces, name, description] = paramMatch;
        docInfo.params.push({
            name,
            type: extractType(typeWithBraces),
            description: description?.trim() || ''
        });
    }

    // Extract return
    const returnRegex = /@returns?\s+({[\s\S]*?}|\S+)?\s*([\s\S]*?)(?=\n\s*@|\n*$)/g;
    const returnMatch = returnRegex.exec(jsDocContent);
    if (returnMatch) {
        const [, typeWithBraces, description] = returnMatch;
        docInfo.returns = {
            type: extractType(typeWithBraces),
            description: description?.trim() || ''
        };
    }

    // Extract all other tags
    const tagRegex = /@(\w+)\s+([\s\S]*?)(?=\n\s*@|\n*$)/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(jsDocContent)) !== null) {
        const [, tag, content] = tagMatch;
        if (!['param', 'returns', 'return', 'example'].includes(tag)) {
            docInfo.tags[tag] = docInfo.tags[tag] || [];
            docInfo.tags[tag].push(content.trim());
        }
    }

    return docInfo;
}

export function parseFunctionSignature(code: string): OpenAI.FunctionDefinition | null {
    // Try to extract from function declaration first
    const funcRegex = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function|\((\w+)\)\s*=>)\s*\(([\s\S]*?)\)(?:\s*:\s*([^{]*))?/;
    const match = funcRegex.exec(code);

    if (match) {
        const name = match[1] || match[2] || match[3] || 'anonymous';
        const paramsStr = match[4] || '';
        const { properties, required } = parseParams(paramsStr);

        return {
            name,
            description: '',
            parameters: {
                type: "object",
                properties,
                ...(required.length > 0 ? { required } : {})
            }
        };
    }

    // If no function declaration found, try to extract from JSDoc
    if (code.includes('/**') && code.includes('*/')) {
        const docInfo = parseJSDoc(code);
        const name = docInfo.tags.function?.[0] || 'anonymous';
        const properties: Record<string, JsonSchemaType> = {};
        const required: string[] = [];

        for (const param of docInfo.params) {
            const { name: paramName, optional } = parseJSDocParam(param.name);

            if (param.type && (param.type.includes('{') && param.type.includes('}'))) {
                properties[paramName] = parseComplexType(param.type);
            } else {
                properties[paramName] = {
                    type: mapTypeToJsonSchema(param.type)
                };
            }

            if (param.description) {
                properties[paramName].description = param.description;
            }

            if (!optional) {
                required.push(paramName);
            }
        }

        return {
            name,
            description: docInfo.description,
            parameters: {
                type: "object",
                properties,
                ...(required.length > 0 ? { required } : {})
            }
        };
    }

    return null;
}

// Helper functions
function extractType(text: string): string | null {
    if (!text?.trim().startsWith('{')) return null;

    let depth = 0;
    let start = -1;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') {
            if (depth === 0) start = i;
            depth++;
        } else if (text[i] === '}') {
            depth--;
            if (depth === 0 && start !== -1) {
                return text.substring(start + 1, i).trim();
            }
        }
    }

    return null;
}

function parseComplexType(typeStr: string | null): JsonSchemaType {
    if (!typeStr) return { type: "string" };

    // Check if it's an array type
    const isArray = typeStr.endsWith('[]');
    if (isArray) {
        return {
            type: "array",
            items: parseComplexType(typeStr.substring(0, typeStr.length - 2))
        };
    }

    // Check if it's an object type with properties
    if (typeStr.includes('{') && typeStr.includes('}')) {
        const objectPattern = /{([^{}]*)}/;
        const match = objectPattern.exec(typeStr);

        if (match && match[1]) {
            const properties: Record<string, JsonSchemaType> = {};
            const required: string[] = [];

            match[1].split(',')
                .map(p => p.trim())
                .forEach(propEntry => {
                    const propMatch = /(\w+)\s*:\s*([^,]+)/.exec(propEntry);
                    if (propMatch) {
                        const [, propName, propType] = propMatch;
                        properties[propName] = { type: mapTypeToJsonSchema(propType.trim()) };
                        required.push(propName);
                    }
                });

            return {
                type: "object",
                properties,
                ...(required.length > 0 ? { required } : {})
            };
        }
    }

    // Default case - use simple type mapping
    return { type: mapTypeToJsonSchema(typeStr) };
}

function normalizeJSDocContent(rawContent: string): string {
    return rawContent
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim();
}

function mapTypeToJsonSchema(type: string | null): string {
    if (!type) return "string";

    const normalizedType = type.toLowerCase();

    if (normalizedType.includes('number') || normalizedType.includes('int') || normalizedType.includes('float')) {
        return "number";
    }
    if (normalizedType.includes('boolean')) {
        return "boolean";
    }
    if (normalizedType.includes('array') || normalizedType.includes('[]')) {
        return "array";
    }
    if (normalizedType.includes('object') || normalizedType.includes('record')) {
        return "object";
    }

    return "string";
}

function parseParams(paramsStr: string): {
    properties: Record<string, { type: string; description?: string }>;
    required: string[];
} {
    const properties: Record<string, { type: string; description?: string }> = {};
    const required: string[] = [];

    // Handle empty parameter list
    if (!paramsStr.trim()) {
        return { properties, required };
    }

    // Split parameters carefully to handle complex types
    let depth = 0;
    let current = '';
    const paramEntries: string[] = [];

    // First split the parameters, respecting nested braces
    for (const char of paramsStr) {
        if (char === '{' || char === '[' || char === '(') depth++;
        else if (char === '}' || char === ']' || char === ')') depth--;
        else if (char === ',' && depth === 0) {
            paramEntries.push(current.trim());
            current = '';
            continue;
        }
        current += char;
    }
    if (current.trim()) paramEntries.push(current.trim());

    for (const paramEntry of paramEntries) {
        // Match parameter name and type, handling optional parameters
        const paramMatch = /^(\w+)(?:\s*\??\s*:\s*([^=]*))?(?:\s*=\s*(.+))?$/.exec(paramEntry);

        if (paramMatch) {
            const [, name, type, defaultValue] = paramMatch;
            const isOptional = !!defaultValue || paramEntry.includes('?:');

            // If it's a complex type, use parseComplexType to process it
            if (type && (type.includes('{') || type.includes('['))) {
                properties[name] = parseComplexType(type.trim());
            } else {
                properties[name] = {
                    type: mapTypeToJsonSchema(type ? type.trim() : null)
                };
            }

            if (!isOptional) {
                required.push(name);
            }
        }
    }

    return { properties, required };
}

function parseJSDocParam(paramName: string): ParsedParam {
    const isOptional = paramName.startsWith('[') && paramName.includes(']');

    if (isOptional) {
        const optParamMatch = /\[(\w+)(?:=([^\]]+))?\]/.exec(paramName);
        if (optParamMatch) {
            return {
                name: optParamMatch[1],
                optional: true
            };
        }
    }

    return { name: paramName, optional: false };
}
