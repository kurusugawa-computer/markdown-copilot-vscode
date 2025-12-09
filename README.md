[![en](https://img.shields.io/badge/English-blue.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.md) [![ja](https://img.shields.io/badge/日本語-red.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.ja.md) [![zh-cn](https://img.shields.io/badge/简体中文-green.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.zh-cn.md)
# Markdown Copilot for Visual Studio Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/kurusugawa-computer.markdown-copilot.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/kurusugawa-computer.markdown-copilot.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/kurusugawa-computer/markdown-copilot-vscode/release.yml?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/actions)
[![GitHub stars](https://img.shields.io/github/stars/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square&label=github%20stars)](https://github.com/kurusugawa-computer/markdown-copilot-vscode)
[![GitHub Contributors](https://img.shields.io/github/contributors/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/graphs/contributors)


**Markdown Copilot** is an LLM API client for VS Code.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/markdown-copilot.gif" alt="Basic Usage" width="1024">

Markdown Copilot enables you to fully replace the OpenAI ChatGPT WebUI, offering superior features such as:
1. Using [Model Context Protocol Servers](https://code.visualstudio.com/updates/v1_99#_model-context-protocol-server-support)
2. Saving conversation histories in Markdown
3. Conducting multiple conversations simultaneously
4. Branching out conversations
5. Editing previous conversations at any point and continuing the conversation
6. Nameing files based on conversations
7. Titling conversations
8. Pasting clipboard content intelligently based on file type

***Note***: An OpenAI, Azure OpenAI, OpenRouter, or local Ollama instance is required to use this extension. For configuration:
- [OpenAI API Key](https://help.openai.com/en/articles/4936850-where-do-i-find-my-api-key)
- [Azure OpenAI Quickstart](https://learn.microsoft.com/en-us/azure/ai-services/openai/quickstart)
- [OpenRouter API Keys](https://openrouter.ai/keys): supports OpenAI, Claude, Gemini, Llama 3, and more.
- [Local Ollama instance](https://ollama.com/): supports Llama 3.3, DeepSeek-R1, Phi-4, Mistral, Gemma 2, and other models, locally. 

## 🛰️ Available Backends

Select a backend with `markdown.copilot.backend.protocol`:
- **OpenAI**: Chat Completions (default) for general use.
- **OpenAI Responses**: Calls the Responses API and unlocks OpenAI's built-in `web_search` tool.
- **Azure**: Point `backend.baseUrl` to your deployment URL (chat/completions). Uses `webSearchPreview` when available.
- **Google Vertex**: Set `backend.baseUrl` to the service-account JSON URI (e.g., `file:///path/key.json`) and pick a Vertex model such as `gemini-3-pro-preview`.
- **OpenRouter** and **Ollama**: Configure their endpoints and API keys for hosted or local models.

## 🌟 Key Features

### ⚡ MCP Servers and Tool Calls

Markdown Copilot calls tools (function calling) and can pull additional tools from [Model Context Protocol (MCP) servers](https://github.com/modelcontextprotocol/servers). Declare the tools you want in a `json copilot-tools` or `yaml copilot-tools` block, select it with your prompt, then run `💡 Markdown Copilot: Continue`.

**Tool prefixes**
- `@` builtin groups: `@context` (context_summary_and_new, context_reset_and_new), `@file` (fs_read_file, fs_read_dir, fs_find_files), `@eval!` (eval_js), `@web` (backend web search; on OpenAI Responses or Azure with `webSearchPreview`).
- `^` VS Code LM tools **or** MCP servers added in VS Code: value is a regex that filters tool providers, e.g., `^copilot` (built-in Copilot tools) or `^my-mcp-server` to target a named MCP server you configured. See [Add an MCP server](https://code.visualstudio.com/docs/copilot/customization/mcp-servers) for setup steps.
- No prefix: single tools like `web_search`, `fs_read_file`, or custom tools from `copilot-tool-definition` blocks.

**Example: list available tools**

~~~markdown
List all tools you can use.

```json copilot-tools
["^copilot"]
```
~~~

**Example: combine web search and file read**

~~~markdown
Use web search and read a file before answering.

```json copilot-tools
["@web", "fs_read_file"]
```
~~~

**Web search (OpenAI Responses/Azure webSearchPreview)**

~~~markdown
Find the latest VS Code release notes and summarize them.

```json copilot-tools
["@web"]
```
~~~

You can also request the tool explicitly:

~~~markdown
What is the newest Python stable version?

```json copilot-tools
["web_search"]
```
~~~

For instructions on adding an MCP server, see [Use MCP servers in VS Code: Add an MCP server](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server).

### 🔀 Parallel Editing

Execute multiple auto-edits simultaneously, enhancing your productivity by not having to wait for one edit to complete before starting another.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/parallel-editing.gif" alt="Parallel Editing" width="1024">

### 📝 Contextual Editing

Markdown Copilot answers to selected text based on context.

To use, select a text range and choose `💡 Markdown Copilot: Continue` from the code action proposals.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing.png" alt="Contextual Editing" width="356">

Or use shortcuts for quick access:

|      Command         |         Windows / Linux                                          |              Mac                                           |
| :------------------: | :--------------------------------------------------------------: | :--------------------------------------------------------: |
| `Trigger suggestion` | <kbd>Ctrl</kbd>+<kbd>Space</kbd> or <kbd>Ctrl</kbd>+<kbd>I</kbd> | <kbd>⌃</kbd>+<kbd>Space</kbd> or <kbd>⌘</kbd>+<kbd>I</kbd> |

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing-shortcut.png" alt="Contextual Editing Shortcut" width="442">

### ᝰ Override Options

Customize Markdown Copilot's behavior with override options. This allows you to control settings like response length or the AI model directly within your document.

To use override options, simply include a JSON or YAML code block labeled `json copilot-options` or `yaml copilot-options` respectively with your desired settings, then select this block along with your text and choose `💡 Markdown Copilot: Continue` from the code action proposals.

**Example:** Let Markdown Copilot introduce itself with customized response length and model (JSON)

~~~markdown
Introduce yourself.

```json copilot-options
{"max_tokens":50,"model":"gpt-3.5-turbo"}
```
~~~

**Example:** Let Markdown Copilot introduce itself with customized response length and model (YAML)

~~~markdown
Introduce yourself.

```yaml copilot-options
max_tokens: 50
model: gpt-3.5-turbo
```
~~~

**Example:** Using the `o1-preview` model (JSON)

The `o1-preview` model do not support system messages, so we will use `**System(Override):**` to clear the system messages.

~~~markdown
**System(Override):**

**User:**
Introduce yourself.

```json copilot-options
{"model":"o1-preview","temperature":1}
```
~~~

**Example:** Using local Ollama with `llama2` model (JSON)
~~~markdown
Introduce yourself.

```json copilot-options
{"model":"llama2","baseURL":"http://localhost:11434/v1"}
```
~~~

**Example:** Using local Ollama with `llama2` model (YAML)
~~~markdown
Introduce yourself.

```yaml copilot-options
model: llama2
baseURL: http://localhost:11434/v1
```
~~~

For more configuration options, please refer to the [OpenAI API: Create chat completion](https://platform.openai.com/docs/api-reference/chat/create).

### 📛 Name and Save File

Markdown Copilot allows you to name and save a file based on its contents.

To use, select the editor you want to name and save, and use the `Markdown Copilot: Name and Save As...` command.

Or use shortcuts for quick access:

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Name and Save As</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Name and Save As</kbd> |

### 🏷️ Titling the Active Context

Markdown Copilot allows you to title a conversation based on the conversation history.
Conversation titles are represented as lines beginning with `# Copilot Context: `.

To use, move the cursor to the context you want to title and use the `Markdown Copilot: Title active context` command.

Or use shortcuts for quick access:

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Title active context</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Title active context</kbd> |

### 🪄 Summarize and New Context

Markdown Copilot allows you to summarize the current context and start a new context based on the summary.
This feature helps prevent the conversation context from becoming excessively long, which can impair the model's ability to process the conversation effectively, while also making it easier for you to grasp the conversation's essence.

To use, move the cursor to the context you want to summarize and use the `Markdown Copilot: Summarize and New Context` command.

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Summarize and New Context</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Summarize and New Context</kbd> |

### 📋⤵ Paste as Pretty Text

Markdown Copilot allows you to paste clipboard content into your document in an intelligent way, adapting to the file type.
This feature ensures that pasted content integrates seamlessly into your editing files, avoiding unnecessary formatting issues.

To use this feature, select the location where you want to paste the content and use the `Markdown Copilot: Paste as Pretty Text` command.

Or use shortcuts for quick access:

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Paste as pretty</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Paste as pretty</kbd> |

### 📥 Import Other Markdown Files

Markdown Copilot allows you to easily import other Markdown files into your current document.
This enables you to reference or reuse content from other documents.

To import another Markdown file, use the `@import` directive followed by the path to the file you want to import, enclosed in double quotes.

**Example with a relative path:** Import `another-markdown.md` located at a relative position from the current file.

```markdown
@import "path/to/another-markdown.md"
```

**Example with an absolute path:** Use an absolute path from the root directory of the workspace to import `toplevel-markdown.md`.

```markdown
@import "/toplevel-markdown.md"
```

When the current document is unsaved and thus lacks a confirmed file path, you must use an absolute path to specify other Markdown files to be imported.

### 🎛 Context Control

Manage conversational contexts hierarchically, using context indentation and syntax colors for visual context highlighting.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-switching.gif" alt="Context Control" width="1024">

#### ♯ Context Notation in Markdown

The active context is determined by tracing back the context indent from the cursor line.
Can force a context guard with a line starting with `# Copilot Context`.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare.png" alt="Example: take care" width="512">

If you select `Then say "take care".` and choose `💡 Markdown Copilot: Continue`, you will get the following output: `hello` → `good bye` → `take care`.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare-result.gif" alt="Example: take care" width="460">

**More complex example:** the context continues across `take care` line.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-seeyouagain.png" alt="Example: see you again" width="512">

**Specifying a speaker:** You can specify a speaker by placing a special Markdown notation at the beginning of a line.

| Markdown | Meaning |
| -------- | ---- |
| `**User:**` | User is the speaker |
| `**Copilot:**` | Markdown Copilot is the speaker |
| `**System(Override):**` | Overrides [system message](https://platform.openai.com/docs/guides/prompt-engineering/tactic-ask-the-model-to-adopt-a-persona) |
| `**System:**` | Specifies additional [system message](https://platform.openai.com/docs/guides/prompt-engineering/tactic-ask-the-model-to-adopt-a-persona) |

#### ⤷ Context Indentation

Simplify the editing of context indentation levels with intuitive actions.

Select text and choose `💡 Markdown Copilot: Indent Context Line` or `💡 Markdown Copilot: Outdent Context Line` from code action proposals.

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation.gif" alt="Context Indentation" width="512">

Or use these shortcuts:

|       Command        |                       Windows / Linux                        |                         Mac                         |
| :------------------: | :----------------------------------------------------------: | :-------------------------------------------------: |
| `Indent Context Line`  |         <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>          |       <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>L</kbd>        |
| `Outdent Context Line` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>L</kbd> |

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation-shortcut.gif" alt="Context Indentation Shortcut" width="512">

## 📋 Prerequisites

- Access to the OpenAI API or Azure OpenAI Service is necessary. For details, visit [OpenAI API](https://openai.com/blog/openai-api) or [Azure OpenAI Quickstart](https://learn.microsoft.com/en-us/azure/ai-services/openai/quickstart).
- Visual Studio Code must be installed. Download it from the [Visual Studio Code download page](https://code.visualstudio.com/Download).

## 🔌 Enhance Your Markdown Experience

Combine Markdown Copilot with these extensions for an even more powerful Markdown experience:
- **[Markdown All in One]**:
  Comprehensive Markdown support (keyboard shortcuts, table of contents, auto preview, and more).
- **[Snippets]**:
  Supercharge your Snippets in VS Code — Manage your code snippets without quitting your editor.
- **[Markdown Preview Mermaid Support]**:
  Adds Mermaid diagram and flowchart support to VS Code's built-in markdown preview.
- **[Markdown Preview Enhanced]**:
  Markdown Preview Enhanced is a SUPER POWERFUL markdown extension for Visual Studio Code. The goal of this project is to bring you a wonderful markdown writing experience.
- **[Markdown+Math]**:
  Enhance your Markdown with LaTeX Math ... including macros and more.

## 🔄 Changelog

For detailed updates, refer to the [CHANGELOG](CHANGELOG.md).

## 🤝 Get Involved

- Report bugs or suggest features via [GitHub Issues](https://github.com/kurusugawa-computer/markdown-copilot-vscode/issues).
- Share your feedback by leaving a review on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot#review-details).


[Markdown All in One]: https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
[Snippets]: https://marketplace.visualstudio.com/items?itemName=tahabasri.snippets
[Markdown Preview Mermaid Support]: https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid
[Markdown Preview Enhanced]: https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced
[Markdown+Math]: https://marketplace.visualstudio.com/items?itemName=goessner.mdmath
