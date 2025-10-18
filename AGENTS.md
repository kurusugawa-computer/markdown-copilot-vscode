# Markdown Copilot — Codex Cheat Sheet

# ExecPlans
When work goes beyond a small tweak (new feature flow, sizeable refactor, risky change), author an ExecPlan following `.agent/PLANS.md` before you touch code. Store plans under `.agent/`, keep scratch material inside a `.gitignored` subfolder there, and keep each plan fully self-contained so another agent could finish the job from the plan alone.

## Design Principles
- Keep wiring anchored in `src/extension.ts`; hold instances there (e.g., `ContextOutline`, `ContextDecorator`) and pass them down instead of adding globals.
- Avoid premature abstraction—do not add classes/parameters just for hypothetical reuse; match the current call graph.
- Preserve layer boundaries: features orchestrate, `llm` handles model/tool work, `utils` stays general-purpose; avoid upward dependencies.
- Keep side effects at the edges—prefer pure helpers and wrap VS Code/filesystem/network calls so failures surface clearly.
- Write tests around deterministic logic before wiring LLM or VS Code flows; inject dependencies explicitly (constructor args/params) instead of hidden defaults.
- Avoid unnecessary subdirectories under `src`; do not add one-off folders that only hold `index.ts` + a single class without maintainer buy-in.

## Repo Map
- `src/extension.ts`: activation entry point; initializes logging/localization/configuration, instantiates `ContextOutline`/`ContextDecorator`, registers all commands/code actions/completions, and forwards editor/document/config events to decorators and `Cursor`.
- `src/features/`: user-facing flows. `markdownEditing.ts` (continue/title in context), `manipulateContexts.ts` (summarize + start new context), `filePathDiff.ts` (list/apply rename/delete diffs), `nameAndSave.ts` (LLM-suggested filepath + save), `pasteAsPrettyText.ts` (rewrite clipboard in-place).
- `src/llm/`: shared LLM plumbing. `index.ts` defines shared types (`CopilotOptions`, `ToolContext`, etc.). `requests.ts` hosts `ChatIntent`, `ChatRequest`, and `ChatRequestBuilder` (parses role markers, `copilot-options`/`copilot-tools`, multimodal parts). `sessions.ts` streams or batches via the `ai` SDK based on `copilotOptions.stream`. `providers.ts` normalizes copilot options/config (legacy OpenAI fields included) into backend call settings, attaches `response_format` hints, and builds OpenAI/OpenAI Responses/Azure/Ollama/OpenRouter models plus provider tool factories. `tools.ts` implements `ToolProvider` (builtin/provider/custom/VS Code LM tools, execution).
- `src/utils/`: helpers. Highlights: `index.ts` (EOL/range helpers, URI resolution), `configuration.ts` (settings + migration), `context.ts` (`ContextOutline` + `ContextDecorator` + `resolveImport`), `cursor.ts` (streaming insertion + progress UI), `indention.ts` (context-aware formatting), `localization.ts`, `logging.ts`, `json.ts` (deep merge), `signatureParser.ts` (TypeScript -> JSON Schema).
- `src/test/`: Mocha suites (`extension.test.ts`, `llm/requests.test.ts`, `llm/sessions.test.ts`, `llm/tools.test.ts`, `utils/signatureParser.test.ts`) running in the VS Code harness.
- `.agent/PLANS.md`: ExecPlan contract; follow before creating/updating any plan.
- `dist/`, `out/`, packaged `.vsix`: generated artifacts; regenerate via scripts instead of editing directly.
- `snippets/`, `media/`, `images/`: extension assets referenced from `package.json`.
- `tools/run_github_actions.sh`: local wrapper around `nektos/act` for replaying GitHub workflows (requires Docker + `GITHUB_TOKEN`).

