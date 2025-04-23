[![en](https://img.shields.io/badge/English-blue.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.md) [![ja](https://img.shields.io/badge/日本語-red.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.ja.md) [![zh-cn](https://img.shields.io/badge/简体中文-green.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.zh-cn.md)
# Markdown Copilot for Visual Studio Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/kurusugawa-computer.markdown-copilot.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/kurusugawa-computer.markdown-copilot.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/kurusugawa-computer/markdown-copilot-vscode/release.yml?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/actions)
[![GitHub stars](https://img.shields.io/github/stars/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square&label=github%20stars)](https://github.com/kurusugawa-computer/markdown-copilot-vscode)
[![GitHub Contributors](https://img.shields.io/github/contributors/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/graphs/contributors)


**Markdown Copilot** 是用于 VSCode 的 OpenAI ChatGPT API 客户端。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/markdown-copilot.gif" alt="基本使用" width="1024">

Markdown Copilot 使您能够完全替代 OpenAI ChatGPT WebUI，提供更优越的功能，例如:
1. 利用Model Context Protocol服务器
2. 以 Markdown 形式保存对话历史
3. 同时进行多个对话
4. 分支对话
5. 随时编辑之前的对话并继续对话
6. 根据对话命名文件
7. 标题对话
8. 根据文件类型智能粘贴剪贴板内容

***注意***：使用此扩展需要配置 OpenAI, Azure OpenAI, OpenRouter 或本地 Ollama 实例。配置方法如下：  
- [OpenAI API Key](https://help.openai.com/en/articles/4936850-where-do-i-find-my-api-key)  
- [Azure OpenAI 快速入门](https://learn.microsoft.com/en-us/azure/ai-services/openai/quickstart)  
- [OpenRouter API Keys](https://openrouter.ai/keys)：支持 OpenAI, Claude, Gemini, Llama 3 等  
- [本地 Ollama 实例](https://ollama.com/)：可在本地使用 Llama 3.3, DeepSeek-R1, Phi-4, Mistral, Gemma 2 等模型

## 🌟 主要特性

### ⚡ 利用 Model Context Protocol 服务器

Markdown Copilot 可以通过覆盖工具与 [Model Context Protocol (MCP) 服务器](https://github.com/modelcontextprotocol/servers) 集成以扩展功能。
通过 MCP 服务器访问外部工具和数据源，实现更强大、更精准的对话。

要使用覆盖工具，只需包含一个标记为 `json copilot-tools` 的 JSON 代码块，并在其中填入您希望的设置，然后选择此块及您的文本并从代码操作建议中选择 `💡 Markdown Copilot: 继续`。

**示例:** 使用覆盖工具列出可用工具:

~~~markdown
请列出你可以使用的所有工具。

```json copilot-tools
["^copilot"]
```
~~~

关于如何添加 MCP 服务器，请参考 [Use MCP servers in VSCode: Add an MCP server](https://code.visualstudio.com/docs/copilot/chat/mcp-servers#_add-an-mcp-server)。

### 🔀 并行编辑

同时执行多个自动编辑，通过不必等待一个编辑完成就开始另一个编辑，从而提高您的生产力。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/parallel-editing.gif" alt="并行编辑" width="1024">

### 📝 上下文编辑

Markdown Copilot根据上下文回答选文。

使用时，选择文本范围并从代码操作建议中选择 `💡 Markdown Copilot: 继续`。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing.png" alt="上下文编辑" width="356">

或使用快捷方式快速访问:

|    命令   |         Windows / Linux                                          |              Mac                                           |
| :-------: | :--------------------------------------------------------------: | :--------------------------------------------------------: |
| `触发建议` | <kbd>Ctrl</kbd>+<kbd>Space</kbd> 或 <kbd>Ctrl</kbd>+<kbd>I</kbd> | <kbd>⌃</kbd>+<kbd>Space</kbd> 或 <kbd>⌘</kbd>+<kbd>I</kbd> |


<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing-shortcut.png" alt="上下文编辑快捷方式" width="442">

### ᝰ 覆盖选项

使用覆盖选项自定义 Markdown Copilot 的行为。这允许您直接在文档中控制响应长度或 AI 模型等设置。

要使用覆盖选项，只需包含一个标记为 `json copilot-options` 或 `yaml copilot-options` 的 JSON 或 YAML 代码块，并在其中填入您希望的设置，然后选择此块及您的文本并从代码操作建议中选择 `💡 Markdown Copilot: 继续`。

**示例:** 让 Markdown Copilot 用自定义的响应长度和模型介绍自己 (JSON):

~~~markdown
自我介绍。

```json copilot-options
{"max_tokens":50,"model":"gpt-3.5-turbo"}
```
~~~

**示例:** 让 Markdown Copilot 用自定义的响应长度和模型介绍自己 (YAML):

~~~markdown
自我介绍。

```yaml copilot-options
max_tokens: 50
model: gpt-3.5-turbo
```
~~~

**示例：** 使用 `o1-preview` 模型 (JSON)

`o1-preview` 模型不支持系统消息，因此我们将使用 `**System(Override):**` 清除系统消息。

~~~markdown
**System(Override):**

**User:**
自我介绍。

```json copilot-options
{"model":"o1-preview","temperature":1}
```
~~~

**示例：** 使用本地 Ollama 的 `llama2` 模型 (JSON)
~~~markdown
自我介绍。

```json copilot-options
{"model":"llama2","baseURL":"http://localhost:11434/v1"}
```
~~~

**示例：** 使用本地 Ollama 的 `llama2` 模型 (YAML)
~~~markdown
自我介绍。

```yaml copilot-options
model: llama2
baseURL: http://localhost:11434/v1
```
~~~

更多配置选项，请参考 [OpenAI API: 创建聊天完成](https://platform.openai.com/docs/api-reference/chat/create)。

### 📛 命名和另存文件

Markdown Copilot 允许您根据文件内容命名和另存文件。

要使用此功能，请选择您要命名和保存的编辑器，然后使用 `Markdown Copilot: 命名和另存为...` 命令。

或者使用快捷方式快速访问：

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Name and Save As</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Name and Save As</kbd> |

### 🏷️ 为活动上下文添加标题

Markdown Copilot 可以根据对话历史记录为对话添加标题。
对话标题以`# Copilot Context: `开头的行表示。

要使用此功能，请将光标移至您要标题的上下文，然后使用 `Markdown Copilot: 活动上下文标题` 命令。

或使用快捷方式快速访问:

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Title active context</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Title active context</kbd> |

### 🪄 总结并开启新的上下文
Markdown Copilot 允许您先对当前上下文进行总结，然后根据该总结开启新的上下文。
此功能有助于防止对话上下文变得过长，从而影响模型的处理效果，同时也能让您更轻松地掌握对话的要点。

要使用此功能，请将光标移动到要总结的上下文，然后使用 `Markdown Copilot: 总结并开始新上下文` 命令。

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Summarize and New Context</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Summarize and New Context</kbd> |

### 📋⤵ 粘贴为美化文本

Markdown Copilot 允许您以智能方式将剪贴板内容粘贴到文档中，并根据文件类型进行适配。  
此功能确保粘贴的内容能够无缝集成到您的编辑文件中，避免不必要的格式问题。

要使用此功能，请选择您希望粘贴内容的位置，然后使用 `Markdown Copilot: 粘贴为美化文本` 命令。

或者使用快捷键快速访问：

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Paste as pretty</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Paste as pretty</kbd> |

### 📥 导入其他 Markdown 文件
Markdown Copilot 允许您轻松地将其他 Markdown 文件导入当前文档。
这使得引用或重用其他文档的内容成为可能。

要导入其他 Markdown 文件，请使用 `@import` 指令。
在此指令后，用双引号括起来，指定您想要导入的文件的路径。

**相对路径示例：** 从当前文件的相对位置导入 `another-markdown.md`。

```markdown
@import "path/to/another-markdown.md"
```

**绝对路径示例：** 使用从工作区根目录开始的绝对路径导入 `toplevel-markdown.md`。

```markdown
@import "/toplevel-markdown.md"
```

如果当前文档尚未保存，因为文件路径未确定，您必须使用绝对路径来指定要导入的其他 Markdown 文件。

### 🎛 上下文控制

使用引用缩进和语法颜色管理对话上下文，以层次化方式进行，以实现视觉上的上下文突出显示。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-switching.gif" alt="上下文控制" width="1024">

#### ♯ Markdown 中的上下文标记

通过从光标行回溯引用缩进来确定活动上下文。
可以通过以 `# Copilot Context` 开头的行强制上下文保护。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare.png" alt="示例: take care" width="512">

如果您选择 `Then say "take care".` 并选择 `💡 Markdown Copilot: 继续`，您将得到以下输出: `hello` → `good bye` → `take care`。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare-result.gif" alt="示例: take care" width="460">

**更复杂的示例:** 上下文跨越 `take care` 行继续。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-seeyouagain.png" alt="示例: see you again" width="512">

**指定发言人:** 您可以在行首使用特殊的 Markdown 符号来指定发言人。

| Markdown | 意思 |
| -------- | ---- |
| `**User:**` | 用户是发言人 |
| `**Copilot:**` | Markdown Copilot 是发言人 |
| `**System(Override):**` | 覆盖系统消息 |
| `**System:**` | 指定额外的系统消息 |

#### ⤷ 引用缩进

通过直观的操作简化引用缩进级别的编辑。

选择文本并从代码操作建议中选择 `💡 Markdown Copilot: 缩进引号行` 或 `💡 Markdown Copilot: 减少缩进报价行`。

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation.gif" alt="引用缩进" width="512">

或使用这些快捷方式:

|       命令        |                       Windows / Linux                        |                         Mac                         |
| :------------------: | :----------------------------------------------------------: | :-------------------------------------------------: |
| `缩进引用行`  |         <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>          |       <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>L</kbd>        |
| `减少引用行缩进` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>L</kbd> |

<img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation-shortcut.gif" alt="引用缩进快捷方式" width="512">

## 📋 先决条件

- 需要访问 OpenAI 或 Azure OpenAI API。详情请访问 [OpenAI API](https://openai.com/blog/openai-api)或[Azure OpenAI Quickstart](https://learn.microsoft.com/zh-cn/azure/ai-services/openai/quickstart)。
- 必须安装 Visual Studio Code。从 [Visual Studio Code 下载页面](https://code.visualstudio.com/Download)下载。

## 🔌 提升您的 Markdown 体验

将 Markdown Copilot 与这些扩展结合使用，获得更强大的 Markdown 体验:
- **[Markdown All in One]**:
  全面的 Markdown 支持(键盘快捷键、目录、自动预览等)。
- **[Snippets]**:
  为 VS 代码中的代码片段增效 - 无需退出编辑器即可管理代码片段。
- **[Markdown Preview Mermaid Support]**:
  为 VS Code 内置的 markdown 预览添加 Mermaid 图表和流程图支持。
- **[Markdown Preview Enhanced]**:
  Markdown Preview Enhanced 是一款为 Visual Studio Code 编辑器编写的超级强大的 Markdown 插件。 这款插件意在让你拥有飘逸的 Markdown 写作体验。
- **[Markdown+Math]**:
  使用 LaTeX 数学增强您的 Markdown ... 包括宏等。

## 🔄 更新日志

有关详细更新，请参阅 [更新日志](CHANGELOG.md)。

## 🤝 参与其中
- 通过 [GitHub Issues](https://github.com/kurusugawa-computer/markdown-copilot-vscode/issues) 报告错误或建议功能。
- 通过在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot#review-details) 上留下评论分享您的反馈。


[Markdown All in One]: https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one
[Snippets]: https://marketplace.visualstudio.com/items?itemName=tahabasri.snippets
[Markdown Preview Mermaid Support]: https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid
[Markdown Preview Enhanced]: https://marketplace.visualstudio.com/items?itemName=shd101wyy.markdown-preview-enhanced
[Markdown+Math]: https://marketplace.visualstudio.com/items?itemName=goessner.mdmath
