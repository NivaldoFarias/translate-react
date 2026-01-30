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
translate-react/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── PROJECT_STRUCTURE.md
│   ├── roadmap.md
│   ├── TROUBLESHOOTING.md
│   └── WORKFLOW.md
│
├── src/
│   ├── main.ts
│   ├── build.ts
│   ├── types.d.ts
│   │
│   ├── clients/
│   │   ├── index.ts
│   │   ├── octokit.client.ts
│   │   ├── openai.client.ts
│   │   └── queue.client.ts
│   │
│   ├── errors/
│   │   ├── index.ts
│   │   ├── error.ts
│   │   └── error.helpers.ts
│   │
│   ├── locales/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   └── pt-br.locale.ts
│   │
│   ├── services/
│   │   ├── index.ts
│   │   ├── comment-builder.service.ts
│   │   ├── language-detector.service.ts
│   │   ├── translator.service.ts
│   │   ├── cache/
│   │   │   ├── index.ts
│   │   │   ├── cache.service.ts
│   │   │   └── language-cache.service.ts
│   │   ├── github/
│   │   │   ├── index.ts
│   │   │   ├── github.service.ts
│   │   │   ├── github.types.ts
│   │   │   ├── github.repository.ts
│   │   │   ├── github.content.ts
│   │   │   └── github.branch.ts
│   │   ├── locale/
│   │   │   ├── index.ts
│   │   │   └── locale.service.ts
│   │   └── runner/
│   │       ├── index.ts
│   │       ├── runner.types.ts
│   │       ├── base.service.ts
│   │       ├── runner.service.ts
│   │       ├── file-discovery.manager.ts
│   │       ├── translation-batch.manager.ts
│   │       └── pr.manager.ts
│   │
│   └── utils/
│       ├── index.ts
│       ├── constants.util.ts
│       ├── env.util.ts
│       ├── logger.util.ts
│       └── common.util.ts
│
├── tests/
│   ├── setup.ts
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
│   │   ├── github/
│   │   ├── locale/
│   │   └── runner/
│   └── utils/
│       ├── common.util.spec.ts
│       ├── constants.util.spec.ts
│       └── env.util.spec.ts
│
├── .github/workflows/
├── package.json
├── tsconfig.json
├── bunfig.toml
├── eslint.config.mjs
├── prettier.config.mjs
├── .env.example
├── .gitignore
├── LICENSE
├── README.md
└── bun.lock
```

## Key Principles

- **Services**: Business logic in `src/services/`; single **GitHubService** (internally **GitHubRepository**, **GitHubContent**, **GitHubBranch**); **RunnerService** extends **BaseRunnerService** and uses managers.
- **Errors**: **ApplicationError** and **ErrorCode** in `src/errors/`; top-level handler in `main.ts`; library errors bubble up.
- **DI**: Module-level singletons; dependencies injected via constructors (e.g. **RunnerServiceDependencies**); tests use mocks from `tests/mocks/`.
- **Runtime**: Bun (package manager and runtime). TypeScript, ESLint, Prettier.

## File Categories

### Configuration

| File                  | Purpose                  |
| --------------------- | ------------------------ |
| `package.json`        | Dependencies and scripts |
| `tsconfig.json`       | TypeScript config        |
| `bunfig.toml`         | Bun config               |
| `eslint.config.mjs`   | ESLint rules             |
| `prettier.config.mjs` | Prettier config          |
| `.env.example`        | Environment template     |

### Services

| File / Dir                     | Responsibility              |
| ------------------------------ | --------------------------- |
| `runner.service.ts`            | Workflow orchestration      |
| `translator.service.ts`        | LLM translation             |
| `language-detector.service.ts` | Language detection          |
| `comment-builder.service.ts`   | PR comment building         |
| `cache/`                       | Generic and language cache  |
| `github/`                      | GitHub API (single service) |
| `locale/`                      | Locale management           |

### Errors

| File               | Purpose                       |
| ------------------ | ----------------------------- |
| `error.ts`         | ApplicationError, ErrorCode   |
| `error.helpers.ts` | mapError, handleTopLevelError |

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
├── LanguageCacheService → CacheService
├── LocaleService
├── FileDiscoveryManager
├── TranslationBatchManager
└── PRManager
```

Services are created at module level; **main.ts** imports **runnerService** from `./services`.
