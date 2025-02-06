# Change Log

All notable changes to the **Markdown Copilot** extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added
- Add support for pre-release
  - `major.EVEN_NUMBER.patch` for release versions and `major.ODD_NUMBER.patch` for pre-release versions

### Changed
- Update dependent packages
- Prepare browser support
  - Remove dependency on process.env
  - Remove dependency on node:fs module

## [0.7.0] - 2025-01-17
### Add
- Change support non-stream API calls

## [0.6.0] - 2024-12-16
### Add
- Add `Continue in multimodal context` command

## [0.5.1] - 2024-12-12
### Changed
- Resolve image URI as relative to document

## [0.5.0] - 2024-12-11
### Add
- Add `Paste as Markdown` command
- Add support image attachments
- Add setting items
  - `Markdown > Copilot > Instructions: Paste As Markdown Message`

## [0.4.0] - 2024-12-01
### Add
- Add "Example: Using the `o1-preview` model" section to READMEs
- Add `List File Path Diff` command
- Add `Apply File Path Diff` command
- New OpenAI models can be selected in the Settings
  - `gpt-4o-2024-11-20`

## [0.3.1] - 2024-06-03
### Add
- New OpenAI models can be selected in the Settings
  - `gpt-4o-2024-08-06`

## [0.3.0] - 2024-07-26
### Add
- New OpenAI models can be selected in the Settings
  - `gpt-4o-mini`
  - `gpt-4o-mini-2024-07-18`
- Add `Name and Save As...` command
- Add "Name and Save File" section to READMEs
- Add setting items
  - `Markdown > Copilot > Instructions: Name Message`
  - `Markdown > Copilot > Instructions: Name Path Format`

### Changed
- Update dependent packages

### Removed
- Remove OpenAI models
  - `gpt-4-vision-preview`
  - `gpt-4-32k`
  - `gpt-4-32k-0613`
  - `gpt-3.5-turbo-16k`
  - `gpt-3.5-turbo-16k-0613`

## [0.2.0] - 2024-06-04
### Add
- Support for Azure OpenAI

### Changed
- Update dependent packages

### Removed
- Remove milestone section from READMEs

## [0.1.0] - 2024-06-03
### Changed
- Change default OpenAI model
  - `gpt-4-turbo` -> `gpt-4o`
- Change default System message
  - Add `Utilizing structured formats such as code, pseudocode, JSON, Markdown tables, logical operators, or mathematical expressions to reduce ambiguity and improve clarity.`

## [0.0.9] - 2024-06-02
### Added
- Indicate ongoing completion with the emoji 📝

### Changed
- Update dependent packages

## [0.0.8] - 2024-05-14
### Added
- New OpenAI models can be selected in the Settings
  - `gpt-4o`
  - `gpt-4o-2024-05-13`
- Support for document import

### Changed
- Update dependent packages

## [0.0.7] - 2024-04-11
### Added
- New OpenAI models can be selected in the Settings
  - `gpt-4-turbo`
  - `gpt-4-turbo-2024-04-09`

### Changed
- Change default OpenAI model
  - `gpt-4-turbo-preview` -> `gpt-4-turbo`
- Make sure tags render correctly in Marketplace
  - <picture> tags in README.md are not rendered correctly in Marketplace.
- Update dependent packages

## [0.0.6] - 2024-03-14
### Added
- Allow to title in the active context
  - Add `markdown.copilot.instructions.titleMessage` configuration property
- Allow to continue editing without context

### Changed
- Change configuration property Ids
  - `markdown.copilot.openAI.systemMessage` -> `markdown.copilot.instructions.systemMessage`
  - `markdown.copilot.openAI.temperature` -> `markdown.copilot.options.temperature`
- Update dependent packages

## [0.0.5] - 2024-02-23
### Added
- Make it work as a web extension

### Changed
- Insert error messages as text when completion fails
- Update dependent packages

## [0.0.4] - 2024-02-22
### Changed
- Suppress CompletionItem triggers: ``` ` ```, `#`
- Fix line breaks in READMEs

## [0.0.3] - 2024-02-21
### Added
- README in Japanese and Simplified Chinese

### Changed
- Log level from error to warning when encountering unsupported locales

## [0.0.2] - 2024-02-21
### Added
- Allow specifying override options via Markdown

## [0.0.1] - 2024-02-20
### Added
- Initial release
- Markdown completion
- Cancel running completions
- Settings
- Refactor for code reuse
- Quote indentation
- Localization
  - English
  - Japanese
  - Simplified Chinese
- Documentation
- Review Markdown notation
- Publish to marketplace

[unreleased]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.5.1...v0.6.0
[0.5.1]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.9...v0.1.0
[0.0.9]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/kurusugawa-computer/markdown-copilot-vscode/releases/tag/v0.0.1