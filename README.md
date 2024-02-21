[![en](https://img.shields.io/badge/English-blue.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.md) [![ja](https://img.shields.io/badge/日本語-red.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.ja.md) [![zh-cn](https://img.shields.io/badge/简体中文-green.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.zh-cn.md)
# Markdown Copilot for Visual Studio Code

[![Version](https://img.shields.io/vscode-marketplace/v/kurusugawa-computer.markdown-copilot.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![Downloads](https://img.shields.io/vscode-marketplace/d/kurusugawa-computer.markdown-copilot.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/kurusugawa-computer/markdown-copilot-vscode/release.yml?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/actions)
[![GitHub stars](https://img.shields.io/github/stars/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square&label=github%20stars)](https://github.com/kurusugawa-computer/markdown-copilot-vscode)
[![GitHub Contributors](https://img.shields.io/github/contributors/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/graphs/contributors)


**Markdown Copilot** provides automatic document editing from an AI pair editor as you edit Markdown.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/markdown-copilot.gif" alt="Basic Usage" width="1024"></picture>

Markdown Copilot enables you to fully replace the OpenAI ChatGPT WebUI, offering superior features such as:
1. Saving conversation histories in Markdown
2. Asking multiple questions simultaneously
3. Branching out conversations
4. Editing previous conversations at any point and continuing the dialogue

***Note***: An OpenAI API Key is required to use this extension. For more information, please refer to the [OpenAI official FAQ](https://help.openai.com/en/articles/4936850-where-do-i-find-my-api-key).

## 🌟 Key Features

### 🔀 Parallel Editing

Execute multiple auto-edits simultaneously, enhancing your productivity by not having to wait for one edit to complete before starting another.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/parallel-editing.gif" alt="Parallel Editing" width="1024"></picture>

### 🎛 Context Control

Manage conversational contexts hierarchically, using quote indentation and syntax colors for visual context highlighting.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-switching.gif" alt="Context Control" width="1024"></picture>

### 📝 Contextual Editing

Effortlessly continue editing based on the current context, ensuring a seamless writing flow.

To use, select a text range and choose `💡 Markdown Copilot: Continue` from the code action proposals.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing.png" alt="Contextual Editing" width="356"></picture>

Or use shortcuts for quick access:

|      Command       |         Windows / Linux          |              Mac              |
| :----------------: | :------------------------------: | :---------------------------: |
| `Copilot continue` | <kbd>Ctrl</kbd>+<kbd>Space</kbd> | <kbd>⌃</kbd>+<kbd>Space</kbd> |

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing-shortcut.png" alt="Contextual Editing Shortcut" width="442"></picture>

#### ♯ Context Notation in Markdown

The active context is determined by tracing back the quote indent from the cursor line.
Can force a context guard with a line starting with `# Copilot Context`.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare.png" alt="Example: take care" width="512"></picture>

If you select `Then say "take care".` and choose `💡 Markdown Copilot: Continue`, you will get the following output: `hello` → `good bye` → `take care`.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare-result.gif" alt="Example: take care" width="460"></picture>

More complex example: the context continues across `take care` line.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-seeyouagain.png" alt="Example: see you again" width="512"></picture>

#### ᝰ Override Options

Customize Markdown Copilot's behavior with override options. This allows you to control settings like response length or the AI model directly within your document.

To use override options, simply include a JSON code block labeled `json copilot-options` with your desired settings, then select this block along with your text and choose `💡 Markdown Copilot: Continue` from the code action proposals.

Example: Let Markdown Copilot introduce itself with customized response length and model:

~~~markdown
Introduce yourself.

```json copilot-options
{"max_tokens":50,"model":"gpt-3.5-turbo"}
```
~~~

For more configuration options, please refer to the [OpenAI API: Create chat completion](https://platform.openai.com/docs/api-reference/chat/create).

### ⤷ Quote Indentation

Simplify the editing of quote indentation levels with intuitive actions.

Select text and choose `💡 Markdown Copilot: Indent Quote Line` or `💡 Markdown Copilot: Outdent Quote Line` from code action proposals.

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation.gif" alt="Quote Indentation" width="512"></picture>

Or use these shortcuts:

|       Command        |                       Windows / Linux                        |                         Mac                         |
| :------------------: | :----------------------------------------------------------: | :-------------------------------------------------: |
| `Indent Quote Line`  |         <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>          |       <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>L</kbd>        |
| `Outdent Quote Line` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>L</kbd> |

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation-shortcut.gif" alt="Quote Indentation Shortcut" width="512"></picture>

## 📋 Prerequisites

- Access to the OpenAI API is necessary. For details, visit [OpenAI API](https://openai.com/blog/openai-api).
- Visual Studio Code must be installed. Download it from the [Visual Studio Code download page](https://code.visualstudio.com/Download).

## 🚀 Enhance Your Markdown Experience

Combine Markdown Copilot with these extensions for an even more powerful Markdown experience:
- **[Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)**:
  Comprehensive Markdown support (keyboard shortcuts, table of contents, auto preview, and more).
- **[Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)**:
  Adds Mermaid diagram and flowchart support to VS Code's built-in markdown preview.
- **[Markdown+Math](https://marketplace.visualstudio.com/items?itemName=goessner.mdmath)**:
  Enhance your Markdown with LaTeX Math ... including macros and more.

## 🗺️ Roadmap

- [x] Markdown completion
- [x] Cancel running completions
- [x] Settings
- [x] Refactor for code reuse
- [x] Quote indentation
- [x] Localization
  - [x] English
  - [x] Japanese
  - [x] Simplified Chinese
- [x] Documentation
- [x] Review Markdown notation
- [x] Publish to marketplace
- [x] Make options overridable
- [ ] Prompt templates
- [ ] Importing files
- [ ] Image Generation: DALL·E
- [ ] Flexible endpoint: Proxy and base URL support
- [ ] Augment tools: ChatCompletionTools
- [ ] Unit testing

## 🔄 Changelog

For detailed updates, refer to the [CHANGELOG](CHANGELOG.md).

## 🤝 Get Involved

- Report bugs or suggest features via [GitHub Issues](https://github.com/kurusugawa-computer/markdown-copilot-vscode/issues).
- Share your feedback by leaving a review on the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot#review-details).
