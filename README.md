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

Designed for React documentation repositories but can be adapted to any markdown-based documentation with `src/` directory structure *(with some tweaks)*.

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

These must be set in your `.env` *(or `.env.dev`, for development)* file:

| Variable         | Description                                                |
| ---------------- | ---------------------------------------------------------- |
| `GH_TOKEN`       | GitHub Personal Access Token with `repo` scope             |
| `OPENAI_API_KEY` | API key for LLM service (OpenAI, OpenRouter, Azure OpenAI) |

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
| `OPENAI_BASE_URL`   | `https://openrouter.ai/api/v1`                     | API endpoint                             |
| `OPENAI_PROJECT_ID` | —                                                  | Optional: OpenAI project ID for tracking |
| `MAX_TOKENS`        | `8192`                                             | Maximum tokens per LLM response          |
| `HEADER_APP_URL`    | `https://github.com/NivaldoFarias/translate-react` | App URL for OpenRouter tracking          |
| `HEADER_APP_TITLE`  | `translate-react v0.1.17`                          | App title for OpenRouter tracking        |

</details>

<details>
<summary><b>Translation Settings</b></summary>

| Variable          | Default | Description                             |
| ----------------- | ------- | --------------------------------------- |
| `TARGET_LANGUAGE` | `pt-br` | Target translation language (ISO 639-1) |
| `SOURCE_LANGUAGE` | `en`    | Source language (ISO 639-1)             |
| `BATCH_SIZE`      | `10`    | Files to process in parallel            |

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
│  ├── services/                  # Core services
│  │   ├── cache/                 # In-memory caching
│  │   ├── github/                # GitHub API integration
│  │   ├── runner/                # Workflow orchestration
│  │   └── translator.service.ts  # LLM translation engine
│  ├── utils/                     # Utilities and constants
│  └── main.ts                    # Entry point
│
├── docs/                         # Documentation
└── logs/                         # Structured error logs (JSONL)
```

## Documentation

- [**ARCHITECTURE.md**](./docs/ARCHITECTURE.md) - System architecture, service design, error handling patterns, and design decisions
- [**WORKFLOW.md**](./docs/WORKFLOW.md) - Detailed execution workflow with timing analysis, bottleneck identification, and performance data
- [**ERROR_HANDLING.md**](./docs/ERROR_HANDLING.md) - Error taxonomy, recovery mechanisms, and debugging strategies
- [**DEBUGGING.md**](./docs/DEBUGGING.md) - Troubleshooting guides and diagnostic procedures
- [**PROJECT_STRUCTURE.md**](./docs/PROJECT_STRUCTURE.md) - Comprehensive project organization, directory structure, and navigation guide

## Contributing

Contributions are welcome. Follow these guidelines:

### Setup

1. Fork repository and create feature branch
2. Install dependencies: `bun install`
3. Create `.env.dev` with development configuration:
```bash
NODE_ENV=development
```
4. Run tests: `bun test`

### Development Standards

- **TypeScript**: All code must be properly typed
- **Bun Runtime**: Use Bun exclusively (not npm/yarn/pnpm)
- **Error Handling**: Follow established error patterns (see [ERROR_HANDLING.md](./docs/ERROR_HANDLING.md))
- **Documentation**: Maintain comprehensive JSDoc comments (see [.github/instructions/jsdocs.instructions.md](./.github/instructions/jsdocs.instructions.md))
- **Commits**: Use conventional commit format (see [.github/instructions/commit.instructions.md](./.github/instructions/commit.instructions.md))
- **Testing**: Add tests for new features
- **Code Style**: Follow ESLint/Prettier configuration

### Patterns

- **Services**: Extend appropriate base classes
- **Errors**: Create specific error types for new failure scenarios
- **Environment**: Add new variables to Zod schema in `env.util.ts`
- **Caching**: Use existing cache service for runtime state

## Troubleshooting

### Common Issues

<details>
<summary><b>Environment Validation Errors</b></summary>

**Error**: `❌ Invalid environment variables: - GH_TOKEN: String must contain at least 1 character(s)`

**Solution**: Ensure required variables (`GH_TOKEN`, `OPENAI_API_KEY`) are set in `.env` file.

</details>

<details>
<summary><b>GitHub "Not Found" Errors</b></summary>

**Error**: `GITHUB_NOT_FOUND - https://docs.github.com/rest/git/refs#get-a-reference`

**Solution**: Set `DEV_MODE_FORK_PR=true` in `.env.dev` to create PRs against your fork instead of upstream (prevents permission issues during development).

</details>

<details>
<summary><b>GitHub API Rate Limiting</b></summary>

**Error**: `GITHUB_RATE_LIMITED - API rate limit exceeded`

**Solution**: Tool automatically retries with exponential backoff. For heavy usage, consider GitHub App token instead of PAT.

</details>

<details>
<summary><b>Translation API Errors</b></summary>

**Error**: `OpenAI API error: insufficient_quota`

**Solution**: Check API key has sufficient credits. Switch providers by changing `OPENAI_BASE_URL`.

</details>

### Debug Mode

> [!TIP]
> For a more detailed debugging guidance, see [`DEBUGGING.md`](./docs/DEBUGGING.md).

#### Enable verbose logging:

```bash
LOG_LEVEL="debug" bun dev
```

#### Analyze error logs *(`.jsonl` format)*:

##### View Recent Errors

```bash
tail -f logs/$(ls -t logs/ | head -1) | jq '.'
```

##### Filter by Error Type

```bash
grep "GITHUB_NOT_FOUND" logs/*.log | jq '.'
```

##### Error Pattern Analysis

```bash
cat logs/*.log | jq '.code' | sort | uniq -c
```

### Getting Help

- [GitHub Issues](https://github.com/NivaldoFarias/translate-react/issues) - Bug reports and feature requests
- [GitHub Discussions](https://github.com/NivaldoFarias/translate-react/discussions) - Questions and support
- [Documentation](./docs/) - Detailed technical documentation

## License

MIT License - see [LICENSE](./LICENSE) file for details.
