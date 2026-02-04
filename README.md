# translate-react

<div align="center">

<h3 align="center" style="color: #999;"><b>Work In Progress</b></h3>

[![CI Status](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml)

</div>
  
Automated translation tool for React documentation using LLMs. Processes markdown files, preserves formatting, and creates pull requests via [`translate-react` Bot](https://github.com/apps/translate-react-bot).

> [!TIP]
> For detailed workflow analysis, see [WORKFLOW.md](./docs/WORKFLOW.md).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Prerequisites

- [**Bun**](https://bun.sh/) v1.0.0+ and [**Git**](https://git-scm.com/)
- **GitHub Personal Access Token** with `repo` scope
- **LLM API Key** (OpenAI, OpenRouter, or compatible)
- Fork of target React documentation repository with write access

## Quick Start

1. Clone the Repository and Navigate to Directory: `git clone https://github.com/NivaldoFarias/translate-react.git && cd translate-react`
2. Install Dependencies: `bun install`
3. Setup the forks of the target React documentation repositories:
   3.1. For the Portuguese (Brazil) repository, fork [`reactjs/pt-br.react.dev`](https://github.com/reactjs/pt-br.react.dev/) to your GitHub account
   3.2. (Optional) For the Russian repository, fork [`reactjs/ru.react.dev`](https://github.com/reactjs/ru.react.dev/) to your GitHub account
4. Install the `translate-react-bot` GitHub App on the forks of the target React documentation repositories:
5. Configure Environment: `cp .env.example .env`
   5.1. Then, edit `.env` with your API keys _(see [Configuration section](#configuration))_
6. Run in Development Mode: `bun run dev`

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

| Variable              | Default           | Description                                  |
| --------------------- | ----------------- | -------------------------------------------- |
| `REPO_FORK_OWNER`     | `nivaldofarias`   | Fork owner username/organization             |
| `REPO_FORK_NAME`      | `pt-br.react.dev` | Fork repository name                         |
| `REPO_UPSTREAM_OWNER` | `reactjs`         | Upstream owner username/organization         |
| `REPO_UPSTREAM_NAME`  | `pt-br.react.dev` | Upstream repository name                     |
| `GH_REQUEST_TIMEOUT`  | `30000`           | GitHub API timeout (milliseconds)            |
| `GH_PAT_TOKEN`        | —                 | Fallback PAT for 403 errors (see note below) |

> [!NOTE]
> **GH_PAT_TOKEN**: Optional fallback token for permission-related failures. When the primary `GH_TOKEN` receives a 403 (Forbidden) error, the client automatically retries with this PAT. Useful when GitHub App tokens have different permission scopes than PATs for certain operations.

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

```bash
bun run dev   # Development mode (auto-reload)
bun start     # Production mode
```

## Project Structure

```plaintext
translate-react/
├── src/
│   ├── clients/                          # Octokit, OpenAI, queue clients
│   ├── errors/                           # Error handling (ApplicationError, helpers)
│   ├── locales/                          # Language locale definitions
│   ├── services/                         # Core services
│   │   ├── cache/                        # In-memory caching
│   │   ├── github/                       # GitHub API (single service)
│   │   ├── locale/                       # Locale management
│   │   ├── comment-builder/              # Comment builder
│   │   ├── language-detector/            # Language detector
│   │   ├── runner/                       # Workflow orchestration
│   │   └── translator/                   # LLM translation engine
│   ├── utils/                            # Utilities and constants
│   └── main.ts                           # Entry point
│
├── docs/                                 # Technical documentation
├── tests/                                # Test suite
└── logs/                                 # Structured error logs (JSONL)
```

> [!TIP]
> For the complete directory structure with file-level details, see [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md).

## Documentation

| Document                                            | Description                                                  |
| --------------------------------------------------- | ------------------------------------------------------------ |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md)           | System architecture, service design, and design patterns     |
| [WORKFLOW.md](./docs/WORKFLOW.md)                   | Execution workflow with timing analysis and performance data |
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

## License

MIT License - see [LICENSE](./LICENSE) file for details.
