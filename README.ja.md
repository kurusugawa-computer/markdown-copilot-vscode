[![en](https://img.shields.io/badge/English-blue.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.md) [![ja](https://img.shields.io/badge/日本語-red.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.ja.md) [![zh-cn](https://img.shields.io/badge/简体中文-green.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/blob/main/README.zh-cn.md)
# Markdown Copilot for Visual Studio Code

[![Version](https://img.shields.io/vscode-marketplace/v/kurusugawa-computer.markdown-copilot.svg?style=flat-square&label=vscode%20marketplace)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![Downloads](https://img.shields.io/vscode-marketplace/d/kurusugawa-computer.markdown-copilot.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot)
[![GitHub Workflow Status](https://img.shields.io/github/actions/workflow/status/kurusugawa-computer/markdown-copilot-vscode/release.yml?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/actions)
[![GitHub stars](https://img.shields.io/github/stars/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square&label=github%20stars)](https://github.com/kurusugawa-computer/markdown-copilot-vscode)
[![GitHub Contributors](https://img.shields.io/github/contributors/kurusugawa-computer/markdown-copilot-vscode.svg?style=flat-square)](https://github.com/kurusugawa-computer/markdown-copilot-vscode/graphs/contributors)


**Markdown Copilot** はVSCode用のOpenAI ChatGPT APIクライアントです。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/markdown-copilot.gif" alt="基本的な使用方法" width="1024"></picture>

Markdown Copilotを使用すると、OpenAI ChatGPT WebUIを完全に置き換えることができ、次のような優れた機能を提供します:
1. 会話履歴をMarkdownで保存する
2. 複数の会話を同時並行で行う
3. 会話を分岐させる
4. 会話履歴を編集して会話を続ける

***注***: この拡張機能を使用するには、OpenAI APIキーが必要です。詳細については、[OpenAI公式FAQ](https://help.openai.com/en/articles/4936850-where-do-i-find-my-api-key)を参照してください。

## 🌟 主な機能

### 🔀 並行編集

複数の自動編集を同時に実行し、ひとつの編集が完了するのを待たずに別の編集を開始できるため、作業速度が向上します。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/parallel-editing.gif" alt="並行編集" width="1024"></picture>

### 🎛 コンテキストコントロール

引用インデントと構文カラーを使用して、会話のコンテキストを階層的に管理し、視覚的にコンテキストを強調表示します。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-switching.gif" alt="コンテキストコントロール" width="1024"></picture>

### 📝 コンテキストに基づく編集

Markdown Copilotはコンテキストに基づいて選択したテキストに回答します。

使用するには、テキスト範囲を選択し、コードアクションの提案から `💡 Markdown Copilot: 続ける` を使用します。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing.png" alt="コンテキストに基づく編集" width="356"></picture>

または、クイックアクセスのためのショートカットキーを使用します:

|      コマンド       |         Windows / Linux          |              Mac              |
| :----------------: | :------------------------------: | :---------------------------: |
| `候補をトリガー`    | <kbd>Ctrl</kbd>+<kbd>Space</kbd> または <kbd>Ctrl</kbd>+<kbd>I</kbd> | <kbd>⌃</kbd>+<kbd>Space</kbd> または <kbd>⌘</kbd>+<kbd>I</kbd> |

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/contextual-editing-shortcut.png" alt="コンテキストに基づく編集のショートカット" width="442"></picture>

#### ♯ Markdownにおけるコンテキスト表記

アクティブなコンテキストは、カーソル行から引用インデントを遡って決定されます。
`# Copilot Context`で始まる行でコンテキストガードを強制することができます。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare.png" alt="例: take care" width="512"></picture>

`Then say "take care".`を選択して`💡 Markdown Copilot: 続ける` を使用すると、次の出力が得られます: `hello` → `good bye` → `take care`。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-takecare-result.gif" alt="例: take care" width="460"></picture>

**より複雑な例:** コンテキストは`take care`行を跨いで継続します。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/context-notation-example-seeyouagain.png" alt="例: see you again" width="512"></picture>

**発言者の指定:** 行頭に特定のMarkdown表記を配置することで発言者を指定できます。

| Markdown | 意味 |
| -------- | ---- |
| `**User:**` | ユーザ自身の発言であることを指定します |
| `**Copilot:**` | Markdown Copilotの発言であることを指定します |
| `**System(Override):**` | [システムメッセージ](https://platform.openai.com/docs/guides/prompt-engineering/tactic-ask-the-model-to-adopt-a-persona)を上書き指定します |
| `**System:**` | [システムメッセージ](https://platform.openai.com/docs/guides/prompt-engineering/tactic-ask-the-model-to-adopt-a-persona)を追加で指定します |

#### ᝰ オーバーライドオプション

Markdown Copilotの挙動をオーバーライドオプションでカスタマイズします。これにより、文書内で直接、応答の長さやAIモデルなどの設定をコントロールできます。

オーバーライドオプションを使用するには、希望する設定を含むJSONコードブロックを `json copilot-options` として含め、このブロックとテキストを一緒に選択し、コードアクションの提案から `💡 Markdown Copilot: 続ける` を使用します。

**例:** カスタマイズされた応答の長さとモデルでMarkdown Copilotに自己紹介させる:

~~~markdown
自己紹介してください。

```json copilot-options
{"max_tokens":50,"model":"gpt-3.5-turbo"}
```
~~~

他の設定オプションについては、[OpenAI API: Create chat completion](https://platform.openai.com/docs/api-reference/chat/create)を参照してください。

### 🏷️ アクティブコンテキストにタイトルを付ける

Markdown Copilotは会話履歴をもとに会話にタイトルを付けられます。
会話タイトルは`# Copilot Context: `で始まる行として表現します。

タイトルを付けたいコンテキストにカーソルを移動して`Markdown Copilot: アクティブコンテキストにタイトルを付ける`コマンドを使用します。

次のショートカットキーを使用します:

| Windows / Linux | Mac |
| :-------------: | :---: |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> > <kbd>Title active context</kbd> | <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>P</kbd> > <kbd>Title active context</kbd> |

### ⤷ 引用インデント

引用インデントレベルの編集を直感的なアクションで行えます。

テキストを選択し、コードアクションの提案から `💡 Markdown Copilot: 引用行をインデント` または `💡 Markdown Copilot: 引用行をアンインデント` を使用します。

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation.gif" alt="引用インデント" width="512"></picture>

または、次のショートカットキーを使用します:

|       コマンド        |                       Windows / Linux                        |                         Mac                         |
| :------------------: | :----------------------------------------------------------: | :-------------------------------------------------: |
| `Indent Quote Line`  |         <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd>          |       <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>L</kbd>        |
| `Outdent Quote Line` | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>⇧</kbd>+<kbd>L</kbd> |

<picture><img src="https://github.com/kurusugawa-computer/markdown-copilot-vscode/raw/main/images/quote-indentation-shortcut.gif" alt="引用インデントのショートカット" width="512"></picture>

## 📋 前提条件

- OpenAI APIへのアクセスが必要です。詳細については、[OpenAI API](https://openai.com/blog/openai-api)をご覧ください。
- Visual Studio Codeがインストールされている必要があります。[Visual Studio Codeダウンロードページ](https://code.visualstudio.com/Download)からダウンロードしてください。

## 🚀 Markdown体験を強化する

次の拡張機能とMarkdown Copilotを組み合わせて、さらに強力なMarkdown体験を実現します:
- **[Markdown All in One](https://marketplace.visualstudio.com/items?itemName=yzhang.markdown-all-in-one)**:
  包括的なMarkdownサポート(キーボードショートカット、目次、自動プレビューなど)。
- **[Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid)**:
  VS Codeの組み込みmarkdownプレビューにMermaidダイアグラムとフローチャートのサポートを追加します。
- **[Markdown+Math](https://marketplace.visualstudio.com/items?itemName=goessner.mdmath)**:
  LaTeX Mathを使用してMarkdownを強化します...マクロなどを含む。

## 🗺️ ロードマップ
- [x] Markdown補完
- [x] 実行中の補完をキャンセル
- [x] 設定
- [x] コード再利用のためのリファクタリング
- [x] 引用インデント
- [x] ローカライゼーション
  - [x] 英語
  - [x] 日本語
  - [x] 簡体字中国語
- [x] ドキュメント
- [x] Markdown記法のレビュー
- [x] マーケットプレイスへの公開
- [x] オプションをオーバーライド可能にする
- [x] アクティブなコンテキストにタイトルを付ける
- [ ] プロンプトテンプレート
- [ ] ファイルのインポート
- [ ] 画像生成: DALL·E
- [ ] 柔軟なエンドポイント: プロキシとベースURLのサポート
- [ ] ツールの拡張: ChatCompletionTools
- [ ] ユニットテスト

## 🔄 変更履歴
詳細な更新については、[CHANGELOG](CHANGELOG.md)を参照してください。

## 🤝 参加する
- [GitHub Issues](https://github.com/kurusugawa-computer/markdown-copilot-vscode/issues)を通じてバグを報告したり、機能を提案してください。
- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=kurusugawa-computer.markdown-copilot#review-details)でレビューを残してフィードバックを共有してください。
