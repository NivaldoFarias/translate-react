# Project Structure

Overview of the `translate-react` project organization.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Directory Structure](#directory-structure)
- [Key Principles](#key-principles)
- [File Categories](#file-categories)
- [Quick Navigation](#quick-navigation)
- [Service Layout](#service-layout)

## Directory Structure

```plaintext
translate-react/                                                                # Project root
├── docs/                                                                       # Technical documentation
│   ├── ARCHITECTURE.md                                                         # System architecture, service design, and design patterns
│   ├── PROJECT_STRUCTURE.md                                                    # Complete directory structure and navigation guide
│   └── WORKFLOW.md                                                             # Execution workflow with timing analysis and performance data
│
├── src/
│   ├── main.ts                                                                 # Entry point
│   ├── build.ts                                                                # Build script
│   ├── types.d.ts                                                              # TypeScript declarations
│   │
│   ├── clients/
│   │   ├── index.ts                                                            # Barrel export for all clients
│   │   ├── octokit/                                                            # Octokit client constants and implementation
│   │   │   ├── index.ts
│   │   │   ├── octokit.client.ts
│   │   │   └── octokit.constants.ts
│   │   ├── openai.client.ts                                                    # OpenAI client implementation
│   │   └── queue.client.ts                                                     # Queue client implementation
│   │
│   ├── errors/                                                                 # Error handling (ApplicationError, helpers)
│   │   ├── index.ts
│   │   ├── error.ts                                                            # ApplicationError implementation
│   │   └── error.helpers.ts                                                    # Error helpers
│   │
│   ├── locales/                                                                # Language locale definitions
│   │   ├── index.ts                                                            # Barrel export for all locales
│   │   ├── locale.types.ts                                                     # Locale types and interfaces
│   │   ├── pr-body.builder.ts                                                  # Shared PR body template builder
│   │   ├── pt-br.locale.ts                                                     # Portuguese (Brazil) locale definition
│   │   └── ru.locale.ts                                                        # Russian locale definition
│   │
│   ├── services/                                                               # Core services
│   │   ├── index.ts                                                            # Barrel export for all services
│   │   ├── cache/                                                              # In-memory caching service
│   │   │   ├── index.ts
│   │   │   └── cache.service.ts                                                # Cache service implementation
│   │   ├── comment-builder/                                                    # Comment builder service
│   │   │   ├── index.ts
│   │   │   └── comment-builder.service.ts                                      # Comment builder service implementation
│   │   ├── github/                                                             # GitHub API service
│   │   │   ├── index.ts
│   │   │   ├── github.service.ts                                               # GitHub API service implementation
│   │   │   ├── github.types.ts                                                 # GitHub API types
│   │   │   ├── github.repository.ts                                            # GitHub repository service
│   │   │   ├── github.content.ts                                               # GitHub content service
│   │   │   └── github.branch.ts                                                # GitHub branch service
│   │   ├── language-detector/                                                  # Language detector service
│   │   │   ├── index.ts
│   │   │   ├── language-detector.constants.ts                                  # Language detector constants
│   │   │   └── language-detector.service.ts                                    # Language detector service implementation
│   │   ├── locale/                                                             # Locale service
│   │   │   ├── index.ts
│   │   │   └── locale.service.ts                                               # Locale service implementation
│   │   ├── runner/                                                             # Workflow orchestration service
│   │   │   ├── index.ts
│   │   │   ├── runner.types.ts                                                 # Workflow orchestration types
│   │   │   ├── base.service.ts                                                 # Workflow orchestration base service
│   │   │   ├── runner.service.ts                                               # Workflow orchestration service implementation
│   │   │   └── managers/                                                       # Workflow orchestration managers
│   │   │       ├── index.ts
│   │   │       ├── managers.constants.ts                                       # Workflow orchestration managers constants
│   │   │       ├── file-discovery.manager.ts                                   # Workflow orchestration file discovery manager
│   │   │       ├── translation-batch.manager.ts                                # Workflow orchestration translation batch manager
│   │   │       └── pr.manager.ts                                               # Workflow orchestration PR manager
│   │   └── translator/                                                         # LLM translation service
│   │       ├── index.ts
│   │       ├── translator.constants.ts                                         # LLM translation constants
│   │       └── translator.service.ts                                           # LLM translation service implementation
│   │
│   └── utils/                                                                  # Utilities and constants
│       ├── index.ts                                                            # Barrel export for all utils
│       ├── constants.util.ts                                                   # Utilities constants
│       ├── env.util.ts                                                         # Environment utilities
│       ├── logger.util.ts                                                      # Logger utilities
│       └── common.util.ts                                                      # Common utilities
│
├── tests/
│   ├── setup.ts
│   ├── clients/
│   │   └── octokit/
│   │       ├── octokit.client.spec.ts
│   │       └── octokit.constants.spec.ts
│   ├── fixtures/
│   │   ├── index.ts
│   │   ├── data.fixture.ts
│   │   └── error.fixture.ts
│   ├── mocks/
│   │   ├── index.ts
│   │   ├── octokit.mock.ts
│   │   ├── openai.mock.ts
│   │   ├── queue.mock.ts
│   │   ├── repositories.mock.ts
│   │   └── services.mock.ts
│   ├── errors/
│   │   ├── error.spec.ts
│   │   ├── error.helpers.spec.ts
│   │   └── errors.spec.ts
│   ├── services/
│   │   ├── comment-builder.service.spec.ts
│   │   ├── language-detector.service.spec.ts
│   │   ├── translator.service.spec.ts
│   │   ├── cache/
│   │   │   └── cache.service.spec.ts
│   │   ├── github/
│   │   │   ├── github.branch.spec.ts
│   │   │   └── github.service.spec.ts
│   │   ├── locale/
│   │   │   └── locale.service.spec.ts
│   │   └── runner/
│   │       └── runner.service.spec.ts
│   └── utils/
│       ├── common.util.spec.ts
│       ├── constants.util.spec.ts
│       └── env.util.spec.ts
│
├── .github/workflows/                                                          # GitHub Actions workflows
│   ├── ci.yml                                                                  # CI workflow
│   └── workflow.yml                                                            # Translation workflow
├── package.json                                                                # Package dependencies and scripts
├── tsconfig.json                                                               # TypeScript configuration
├── bunfig.toml                                                                 # Bun configuration
├── eslint.config.mjs                                                           # ESLint configuration
├── prettier.config.mjs                                                         # Prettier configuration
├── .env.example                                                                # Environment template
├── .gitignore                                                                  # Git ignore
├── LICENSE                                                                     # License
├── README.md                                                                   # Project README
└── bun.lock                                                                    # Bun lockfile
```

## Key Principles

- **Services**: Business logic in `src/services/`; each service in its own subfolder with `index.ts` barrel export; single **GitHubService** (internally **GitHubRepository**, **GitHubContent**, **GitHubBranch**); **RunnerService** extends **BaseRunnerService** and uses managers in `runner/managers/`.
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

| Directory                                                          | Responsibility                                |
| ------------------------------------------------------------------ | --------------------------------------------- |
| [`runner/`](../src/services/runner/index.ts)                       | Workflow orchestration and manager components |
| [`translator/`](../src/services/translator/index.ts)               | LLM translation with constants                |
| [`language-detector/`](../src/services/language-detector/index.ts) | Language detection with CLD                   |
| [`comment-builder/`](../src/services/comment-builder/index.ts)     | PR comment building                           |
| [`cache/`](../src/services/cache/index.ts)                         | Generic in-memory TTL cache                   |
| [`github/`](../src/services/github/index.ts)                       | GitHub API (single service)                   |
| [`locale/`](../src/services/locale/index.ts)                       | Locale management                             |

### Errors

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

| Directory       | Purpose                 |
| --------------- | ----------------------- |
| `src/`          | Application source      |
| `src/services/` | Business logic          |
| `src/clients/`  | Octokit, OpenAI, queue  |
| `src/errors/`   | Error types and helpers |
| `tests/`        | Test suite              |
| `docs/`         | Documentation           |

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
