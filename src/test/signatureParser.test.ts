import * as assert from "assert";
import { suite, test } from "mocha";
import { parseFunctionSignature } from "../utils/signatureParser";

suite('Signature Parser Test Suite', () => {
    test('JSDoc', () => {
        const result = parseFunctionSignature(`/**
 * Recursively searches files in a directory tree that match a regex pattern.
 * @param {vscode.Uri} directoryUri The URI of the directory to search in. This directory will be recursively searched.
 * @param {string} regexPattern The regular expression pattern to match file paths (relative to the \`directoryUri\`) against. Uses JS regex syntax.
 * @param {number} [maxDepth=10] Maximum directory depth to search (default: 10).
 * @param {boolean} [ignoreDotfiles=true] Whether to ignore files and directories that start with a dot (default: true).
 * @return {Array<{path: string}>} An array of objects with the path (relative to the \`directoryUri\`) of the files that match the regex pattern.
 */`);
        assert.deepEqual(result, {
            name: 'anonymous',
            description: 'Recursively searches files in a directory tree that match a regex pattern.',
            parameters: {
                type: "object",
                properties: {
                    directoryUri: {
                        type: "string",
                        description: 'The URI of the directory to search in. This directory will be recursively searched.'
                    },
                    regexPattern: {
                        type: "string",
                        description: 'The regular expression pattern to match file paths (relative to the `directoryUri`) against. Uses JS regex syntax.'
                    },
                    maxDepth: {
                        type: "number",
                        description: 'Maximum directory depth to search (default: 10).'
                    },
                    ignoreDotfiles: {
                        type: "boolean",
                        description: 'Whether to ignore files and directories that start with a dot (default: true).'
                    }
                },
                required: ['directoryUri', 'regexPattern']
            }
        });
    });

    test('TS Signature', () => {
        const result = parseFunctionSignature(`function fsSearchTree(directoryUri: vscode.Uri, regexPattern: string, maxDepth: number = 10, ignoreDotfiles: boolean = true)`);
        assert.deepEqual(result, {
            name: 'fsSearchTree',
            description: '',
            parameters: {
                type: "object",
                properties: {
                    directoryUri: {
                        type: "string"
                    },
                    regexPattern: {
                        type: "string"
                    },
                    maxDepth: {
                        type: "number"
                    },
                    ignoreDotfiles: {
                        type: "boolean"
                    }
                },
                required: ['directoryUri', 'regexPattern']
            }
        });
    });

    test('JSDoc complex type', () => {
        const result = parseFunctionSignature(`/**
 * Cluster the people by age.
 * @param {{name: string, age: number}[]} people People to cluster.
 */`);
        assert.deepEqual(result, {
            name: 'anonymous',
            description: 'Cluster the people by age.',
            parameters: {
                type: "object",
                properties: {
                    people: {
                        description: 'People to cluster.',
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                age: { type: "number" }
                            },
                            required: ['name', 'age']
                        }
                    }
                },
                required: ['people']
            }
        });
    });

    test('TS complex type', () => {
        const result = parseFunctionSignature(`function clusterPeople(people: {name: string, age: number}[])`);
        assert.deepEqual(result, {
            name: 'clusterPeople',
            description: '',
            parameters: {
                type: "object",
                properties: {
                    people: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                name: { type: "string" },
                                age: { type: "number" }
                            },
                            required: ['name', 'age']
                        }
                    }
                },
                required: ['people']
            }
        });
    });
});