## Extension Architecture
- Activation wires logging/localization/config, constructs `ContextOutline`/`ContextDecorator`, registers commands (continue/title/summarize/name/save/diff apply/list/paste pretty/indent/outdent), code actions, and completion items. Document/selection changes update decorators and active `Cursor` sessions; `deactivate` disposes all cursors.
- `ContextOutline` segments documents by indentation and `# Copilot Context:` markers; `ContextDecorator` dims inactive ranges based on `markdown.copilot.context` settings using `ts-debounce`.
- `Cursor` (`src/utils/cursor.ts`) is the streaming insertion adapter: wraps edits in a mutex, batches streamed deltas until a newline, keeps a 📝 decoration, updates positions on `onDidChangeTextDocument`, runs work inside `withProgress`, and aborts/cleans up on cancellation or errors.
- Feature flows use `Cursor` for streaming insertion. `markdownEditing` outdents the selection, prepends `**User:**` if missing, appends `**Copilot:**`, optionally injects context lines, and streams the session. `manipulateContexts` appends `# Copilot Context:` + heading then streams the summary. `filePathDiff` emits/consumes paired `- path / + path` lines and validates existence/conflicts before filesystem mutations. `nameAndSave` runs JSON-mode completion to suggest `{ filepath }`, materializes directories, saves, and prunes empty folders on cancel. `pasteAsPrettyText` deletes any selection then streams the rewritten clipboard content.

## LLM and Tooling
- `ChatIntent` captures `documentUri`, user input, optional context lines, overrides (system prompt, user append, `CopilotOptions`, `ToolProvider`), and `supportsMultimodal`.
- `ChatRequestBuilder.fromIntent` applies overrides, merges context lines with role markers, parses ` ```json|yaml copilot-options` (deep merges, legacy fields honored later) and `copilot-tools` (resolved via `ToolProvider`), and when parsing fails returns a locale-aware correction prompt while clearing options. Multimodal intents split markdown images/`<img>` tags: local images/audio become `image`/`file` parts via `workspace.fs`, HTTP images stay as URLs.
- `ChatRequest.build` clones messages/options/tool context; `ChatRequest.fromIntent` is a convenience wrapper. `ChatSession` uses `ai` (`streamText` vs `generateText` picked by `copilotOptions.stream`) with tool sets from `ToolProvider`; respects abort signals and `resultText` aggregates text deltas.
- `providers.ts` merges config defaults into `CopilotOptions`, maps legacy OpenAI fields (`max_tokens`, `top_p`, penalties, `stop`) into `CallSettings`, sets OpenAI-compatible `response_format` hints for JSON runs, prompts for API keys when missing, parses Azure deployment URLs, and instantiates models for OpenAI, OpenAI Responses (with `webSearch` tool factory), Azure (with `webSearchPreview` tool factory), Ollama, or OpenRouter (adds required headers).
- `ToolProvider` resolves tool texts: builtin groups (`@context`, `@file`, `@eval!`, `@web`), singletons (`fs_read_file`, `fs_read_dir`, `fs_find_files`, `eval_js`, `web_request`, provider `web_search`), VS Code LM tools via `^prefix` (filters unsafe names), or custom tools from fenced `copilot-tool-definition` TypeScript blocks parsed by `signatureParser`. Custom tool execution injects `copilot-tool-parameters` JSON (args, current URI/time) then runs a nested `ChatSession` (`stream:false`) expecting `{ "final_answer": string }`. Builtins rely on `fetch`, `vscode.workspace.fs`, `resolveRootUri`, `resolveFragmentUri`, and `chardet`; `fs_find_files` respects untitled docs by resolving to the workspace root.

## Configuration and Localization
- `utils/configuration.ts` migrates legacy `markdown.copilot.openAI.*` settings, exposes strongly-typed getters/setters, resolves `"→ Model Name Text"`, and centralizes defaults consumed by LLM clients and tooling. Indent characters and inactive opacity come from `markdown.copilot.context.*`.
- `utils/localization.ts` loads `package.nls*.json` via `@vscode/l10n`, falls back to English with a logged warning if a locale pack is missing, and exposes `t()`.

## Build / Test Commands
- `npm install` — install dependencies.
- `npm run compile` — single webpack build (desktop bundle).
- `npm run watch` — webpack watch for live rebuilds.
- `npm run lint` — eslint with `typescript-eslint`.
- `npm run compile-tests` — removes `out/` and runs `tsc -p . --outDir out` to prep VS Code integration tests.
- `xvfb-run -a npm test` — VS Code test harness; `pretest` runs `compile-tests`, `compile`, and `lint`. (Headless `npm test` without X/DBus typically fails.)
- `npm run test:web` — builds + launches the web extension tests (headless via `vscode-test-web`).
- `npm run package` — production webpack bundle with hidden source maps for publishing.

## Coding Conventions
- TypeScript is `strict`; indentation uses tabs and strings prefer single quotes.
- Avoid editing generated output (`dist/`, `out/`, packaged `.vsix`); regenerate instead.
- ESLint enforces `eqeqeq`, `prefer-const`, strict naming (camelCase for values/functions, PascalCase for types), and no implicit `any`.
- Avoid defining interfaces when only a single class implements them.

## Testing Guidance
- Add suites under `src/test/` using `*.test.ts` (or `.mjs` when Node APIs are required). Tests run inside the VS Code runner; stub remote services when practical.
- `npm run test` is the default CI parity run; use `npm run watch-tests` for a TSC watch loop when iterating on suites.
- Current coverage: activation/config defaults (`extension.test.ts`), request construction (`llm/requests.test.ts`), session streaming/abort handling (`llm/sessions.test.ts`), tool provider behaviors including provider web search/custom tools (`llm/tools.test.ts`), and the TypeScript → JSON Schema parser (`utils/signatureParser.test.ts`). Use them as templates for deterministic logic.
- Cover new commands, configuration surfaces, serialization code paths, and deterministic logic split out of LLM interactions. For LLM-heavy flows, isolate logic so it can be tested without live API calls.

## PR Discipline
- Commit subjects: imperative mood, roughly ≤70 chars. Reference issues with `Fixes #123` when relevant.
- Summarize user-visible changes, list doc/localization updates, and attach media for UI shifts.
- Ensure `npm run lint` and `npm run test` succeed before requesting review.

