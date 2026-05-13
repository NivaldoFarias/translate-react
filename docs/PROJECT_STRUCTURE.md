# Project Structure

Overview of the `translate-react` project layout. The tree below lists **directories only**; root config files and module filenames are covered in [File Categories](#file-categories) and the linked source trees.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Directory Structure](#directory-structure)
- [Key Principles](#key-principles)
- [File Categories](#file-categories)
  - [Configuration](#configuration)
  - [Services](#services)
  - [Errors](#errors)
- [Quick Navigation](#quick-navigation)
- [Service Layout](#service-layout)

## Directory Structure

```plaintext
translate-react/                          # Repository root
├── docs/                                 # Technical documentation
├── src/                                  # Application source (entry `main.ts`, build `build.ts`)
│   ├── clients/                          # External API clients
│   │   └── octokit/                      # Octokit client and constants
│   ├── errors/                           # Application errors and helpers
│   ├── locales/                          # Locale definitions and PR body templates
│   ├── services/                         # Business logic (one folder per service)
│   │   ├── cache/
│   │   ├── comment-builder/
│   │   ├── github/
│   │   ├── language-detector/
│   │   ├── locale/
│   │   ├── runner/
│   │   │   └── managers/                 # File discovery, batches, PR workflow
│   │   └── translator/
│   │       └── managers/                 # Chunking and translation validation
│   └── utils/                            # Env, logger, constants, shared helpers
├── tests/                                # Unit tests (layout mirrors `src/` where used)
│   ├── clients/
│   │   └── octokit/
│   ├── errors/
│   ├── fixtures/
│   ├── mocks/
│   ├── services/
│   │   ├── cache/
│   │   ├── github/
│   │   ├── locale/
│   │   └── runner/
│   └── utils/
└── .github/
    └── workflows/                        # CI and translation automation
```

## Key Principles

- **Services**: Business logic in `src/services/`; each service in its own subfolder with `index.ts` barrel export; single **GitHubService** (internally **GitHubRepository**, **GitHubContent**, **GitHubBranch**); **RunnerService** extends **BaseRunnerService** and uses managers in `runner/managers/`; **TranslatorService** uses chunking and validation managers in `translator/managers/` and optional large-fence masking from `src/utils/markdown-verbatim-fences.util.ts`.
- **Clients**: External API clients in `src/clients/`; **Octokit** client in dedicated subfolder with constants.
- **Errors**: **ApplicationError** and **ErrorCode** in `src/errors/`; top-level handler in `main.ts`; library errors bubble up.
- **DI**: Module-level singletons; dependencies injected via constructors (e.g. **RunnerServiceDependencies**); tests use mocks from `tests/mocks/`.
- **Runtime**: Bun (package manager and runtime). TypeScript, ESLint, Prettier.

## File Categories

### Configuration

| File                                            | Purpose                  |
| ----------------------------------------------- | ------------------------ |
| [`package.json`](../package.json)               | Dependencies and scripts |
| [`tsconfig.json`](../tsconfig.json)             | TypeScript config        |
| [`bunfig.toml`](../bunfig.toml)                 | Bun config               |
| [`eslint.config.mjs`](../eslint.config.mjs)     | ESLint rules             |
| [`prettier.config.mjs`](../prettier.config.mjs) | Prettier config          |
| [`.env.example`](../.env.example)               | Environment template     |

### Services

| Directory                                                          | Responsibility                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [`runner/`](../src/services/runner/index.ts)                       | Workflow orchestration and manager components                      |
| [`translator/`](../src/services/translator/index.ts)               | LLM translation; chunking and validation in `translator/managers/` |
| [`language-detector/`](../src/services/language-detector/index.ts) | Language detection with CLD                                        |
| [`comment-builder/`](../src/services/comment-builder/index.ts)     | PR comment building                                                |
| [`cache/`](../src/services/cache/index.ts)                         | Generic in-memory TTL cache                                        |
| [`github/`](../src/services/github/index.ts)                       | GitHub API (single service)                                        |
| [`locale/`](../src/services/locale/index.ts)                       | Locale management                                                  |

### Errors

Paths are under [`src/errors/`](../src/errors/).

| File               | Purpose                     |
| ------------------ | --------------------------- |
| `error.ts`         | ApplicationError, ErrorCode |
| `error.helpers.ts` | handleTopLevelError         |

## Quick Navigation

| Task        | Command              |
| ----------- | -------------------- |
| Development | `bun run dev`        |
| Run         | `bun run start`      |
| Build       | `bun run build`      |
| Lint        | `bun run lint`       |
| Type check  | `bun run type-check` |
| Test        | `bun run test`       |

| Directory            | Purpose                          |
| -------------------- | -------------------------------- |
| `src/`               | Application source               |
| `src/services/`      | Business logic                   |
| `src/clients/`       | Octokit, OpenAI, queue           |
| `src/errors/`        | Error types and helpers          |
| `src/locales/`       | Locale data and PR body builders |
| `src/utils/`         | Env, logger, constants, helpers  |
| `tests/`             | Unit tests and mocks             |
| `docs/`              | Technical documentation          |
| `.github/workflows/` | GitHub Actions workflows         |

## Service Layout

```plaintext
RunnerService (extends BaseRunnerService)
├── GitHubService (composes GitHubRepository, GitHubContent, GitHubBranch)
├── TranslatorService
├── LanguageDetectorService
├── CacheService
├── LocaleService
├── CommentBuilderService
└── managers/
    ├── FileDiscoveryManager
    ├── TranslationBatchManager
    └── PRManager
```

Services are created at module level; `main.ts` imports `runnerService` from [`src/services/`](../src/services/index.ts).
