# Markdown Copilot — Codex Cheat Sheet

# ExecPlans
When work goes beyond a small tweak (new feature flow, sizeable refactor, risky change), author an ExecPlan following `.agent/PLANS.md` before you touch code. Store plans under `.agent/`, keep scratch material inside a `.gitignored` subfolder there, and keep each plan fully self-contained so another agent could finish the job from the plan alone.

## Repo Map
- `src/extension.ts`: activation entry-point; wires commands, completions, code actions, telemetry/logging, and keeps `ContextOutline`/`ContextDecorator`/`EditCursor` in sync with editor events.
- `src/features/`: user-facing workflows (`markdownEditing`, `manipulateContexts`, `filePathDiff`, `nameAndSave`, `pasteAsPrettyText`) called from the command registrations.
- `src/utils/`: shared plumbing. Highlights: `index.ts` basic helpers, `configuration.ts` settings + migration, `context.ts` context tracking/import resolution, `indention.ts` context formatting, `editCursor.ts` streaming edits, `llm.ts` OpenAI/Azure chat orchestration, `llmTools*.ts` tool parsing/invocation, `json.ts` deep merge helpers, `promise.ts` cancelable operations, `signatureParser.ts` TypeScript → JSON Schema parser, `localization.ts` + `logging.ts`.
- `src/test/`: Mocha suites run inside the VS Code harness (`extension.test.ts`, `signatureParser.test.ts`, `mcpServer.test.mjs` with an Express-backed MCP demo server).
- `.agent/PLANS.md`: ExecPlan contract; read before creating or updating any plan file.
- `dist/`, `out/`, packaged `.vsix`: generated artifacts; regenerate via scripts instead of editing directly.
- `snippets/`, `media/`, `images/`: extension assets referenced from `package.json`.
- `tools/run_github_actions.sh`: local wrapper around `nektos/act` for replaying the repo’s GitHub workflows (requires Docker + `GITHUB_TOKEN`).

## Extension Architecture
- Activation (`extension.ts`) initializes localization, configuration, logging, and context tracking, registers command IDs defined in `package.json`, and exposes code actions/completion items that pipe selections into Copilot flows.
- `ContextOutline` segments documents by indent-based context markers; `ContextDecorator` keeps inactive ranges shaded based on `markdown.copilot.context` settings.
- `EditCursor` serializes edits, shows a decorator glyph, and streams assistant output through `withProgress` while keeping cancellation responsive.
- Workflow modules orchestrate specific scenarios: continuing conversations (`markdownEditing.ts`), summarizing or titling active context (`manipulateContexts.ts`), renaming/moving files from diff-like blocks (`filePathDiff.ts`), saving conversations with LLM-chosen filenames (`nameAndSave.ts`), and pasting clipboard content through an LLM formatter (`pasteAsPrettyText.ts`).
- Commands for indenting/outdenting context rely on `indention.ts` helpers; keybindings are declared in `package.json`.

## LLM and Tooling
- `llm.ts` builds Chat Completions requests against OpenAI, Azure, OpenRouter, or Ollama endpoints depending on configuration. `executeChatCompletionWithTools` streams deltas, loops on tool calls, and dispatches built-in tool functions (`eval_js`, `web_request`, `fs_read_*`, `fs_find_files`) before resuming generation.
- `ChatMessageBuilder` normalizes selections, honors `**System(Override):**` blocks, merges `json|yaml copilot-options`, resolves `@import` references, aggregates tool overrides, and returns chat messages plus per-run overrides.
- `llmTools.ts` parses fenced `copilot-tool-definition` TypeScript blocks (using `signatureParser.ts` to infer schemas) alongside optional `copilot-tool-parameters`; caches definitions; supports builtin tool bundles via `@name`; and routes `^prefix` lookups through VS Code language model tools (`llmToolsVscode.ts`).
- `json.ts` provides `deepMergeJsons` for combining override payloads; `promise.ts` supplies `CancelablePromise` used by `EditCursor.insertCompletion`.

## Configuration and Localization
- `utils/configuration.ts` migrates legacy `markdown.copilot.openAI.*` settings to the new backend schema, exposes strongly-typed getters/setters, resolves `"→ Model Name Text"` indirection, and surfaces instruction prompts (`instructions.*`).
- `utils/localization.ts` loads `package.nls*.json` via `@vscode/l10n`; falls back to English with a logged warning if the locale pack is missing. Logging goes through a `vscode.LogOutputChannel` created in `utils/logging.ts`.
- Indentation visuals, inactive opacity, and context markers are driven by configuration values and applied through `ContextDecorator`.

## Build / Test Commands
- `npm install` — install dependencies.
- `npm run compile` — single webpack build (desktop bundle).
- `npm run watch` — webpack watch for live rebuilds.
- `npm run lint` — eslint with `typescript-eslint`.
- `npm run compile-tests` — tsc build of the Mocha suites into `out/test`.
- `xvfb-run npm run test` — VS Code test harness (`compile-tests`, `compile`, `lint` run in `pretest`).
- `npm run test:web` — builds + launches the web extension tests (headless via `vscode-test-web`).
- `npm run package` — production webpack bundle with hidden source maps for publishing.

## Coding Conventions
- TypeScript is `strict`; indentation uses tabs and strings prefer single quotes.
- Avoid editing generated output (`dist/`, `out/`, packaged `.vsix`); regenerate instead.
- ESLint enforces `eqeqeq`, `prefer-const`, strict naming (camelCase for values/functions, PascalCase for types), and no implicit any.

## Testing Guidance
- Add new suites under `src/test/` using `*.test.ts` (or `.mjs` when Node APIs are required). Tests run inside the VS Code runner; mock or stub remote services when practical.
- `npm run test` is the default CI parity run; use `npm run watch-tests` for a TSC watch loop.
- Cover new commands, configuration surfaces, and serialization code paths. For LLM-heavy flows, isolate logic so deterministic pieces can be tested without live API calls.

## PR Discipline
- Commit subjects: imperative mood, roughly ≤70 chars. Reference issues with `Fixes #123` when relevant.
- Summarize user-visible changes, list doc/localization updates, and attach media for UI shifts.
- Ensure `npm run lint` and `npm run test` succeed before requesting review.

## Explored Facts (keep in sync)
- `ChatMessageBuilder` strips `**User:**` prefixes, inserts `**Copilot:**` responses, merges override options, and attaches tool contexts before streaming via `EditCursor`.
- `ContextOutline` walks contexts based on `# Copilot Context:` markers and indent depth; `resolveImport` loads `@import "foo.md"` fragments recursively while deduping cycles.
- `EditCursor.insertCompletion` wraps chat completions in a `CancelablePromise`, batching streamed deltas so they insert at line boundaries and react to cancellation.
- `filePathDiff.ts` parses two-line diff pairs (`- path`/`+ path`), validates filesystem state, and applies renames/deletions under the resolved workspace root.
- `nameAndSave.ts` prompts the LLM (JSON mode) to choose a filename, materializes missing directories, saves the conversation, and rolls back empty folders if the user cancels.
- `pasteAsPrettyText.ts` feeds clipboard content plus `${languageId}` into an instruction prompt so Copilot reformats pasted text inline.
- `mcpServer.test.mjs` spins up a demo Model Context Protocol server/client pair to validate tool, prompt, and resource integration with `@modelcontextprotocol/sdk`.
