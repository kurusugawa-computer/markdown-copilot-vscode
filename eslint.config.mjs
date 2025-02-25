// @ts-check
import eslint from "@eslint/js";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        files: ["**/*.{ts,tsx,cts,mts,js,cjs,mjs}"],
    },
    {
        ignores: ["**/node_modules/**", "**/out", "**/dist", "**/*.d.ts"],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    ...tseslint.configs.stylistic,
    {
        plugins: {
            "@typescript-eslint": typescriptEslint,
        },
        languageOptions: {
            parserOptions: {
                warnOnUnsupportedTypeScriptVersion: false,
            },
            globals: globals.node,
        },
        rules: {
            "dot-notation": "error",
            "eqeqeq": "error",
            "no-caller": "error",
            "no-constant-condition": ["error", { checkLoops: false }],
            "no-eval": "error",
            "no-extra-bind": "error",
            "no-new-func": "error",
            "no-new-wrappers": "error",
            "no-return-await": "error",
            "no-template-curly-in-string": "error",
            "no-throw-literal": "error",
            "no-undef-init": "error",
            "no-var": "error",
            "object-shorthand": "error",
            "prefer-const": "error",
            "prefer-object-spread": "error",
            "unicode-bom": ["error", "never"],
            "@typescript-eslint/naming-convention": [
                "error",
                { selector: "typeLike", format: ["PascalCase"], filter: { regex: "^(__String|[A-Za-z]+_[A-Za-z]+)$", match: false } },
                { selector: "interface", format: ["PascalCase"], custom: { regex: "^I[A-Z]", match: false }, filter: { regex: "^I(Arguments|TextWriter|O([A-Z][a-z]+[A-Za-z]*)?)$", match: false } },
                { selector: "variable", format: ["camelCase", "PascalCase", "UPPER_CASE"], leadingUnderscore: "allow", filter: { regex: "^(_{1,2}filename|_{1,2}dirname|_+|[A-Za-z]+_[A-Za-z]+)$", match: false } },
                { selector: "function", format: ["camelCase", "PascalCase"], leadingUnderscore: "allow", filter: { regex: "^[A-Za-z]+_[A-Za-z]+$", match: false } },
                { selector: "parameter", format: ["camelCase"], leadingUnderscore: "allow", filter: { regex: "^(_+|[A-Za-z]+_[A-Z][a-z]+)$", match: false } },
                { selector: "method", format: ["camelCase", "PascalCase"], leadingUnderscore: "allow", filter: { regex: "^([0-9]+|[A-Za-z]+_[A-Za-z]+)$", match: false } },
                { selector: "memberLike", format: ["camelCase"], leadingUnderscore: "allow", filter: { regex: "^([0-9]+|[A-Za-z]+_[A-Za-z]+)$", match: false } },
                { selector: "enumMember", format: ["camelCase", "PascalCase"], leadingUnderscore: "allow", filter: { regex: "^[A-Za-z]+_[A-Za-z]+$", match: false } },
                { selector: "property", format: null },
            ],

            "@typescript-eslint/unified-signatures": "error",
            "no-unused-expressions": "off",
            "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true }],

            // Rules enabled in typescript-eslint configs that are not applicable here
            "@typescript-eslint/ban-ts-comment": "off",
            "@typescript-eslint/class-literal-property-style": "off",
            "@typescript-eslint/consistent-indexed-object-style": "off",
            "@typescript-eslint/consistent-generic-constructors": "off",
            "@typescript-eslint/no-duplicate-enum-values": "off",
            "@typescript-eslint/no-empty-function": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
            "@typescript-eslint/no-var-requires": "off",
            "@typescript-eslint/no-empty-interface": "off",
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-empty-object-type": "off", // {} is a totally useful and valid type.
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    // Ignore: (solely underscores | starting with exactly one underscore)
                    argsIgnorePattern: "^(_+$|_[^_])",
                    varsIgnorePattern: "^(_+$|_[^_])",
                    // Not setting an ignore pattern for caught errors; those can always be safely removed.
                },
            ],
            "@typescript-eslint/no-inferrable-types": "off",
      },
    }
);