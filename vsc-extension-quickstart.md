# Welcome to your VS Code Extension

## What's in the folder

* This folder contains all of the files necessary for your extension.
* `package.json` - this is the manifest file in which you declare your extension and command.
  * The sample plugin registers a command and defines its title and command name. With this information VS Code can show the command in the command palette. It doesn’t yet need to load the plugin.
* `src/extension.ts` - this is the main file where you will provide the implementation of your command.
  * The file exports one function, `activate`, which is called the very first time your extension is activated (in this case by executing the command). Inside the `activate` function we call `registerCommand`.
  * We pass the function containing the implementation of the command as the second parameter to `registerCommand`.

## Setup

* install the recommended extensions (amodio.tsl-problem-matcher, ms-vscode.extension-test-runner, and dbaeumer.vscode-eslint)


## Get up and running straight away

* Press `F5` to open a new window with your extension loaded.
* Run your command from the command palette by:
  1. selecting some text range and 
  2. pressing (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac)
  3. typing `Markdown Copilot`
* Set breakpoints in your code inside `src/extension.ts` to debug your extension.
* Find output from your extension in the debug console.

## Make changes

* You can relaunch the extension from the debug toolbar after changing code in `src/extension.ts`.
* You can also reload (`Ctrl+R` or `Cmd+R` on Mac) the VS Code window with your extension to load your changes.


## Explore the API

* You can open the full set of our API when you open the file `node_modules/@types/vscode/index.d.ts`.

## Run tests

* Install the [Extension Test Runner](https://marketplace.visualstudio.com/items?itemName=ms-vscode.extension-test-runner)
* Run the "watch" task via the **Tasks: Run Task** command. Make sure this is running, or tests might not be discovered.
* Open the Testing view from the activity bar and click the Run Test" button, or use the hotkey `Ctrl/Cmd + ; A`
* See the output of the test result in the Test Results view.
* Make changes to `src/test/extension.test.ts` or create new test files inside the `test` folder.
  * The provided test runner will only consider files matching the name pattern `**.test.ts`.
  * You can create folders inside the `test` folder to structure your tests any way you want.

## Run GitHub Actions tests

### Pre-requirement

- **Docker in Docker**:
  A docker container must be able to mount `/var/run/docker.sock` to run GitHub Actions inside docker.
  So only tested in Linux and macOS environment.
- **GitHub personal access token**:
  A GitHub personal access token may be required to run workflows.
  Which must have Public Repositories (read-only) access.

  See: [Managing your personal access tokens - GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

### Run GitHub Actions

You can run GitHub Actions using the following commands:
* List jobs
  * `bash tools/run_github_actions.sh --list`
* Latest bulid test
  * `bash tools/run_github_actions.sh package`
* All push test
  * `bash tools/run_github_actions.sh push`
* Show help
  * `bash tools/run_github_actions.sh --help`
  * Detailed command examples: <https://github.com/nektos/act#example-commands>