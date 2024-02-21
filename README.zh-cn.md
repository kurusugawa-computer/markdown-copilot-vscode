[![en](https://img.shields.io/badge/English-blue.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.md) [![ja](https://img.shields.io/badge/日本語-red.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.ja.md) [![zh-cn](https://img.shields.io/badge/简体中文-green.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.zh-cn.md)
# Markdown Copilot for Visual Studio Code

[![Version](https://img.shields.io/vscode-marketplace/v/kurusugawa-computer.markdown-copilot.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![Downloads](https://img.shields.io/vscode-marketplace/d/kurusugawa-computer.markdown-copilot.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/kurusugawa-computer/markdown-copilot-vscode/release.yml?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/actions)
[![GitHub stars](https://img.shields.io/github/stars/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square&label=github%20stars)](https://github.com/kurusugawa-computer/markdown-copilot-vscode)
[![GitHub Contributors](https://img.shields.io/github/contributors/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/graphs/contributors)

**Markdown Copilot** 在您编辑 Markdown 时提供自动文档编辑功能，就像有一个 AI 伙伴在旁辅助。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/markdown-copilot.gif" alt="基本使用" width="1024"></picture>

Markdown Copilot 使您能够完全替代 OpenAI ChatGPT WebUI，提供更优越的功能，例如:
1. 以 Markdown 形式保存对话历史
2. 同时提出多个问题
3. 分支对话
4. 随时编辑之前的对话并继续对话

***注意***: 使用此扩展需要 OpenAI API 密钥。更多信息，请参考 [OpenAI 官方常见问题](https://help.openai.com/en/articles/4936850-where-do-i-find-my-api-key)。

## 🌟 主要特性

### 🔀 并行编辑

同时执行多个自动编辑，通过不必等待一个编辑完成就开始另一个编辑，从而提高您的生产力。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/parallel-editing.gif" alt="并行编辑" width="1024"></picture>

### 🎛 上下文控制

使用引用缩进和语法颜色管理对话上下文，以层次化方式进行，以实现视觉上的上下文突出显示。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-switching.gif" alt="上下文控制" width="1024"></picture>

### 📝 上下文编辑

基于当前上下文轻松继续编辑，确保无缝的写作流程。

使用时，选择文本范围并从代码操作建议中选择 `💡 Markdown Copilot: 继续`。
<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing.png" alt="上下文编辑" width="356"></picture>

或使用快捷方式快速访问:

|      命令       |         Windows / Linux          |              Mac              |
| :------------: | :------------------------------: | :---------------------------: |
| `Copilot 继续` | <kbd>Ctrl</kbd>+<kbd>Space</kbd> | <kbd>⌃</kbd>+<kbd>Space</kbd> |

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing-shortcut.png" alt="上下文编辑快捷方式" width="442"></picture>

#### ♯ Markdown 中的上下文标记

通过从光标行回溯引用缩进来确定活动上下文。
可以通过以 `# Copilot Context` 开头的行强制上下文保护。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare.png" alt="示例: take care" width="512"></picture>

如果您选择 `Then say "take care".` 并选择 `💡 Markdown Copilot: 继续`，您将得到以下输出: `hello` → `good bye` → `take care`。
<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare-result.gif" alt="示例: take care" width="460"></picture>

更复杂的示例: 上下文跨越 `take care` 行继续。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-seeyouagain.png" alt="示例: see you again" width="512"></picture>

#### ᝰ 覆盖选项

使用覆盖选项自定义 Markdown Copilot 的行为。这允许您直接在文档中控制响应长度或 AI 模型等设置。

要使用覆盖选项，只需包含一个标记为 `json copilot-options` 的 JSON 代码块，并在其中填入您希望的设置，然后选择此块及您的文本并从代码操作建议中选择 `💡 Markdown Copilot: 继续`。
示例: 让 Markdown Copilot 用自定义的响应长度和模型介绍自己:

~~~markdown
自我介绍。

```json copilot-options
{"max_tokens":50,"model":"gpt-3.5-turbo"}
```
~~~

更多配置选项，请参考 [OpenAI API: 创建聊天完成](https://platform.openai.com/docs/api-reference/chat/create)。

### ⤷ 引用缩进

通过直观的操作简化引用缩进级别的编辑。

选择文本并从代码操作建议中选择 `💡 Markdown Copilot: 缩进引号行` 或 `💡 Markdown Copilot: 减少缩进报价行`。<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation.gif" alt="引用缩进" width="512"></picture>

或使用这些快捷方式:

|       命令        |                       Windows / Linux                        |                         Mac                         |
| :------------------: | :----------------------------------------------------------: | :-------------------------------------------------: |
| `缩进引用行`  |         <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>          |       <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>L</kbd>        |
| `减少引用行缩进` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>L</kbd> |

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation-shortcut.gif" alt="引用缩进快捷方式" width="512"></picture>

## 📋 先决条件

- 需要访问 OpenAI API。详情请访问 [OpenAI API](https://openai.com/blog/openai-api)。
- 必须安装 Visual Studio Code。从 [Visual Studio Code 下载页面](https://code.visualstudio.com/Download)下载。

## 🚀 提升您的 Markdown 体验

将 Markdown Copilot 与这些扩展结合使用，获得更强大的 Markdown 体验:
- **[Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)**:
  全面的 Markdown 支持(键盘快捷键、目录、自动预览等)。
- **[Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)**:
  为 VS Code 内置的 markdown 预览添加 Mermaid 图表和流程图支持。
- **[Markdown+Math](https://marketplace.visualstudio.com/items?itemName=goessner.mdmath)**:
  使用 LaTeX 数学增强您的 Markdown ... 包括宏等。

## 🗺️ 路线图

- [x] Markdown 完成
- [x] 取消正在运行的完成
- [x] 设置
- [x] 代码重用的重构
- [x] 引用缩进
- [x] 本地化
  - [x] 英语
  - [x] 日语
  - [x] 简体中文
- [x] 文档
- [x] 审查 Markdown 符号
- [x] 发布到市场
- [x] 使选项可覆盖
- [ ] 提示模板
- [ ] 导入文件
- [ ] 图像生成: DALL·E
- [ ] 灵活的端点: 代理和基础 URL 支持
- [ ] 增强工具: ChatCompletionTools
- [ ] 单元测试

## 🔄 更新日志

有关详细更新，请参阅 [更新日志](CHANGELOG.md)。

## 🤝 参与其中
- 通过 [GitHub Issues](https://github.com/kurusugawa-computer/markdown-copilot-vscode/issues) 报告错误或建议功能。
- 通过在 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot#review-details) 上留下评论分享您的反馈。
