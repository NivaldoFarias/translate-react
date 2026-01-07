# translate-react

<h3 align="center" style="color: #999;"><b>Work In Progress</b></h3>
  
Automated translation tool for React documentation using Large Language Models (LLMs). Processes markdown files, preserves formatting, and creates pull requests with translated content.

## Table of Contents

- [translate-react](#translate-react)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [Prerequisites](#prerequisites)
    - [Runtime Requirements](#runtime-requirements)
    - [API Access](#api-access)
    - [Repository Setup](#repository-setup)
    - [Supported Repositories](#supported-repositories)
  - [Quick Start](#quick-start)
    - [1. Clone the Repository](#1-clone-the-repository)
    - [2. Install Dependencies](#2-install-dependencies)
    - [3. Configure Environment](#3-configure-environment)
    - [4. Run in Development Mode](#4-run-in-development-mode)
  - [Configuration](#configuration)
    - [Required Environment Variables](#required-environment-variables)
    - [Optional Environment Variables](#optional-environment-variables)
  - [Usage](#usage)
    - [Development Mode](#development-mode)
    - [Production Mode](#production-mode)
  - [Project Structure](#project-structure)
  - [Documentation](#documentation)
  - [Contributing](#contributing)
    - [Setup](#setup)
    - [Development Standards](#development-standards)
    - [Patterns](#patterns)
  - [Troubleshooting](#troubleshooting)
    - [Common Issues](#common-issues)
    - [Debug Mode](#debug-mode)
    - [Getting Help](#getting-help)
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

- **Bun** v1.0.0+ (primary runtime and package manager)[^1]
- **Node.js** v20+ (dependency compatibility)
- **Git** (repository operations)

[^1]: This project uses Bun exclusively. Do not use npm/yarn/pnpm.

### API Access

- **GitHub Personal Access Token** with `repo` scope
- **LLM API Key** (OpenAI, OpenRouter, Azure OpenAI, or compatible)

### Repository Setup

- Fork of target React documentation repository
- Write access to fork for branch/PR creation
- Optional: tracking issue in fork for progress updates

### Supported Repositories

Designed for React documentation repositories but can be adapted to any markdown-based documentation with `src/` directory structure _(with some tweaks)_.

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/NivaldoFarias/translate-react.git && cd translate-react
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Then, Edit `.env` with your API keys (see [Configuration section](#configuration)).

### 4. Run in Development Mode

> [!IMPORTANT]
> Make sure to setup a `.env.dev` file with `DEV_MODE_FORK_PR=true` to create PRs against your fork instead of upstream. This prevents permission issues during development.

```bash
bun run dev
```

## Configuration

Environment variables are validated at runtime using Zod schemas. See [`src/utils/env.util.ts`](./src/utils/env.util.ts) for complete schema definitions and validation rules.

### Required Environment Variables

These must be set in your `.env` _(or `.env.dev`, for development)_ file:

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

| Variable            | Default                                            | Description                              |
| ------------------- | -------------------------------------------------- | ---------------------------------------- |
| `LLM_MODEL`         | `google/gemini-2.0-flash-exp:free`                 | Model ID for translation                 |
| `LLM_API_BASE_URL`  | `https://openrouter.ai/api/v1`                     | API endpoint                             |
| `OPENAI_PROJECT_ID` | —                                                  | Optional: OpenAI project ID for tracking |
| `MAX_TOKENS`        | `8192`                                             | Maximum tokens per LLM response          |
| `HEADER_APP_URL`    | `https://github.com/NivaldoFarias/translate-react` | App URL for OpenRouter tracking          |
| `HEADER_APP_TITLE`  | `translate-react v0.1.18`                          | App title for OpenRouter tracking        |

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

| Variable                | Default       | Description                                                            |
| ----------------------- | ------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`              | `development` | Runtime environment                                                    |
| `LOG_LEVEL`             | `info`        | Logging verbosity (`trace`\|`debug`\|`info`\|`warn`\|`error`\|`fatal`) |
| `LOG_TO_CONSOLE`        | `true`        | Enable console logging in addition to file logs                        |
| `PROGRESS_ISSUE_NUMBER` | `555`         | GitHub issue number for progress reports                               |

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
├─ src/
│  ├── errors/                    # Error handling system
│  ├── locales/                   # Language locale definitions
│  ├── services/                  # Core services
│  │   ├── cache/                 # In-memory caching
│  │   ├── github/                # GitHub API integration
│  │   ├── locale/                # Locale management
│  │   ├── rate-limiter/          # API rate limiting
│  │   ├── runner/                # Workflow orchestration
│  │   ├── service-factory.service.ts  # Dependency injection
│  │   └── translator.service.ts  # LLM translation engine
│  ├── utils/                     # Utilities and constants
│  └── main.ts                    # Entry point
│
├── docs/                         # Technical documentation
├── tests/                        # Test suite
└── logs/                         # Structured error logs (JSONL)
```

> [!TIP]
> For the complete directory structure with file-level details, see [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md).

## Documentation

| Document                                                  | Description                                                  |
| --------------------------------------------------------- | ------------------------------------------------------------ |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md)                 | System architecture, service design, and design patterns     |
| [WORKFLOW.md](./docs/WORKFLOW.md)                         | Execution workflow with timing analysis and performance data |
| [ERROR_HANDLING.md](./docs/ERROR_HANDLING.md)             | Error taxonomy and recovery mechanisms                       |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)           | Troubleshooting guide and diagnostic procedures              |
| [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)       | Complete directory structure and navigation guide            |
| [GITHUB_ACTIONS_SETUP.md](./docs/GITHUB_ACTIONS_SETUP.md) | CI/CD workflow configuration guide                           |

## Contributing

Contributions are welcome. Follow these guidelines:

### Setup

1. Fork repository and create feature branch
2. Install dependencies: `bun install`
3. Create `.env.dev` with `NODE_ENV=development`
4. Run tests: `bun test`

### Development Standards

- **TypeScript**: All code must be properly typed with strict mode enabled
- **Bun Runtime**: Use Bun exclusively (not npm/yarn/pnpm)
- **Error Handling**: Follow established patterns in [ERROR_HANDLING.md](./docs/ERROR_HANDLING.md)
- **Testing**: Add tests for new features using Bun's test runner
- **Code Style**: Follow ESLint/Prettier configuration
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) format

> [!TIP]
> See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for service design patterns when extending the codebase.

## Troubleshooting

### Common Issues

| Error                                                   | Solution                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `GH_TOKEN: String must contain at least 1 character(s)` | Set `GH_TOKEN` and `LLM_API_KEY` in `.env`                                |
| `GITHUB_NOT_FOUND`                                      | Verify repository permissions and token scope                             |
| `GITHUB_RATE_LIMITED`                                   | Tool auto-retries with backoff; consider GitHub App token for heavy usage |
| `OpenAI API error: insufficient_quota`                  | Check API credits; switch providers via `LLM_API_BASE_URL`                |

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL="debug" bun dev
```

> [!TIP]
> For comprehensive troubleshooting guidance including diagnostic procedures and log analysis, see [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

## License

MIT License - see [LICENSE](./LICENSE) file for details.
