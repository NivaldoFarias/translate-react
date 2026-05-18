# translate-react

<div align="center">

[![CI Status](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/NivaldoFarias/translate-react/actions/workflows/ci.yml)

</div>

CLI tool that translates the official React documentation via LLMs, keeps structure intact, and opens PRs through the [`translate-react` bot](https://github.com/apps/translate-react-bot).

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [GitHub Actions on a fork](#github-actions-on-a-fork)
- [Configuration](#configuration)
  - [Required Environment Variables](#required-environment-variables)
  - [Optional Environment Variables](#optional-environment-variables)
- [Usage](#usage)
- [Versioning and releases](#versioning-and-releases)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Debug Mode](#debug-mode)
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
5. Configure Environment: `cp .env.example .env`
   - Then, edit `.env` with your API keys _(see [Configuration section](#configuration))_
6. Run in Development Mode: `bun run dev`

> [!TIP]
> For a more detailed workflow explanation, see [`WORKFLOW.md`](./docs/WORKFLOW.md).

## GitHub Actions on a fork

Enable Actions on the repo that holds the workflow, install the bot, and set the secrets and variables listed under [Operating translate-react (forks)](./docs/WORKFLOW.md#operating-translate-react-forks) (see [`.github/workflows/workflow.yml`](./.github/workflows/workflow.yml)). Pinning: [Pinning translate-react in GitHub Actions](./docs/WORKFLOW.md#pinning-translate-react-in-github-actions).

## Configuration

Environment variables are validated at runtime using Zod schemas. See [`src/utils/env.util.ts`](./src/utils/env.util.ts) for complete schema definitions and validation rules.

### Required Environment Variables

These **must** be set in your `.env` file (or in the GitHub Actions environment variables):

| Variable      | Description                                                |
| ------------- | ---------------------------------------------------------- |
| `GH_TOKEN`    | GitHub Personal Access Token with `repo` scope             |
| `LLM_API_KEY` | API key for LLM service (OpenAI, OpenRouter, Azure OpenAI) |

### Optional Environment Variables

> [!IMPORTANT]
> All optional variables have defaults defined in [`src/utils/constants.util.ts`](./src/utils/constants.util.ts).

<details>
<summary><b>GitHub Configuration</b></summary>

| Variable              | Default           | Description                                               |
| --------------------- | ----------------- | --------------------------------------------------------- |
| `REPO_FORK_OWNER`     | `nivaldofarias`   | Fork owner username/organization                          |
| `REPO_FORK_NAME`      | `pt-br.react.dev` | Fork repository name                                      |
| `REPO_UPSTREAM_OWNER` | `reactjs`         | Upstream owner username/organization[^repo-upstream-test] |
| `REPO_UPSTREAM_NAME`  | `pt-br.react.dev` | Upstream repository name                                  |
| `GH_REQUEST_TIMEOUT`  | `30000`           | GitHub API timeout (milliseconds)                         |
| `GH_PAT_TOKEN`        | —                 | Fallback PAT for 403 errors[^gh-pat-token]                |

</details>

<details>
<summary><b>LLM Configuration</b></summary>

| Variable             | Default                                    | Description                                    |
| -------------------- | ------------------------------------------ | ---------------------------------------------- |
| `LLM_MODEL`          | `google/gemini-2.0-flash-exp:free`         | Model ID for translation                       |
| `LLM_API_BASE_URL`   | `https://openrouter.ai/api/v1`             | LLM API endpoint                               |
| `OPENAI_PROJECT_ID`  | —                                          | Optional: OpenAI project ID for tracking       |
| `MAX_TOKENS`         | `8192`                                     | Maximum tokens per LLM response                |
| `HEADER_APP_URL`     | `package.json` field `homepage`            | App URL for OpenRouter `HTTP-Referer` tracking |
| `HEADER_APP_TITLE`   | `package.json` fields `name` and `version` | App title for OpenRouter `X-Title`             |
| `MAX_RETRY_ATTEMPTS` | `3`                                        | Maximum number of retries for LLM API requests |

</details>

<details>
<summary><b>Translation Settings</b></summary>

| Variable                                | Default | Description                                                                                                                                                                                   |
| --------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TARGET_LANGUAGE`                       | `pt-br` | React locale for translated output; in Actions, `workflow.yml` sets this from `matrix.lang`                                                                                                   |
| `SOURCE_LANGUAGE`                       | `en`    | Source locale for detection labels; React English docs — default `en`, omit in CI                                                                                                             |
| `BATCH_SIZE`                            | `1`     | Files to process in parallel                                                                                                                                                                  |
| `MASK_VERBATIM_LARGE_FENCES`            | `false` | When `true`, very large fenced code blocks are sent as short HTML placeholders to the LLM and restored afterward (saves tokens; prose **inside** those fences is not translated while masked) |
| `MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS` | `120`   | Tiktoken-based threshold (same estimator as chunking) for treating a fence as verbatim when masking is enabled                                                                                |

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

## Versioning and releases

`package.json` `version` is the semver source; OpenRouter header defaults pull from `homepage`, `name`, and `version` unless overridden ([optional env](#optional-environment-variables)). Change log: [`CHANGELOG.md`](./CHANGELOG.md). Tag and release steps: [Releases and semantic versioning](./docs/WORKFLOW.md#releases-and-semantic-versioning).

## Documentation

| Document                                            | Description                         |
| --------------------------------------------------- | ----------------------------------- |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md)           | Layout of services and modules      |
| [WORKFLOW.md](./docs/WORKFLOW.md)                   | Pipeline order, forks, releases, CI |
| [PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) | Repository layout                   |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                | Patches and conventions             |
| [CHANGELOG.md](./CHANGELOG.md)                      | Release notes                       |
| [SECURITY.md](./SECURITY.md)                        | Vulnerability reporting             |

## Contributing

[`CONTRIBUTING.md`](./CONTRIBUTING.md); for service layout see [ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Security

[`SECURITY.md`](./SECURITY.md)

## Troubleshooting

### Common Issues

| Error                                                   | Solution                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `GH_TOKEN: String must contain at least 1 character(s)` | Set `GH_TOKEN` and `LLM_API_KEY` in `.env`                         |
| GitHub API error (`404` / `403` / `429`)                | Verify repository and token scope; tool auto-retries on rate limit |
| LLM API error (quota / rate limit)                      | Check API credits; switch providers via `LLM_API_BASE_URL`         |

### Debug Mode

Enable verbose logging: `LOG_LEVEL="debug" bun run dev`

## License

MIT License - see [LICENSE](./LICENSE) file for details.

---

[^gh-pat-token]: Optional fallback token for permission-related failures. When the primary `GH_TOKEN` receives a `403` (`Forbidden`) error, the client automatically retries with this PAT. Useful when GitHub App tokens have different permission scopes than PATs for certain operations.

[^repo-upstream-test]: For dry runs, set to your GitHub username in `.env` or repository variable `REPO_UPSTREAM_OWNER` so PRs open against your fork; the translation workflow applies this to every matrix locale (see `.github/workflows/workflow.yml`).