## Key Implementation Notes
- `Cursor` owns streaming insertion and progress UI. It serializes edits with an `async-mutex`, batches deltas until a newline, decorates the cursor position, updates insertion points on text document changes, and disposes all sessions on `deactivate`.
- `ChatSession` toggles streaming vs. batch based on `copilotOptions.stream`, exposes `resultText()` for JSON workflows (e.g., `nameAndSave`), and aborts underlying requests when canceled.
- `ChatRequestBuilder` strips markdown role markers, merges/overrides messages (`**System(Override):**`), validates `copilot-options`/`copilot-tools` blocks (replying with a correction prompt when parse fails), merges duplicate tool declarations, and attaches multimodal parts when enabled.
- `ContextOutline` + `ContextDecorator` track the active context (indentation + `# Copilot Context:` markers), shade inactive ranges, and feed `collectActiveLines` for context-aware prompts; `resolveImport` recursively inlines `@import "foo.md"` content while deduping cycles.
- `filePathDiff.ts` expects paired `- path` / `+ path` lines; validates sources exist, destinations don’t conflict, and surfaces inline errors before performing `workspace.fs` operations relative to the workspace root.
- `nameAndSave.ts` runs the model in JSON mode (`temperature: Number.EPSILON`, `response_format: 'json'`), injects date/workspace variables, creates missing directories, saves the current document, and prunes newly created empty folders when the dialog is canceled.
- `pasteAsPrettyText.ts` deletes the current selection (if any) before streaming clipboard content rewritten in the current `languageId`, guided by `instructionsPasteAsPrettyTextMessage`.
- `ToolProvider` stores tool definitions in the request-scoped `ToolContext`; nested custom tool calls reuse the same provider instance but build their own contexts/definitions per request and can surface provider-supplied tools like `web_search` when available.
