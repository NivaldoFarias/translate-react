# translate-react

<div align="center">

<h3 align="center" style="color: #999;"><b>Work In Progress</b></h3>

[![CI Status](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml)

</div>
  
Automated translation tool for React documentation using Large Language Models (LLMs). Processes markdown files, preserves formatting, and creates pull requests with translated content via [`translate-react` Bot](https://github.com/apps/translate-react-bot).

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Overview](#overview)
- [Prerequisites](#prerequisites)
  - [Runtime Requirements](#runtime-requirements)
  - [API Access](#api-access)
  - [Repository Setup](#repository-setup)
  - [Supported Repositories](#supported-repositories)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Required Environment Variables](#required-environment-variables)
  - [Optional Environment Variables](#optional-environment-variables)
- [Usage](#usage)
  - [Development Mode](#development-mode)
  - [Production Mode](#production-mode)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Debug Mode](#debug-mode)
- [License](#license)

## Overview

Automation tool for translating React documentation repositories. Uses LLM APIs to translate markdown files while preserving code blocks, formatting, and technical terminology. Integrates with GitHub to create PRs for each translated file.

**Core Workflow**:

1. Verifies GitHub token permissions and syncs fork with upstream
2. Fetches repository tree and identifies markdown files requiring translation
3. Uses language detection to determine translation necessity
4. Processes files in configurable batches with LLM translation
5. Creates individual branches and pull requests for each file
6. Updates tracking issues with progress and links to PRs

> [!TIP]
> For detailed workflow analysis including timing breakdowns and bottlenecks, see [WORKFLOW.md](./docs/WORKFLOW.md).

## Prerequisites

### Runtime Requirements

- [**Bun**](https://bun.sh/) v1.0.0+: _(primary runtime and package manager)_
- [**Git**](https://git-scm.com/): _(repository operations)_

### API Access

- **GitHub Personal Access Token** with `repo` scope
- **LLM API Key** (OpenAI, OpenRouter, Azure OpenAI, or compatible)

### Repository Setup

- Fork of target React documentation repository
- Write access to fork for branch/PR creation
- _Optional_: tracking issue in fork for progress updates

### Supported Repositories

Designed for React documentation repositories but can be adapted to any markdown-based documentation with `src/` directory structure _(with some tweaks)_.

## Quick Start

1. Clone the Repository and Navigate to Directory: `git clone https://github.com/NivaldoFarias/translate-react.git && cd translate-react`
2. Install Dependencies: `bun install`
3. Configure Environment: `cp .env.example .env`
   3.1. Then, edit `.env` with your API keys _(see [Configuration section](#configuration))_
4. Run in Development Mode: `bun run dev`

## Configuration

Environment variables are validated at runtime using Zod schemas. See [`src/utils/env.util.ts`](./src/utils/env.util.ts) for complete schema definitions and validation rules.

### Required Environment Variables

These **must** be set in your `.env` file:

| Variable      | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `GH_TOKEN`    | GitHub Personal Access Token with `repo` scope             |
| `LLM_API_KEY` | API key for LLM service (OpenAI, OpenRouter, Azure OpenAI) |

### Optional Environment Variables

> [!IMPORTANT]
> All optional variables have defaults defined in [`src/utils/constants.util.ts`](./src/utils/constants.util.ts).

<details>
<summary><b>GitHub Configuration</b></summary>

| Variable              | Default           | Description                          |
| --------------------- | ----------------- | ------------------------------------ |
| `REPO_FORK_OWNER`     | `nivaldofarias`   | Fork owner username/organization     |
| `REPO_FORK_NAME`      | `pt-br.react.dev` | Fork repository name                 |
| `REPO_UPSTREAM_OWNER` | `reactjs`         | Upstream owner username/organization |
| `REPO_UPSTREAM_NAME`  | `pt-br.react.dev` | Upstream repository name             |
| `GH_REQUEST_TIMEOUT`  | `30000`           | GitHub API timeout (milliseconds)    |

</details>

<details>
<summary><b>LLM Configuration</b></summary>

| Variable             | Default                                            | Description                                    |
| -------------------- | -------------------------------------------------- | ---------------------------------------------- |
| `LLM_MODEL`          | `google/gemini-2.0-flash-exp:free`                 | Model ID for translation                       |
| `LLM_API_BASE_URL`   | `https://openrouter.ai/api/v1`                     | API endpoint                                   |
| `OPENAI_PROJECT_ID`  | —                                                  | Optional: OpenAI project ID for tracking       |
| `MAX_TOKENS`         | `8192`                                             | Maximum tokens per LLM response                |
| `HEADER_APP_URL`     | `https://github.com/NivaldoFarias/translate-react` | App URL for OpenRouter tracking                |
| `HEADER_APP_TITLE`   | `translate-react v0.1.21`                          | App title for OpenRouter tracking              |
| `MAX_RETRY_ATTEMPTS` | `5`                                                | Maximum number of retries for LLM API requests |

</details>

<details>
<summary><b>Translation Settings</b></summary>

| Variable          | Default | Description                             |
| ----------------- | ------- | --------------------------------------- |
| `TARGET_LANGUAGE` | `pt-br` | Target translation language (ISO 639-1) |
| `SOURCE_LANGUAGE` | `en`    | Source language (ISO 639-1)             |
| `BATCH_SIZE`      | `1`     | Files to process in parallel            |

</details>

<details>
<summary><b>Development/Debug Settings</b></summary>

| Variable         | Default       | Description                                                            |
| ---------------- | ------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`       | `development` | Runtime environment                                                    |
| `LOG_LEVEL`      | `info`        | Logging verbosity (`trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`) |
| `LOG_TO_CONSOLE` | `true`        | Enable console logging in addition to file logs                        |

</details>

## Usage

### Development Mode

Development mode with auto-reload on file changes:

```bash
bun run dev
```

### Production Mode

```bash
bun start
```

## Project Structure

```plaintext
translate-react/
├── src/
│   ├── clients/                        # Octokit, OpenAI, queue clients
│   ├── errors/                         # Error handling (ApplicationError, helpers)
│   ├── locales/                        # Language locale definitions
│   ├── services/                      # Core services
│   │   ├── cache/                     # In-memory caching
│   │   ├── github/                    # GitHub API (single service)
│   │   ├── locale/                    # Locale management
│   │   ├── runner/                    # Workflow orchestration
│   │   └── translator.service.ts      # LLM translation engine
│   ├── utils/                         # Utilities and constants
│   └── main.ts                        # Entry point
│
├── docs/                               # Technical documentation
├── tests/                              # Test suite
└── logs/                               # Structured error logs (JSONL)
```

> [!TIP]
> For the complete directory structure with file-level details, see [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md).

## Documentation

| Document                                            | Description                                                  |
| --------------------------------------------------- | ------------------------------------------------------------ |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md)           | System architecture, service design, and design patterns     |
| [WORKFLOW.md](./docs/WORKFLOW.md)                   | Execution workflow with timing analysis and performance data |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)     | Troubleshooting guide and diagnostic procedures              |
| [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) | Complete directory structure and navigation guide            |

## Contributing

Contributions are welcome. Follow these guidelines:

- **TypeScript**: All code must be properly typed with strict mode enabled
- **Bun Runtime**: Use Bun exclusively _(not npm/yarn/pnpm)_
- **Testing**: Add tests for new features using Bun's test runner
- **Code Style**: Follow ESLint/Prettier configuration
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) format

> [!TIP]
> See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for service design patterns when extending the codebase.

## Troubleshooting

### Common Issues

| Error                                                   | Solution                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `GH_TOKEN: String must contain at least 1 character(s)` | Set `GH_TOKEN` and `LLM_API_KEY` in `.env`                         |
| GitHub API error (404 / 403 / 429)                      | Verify repository and token scope; tool auto-retries on rate limit |
| LLM API error (quota / rate limit)                      | Check API credits; switch providers via `LLM_API_BASE_URL`         |

### Debug Mode

Enable verbose logging: `LOG_LEVEL="debug" bun run dev`

> [!TIP]
> For comprehensive troubleshooting guidance including diagnostic procedures and log analysis, see [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

## License

MIT License - see [LICENSE](./LICENSE) file for details.
