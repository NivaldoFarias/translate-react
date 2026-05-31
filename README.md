# translate-react

<div align="center">

[![CI Status](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml)

</div>

CLI tool that translates the official React documentation via LLMs, keeps structure intact, and opens PRs through the [`translate-react` bot](https://github.com/apps/translate-react-bot).

## Start here

| You are…                                | Read                                                                                                                                                                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuring a fork or GitHub Actions    | [Wiki: Configuration](https://github.com/NivaldoFarias/translate-react/wiki/Configuration) and [Workflow — Operating forks](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#operating-translate-react-forks) |
| Reviewing a bot PR on a locale repo     | [Wiki: For React Docs Maintainers](https://github.com/NivaldoFarias/translate-react/wiki/For-React-Docs-Maintainers)                                                                                                        |
| Understanding run order, polling, or CI | [Wiki: Workflow](https://github.com/NivaldoFarias/translate-react/wiki/Workflow)                                                                                                                                            |
| Exploring `src/` layout and services    | [Wiki: Codebase](https://github.com/NivaldoFarias/translate-react/wiki/Codebase)                                                                                                                                            |

Full wiki index: [Home](https://github.com/NivaldoFarias/translate-react/wiki).

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Start here](#start-here)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [GitHub Actions on a fork](#github-actions-on-a-fork)
- [Configuration](#configuration)
- [Usage](#usage)
- [Versioning and releases](#versioning-and-releases)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Prerequisites

- [**Bun**](https://bun.sh/) (see `engines` in [`package.json`](./package.json)) and [**Git**](https://git-scm.com/)
- **GitHub Personal Access Token** with `repo` scope
- **LLM API Key** (OpenAI, OpenRouter, or compatible)
- Fork of target React documentation repository with write access

## Quick Start

1. Clone and enter the repo (replace the URL if you use a fork): `git clone https://github.com/NivaldoFarias/translate-react.git && cd translate-react`
2. Install Dependencies: `bun install`
3. Setup the forks of the target React documentation repositories:
   - For the Portuguese (Brazil) repository, fork [`reactjs/pt-br.react.dev`](https://github.com/reactjs/pt-br.react.dev/) to your GitHub account
   - (Optional) For the Russian repository, fork [`reactjs/ru.react.dev`](https://github.com/reactjs/ru.react.dev/) to your GitHub account
4. Install the [`translate-react-bot`](https://github.com/apps/translate-react-bot) GitHub App on the forks of the target React documentation repositories:
5. Configure environment: `cp .env.example .env`, then set secrets per [Wiki: Configuration](https://github.com/NivaldoFarias/translate-react/wiki/Configuration)
6. Run in Development Mode: `bun run dev`

> [!TIP]
> Run order, fork setup, and polling: [Wiki: Workflow](https://github.com/NivaldoFarias/translate-react/wiki/Workflow).

## GitHub Actions on a fork

Enable Actions on the repo that holds the workflow, install the bot, and set the secrets and variables listed under [Operating translate-react (forks)](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#operating-translate-react-forks). Scheduled runs use [`.github/workflows/poll.yml`](./.github/workflows/poll.yml) to detect new commits on `reactjs/<lang>.react.dev` before starting translation ([Automated upstream polling](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#automated-upstream-polling)). Manual translation: [`.github/workflows/workflow.yml`](./.github/workflows/workflow.yml). Pin a commit SHA or tag in your fork workflow when you need a fixed tool version ([Releases](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#releases-and-semantic-versioning)).

## Configuration

Environment variables, defaults, and troubleshooting: [Wiki: Configuration](https://github.com/NivaldoFarias/translate-react/wiki/Configuration). Schema: [`src/app/schemas/env.schema.ts`](./src/app/schemas/env.schema.ts).

## Usage

### Development mode (auto-reload)

```bash
bun run dev
```

### Production mode

```bash
bun start
```

To exercise translation with real LLM calls and mocked GitHub, run the workflow integration tests (`tests/integration/workflow.integration.spec.ts`) with fixture markdown under `tests/fixtures/md/`. See [Local LLM exercise](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#local-llm-exercise-integration-tests).

## Versioning and releases

- `package.json`'s `version` is the semver source. OpenRouter header defaults pull from `homepage`, `name`, and `version` unless overridden (see [Wiki: Configuration](https://github.com/NivaldoFarias/translate-react/wiki/Configuration)).
- Change log: [`CHANGELOG.md`](./CHANGELOG.md).
- Tag and release steps: [Releases and semantic versioning](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#releases-and-semantic-versioning).

## Documentation

| Document                                                                                                             | Description                                       |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [Wiki: Workflow](https://github.com/NivaldoFarias/translate-react/wiki/Workflow)                                     | Run order, forks, releases, CI, integration tests |
| [Wiki: Codebase](https://github.com/NivaldoFarias/translate-react/wiki/Codebase)                                     | `src/` layout, services, composition              |
| [Wiki: Configuration](https://github.com/NivaldoFarias/translate-react/wiki/Configuration)                           | Environment variables and troubleshooting         |
| [Wiki: For React Docs Maintainers](https://github.com/NivaldoFarias/translate-react/wiki/For-React-Docs-Maintainers) | Reviewing bot PRs                                 |
| [Wiki: FAQ](https://github.com/NivaldoFarias/translate-react/wiki/FAQ)                                               | Short answers                                     |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md)                                                                               | Patches and conventions                           |
| [`CHANGELOG.md`](./CHANGELOG.md)                                                                                     | Release notes                                     |
| [`SECURITY.md`](./SECURITY.md)                                                                                       | Vulnerability reporting                           |

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Layout and services: [Wiki: Codebase](https://github.com/NivaldoFarias/translate-react/wiki/Codebase).

## Security

[`SECURITY.md`](./SECURITY.md)

## Troubleshooting

Common errors, debug logging, and CI notes: [Wiki: Configuration — Troubleshooting](https://github.com/NivaldoFarias/translate-react/wiki/Configuration#troubleshooting).

## License

MIT License - see [LICENSE](./LICENSE) file for details.
