# Project Structure

A comprehensive overview of the `translate-react` project organization.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Directory Structure Overview](#directory-structure-overview)
- [Key Organization Principles](#key-organization-principles)
  - [1. Service-Oriented Architecture](#1-service-oriented-architecture)
  - [2. Error-First Design](#2-error-first-design)
  - [3. Documentation-Driven Development](#3-documentation-driven-development)
  - [4. Developer Experience Priority](#4-developer-experience-priority)
- [File Type Categories](#file-type-categories)
  - [Configuration Files](#configuration-files)
  - [Service Layer Files](#service-layer-files)
  - [Error Handling Files](#error-handling-files)
- [Quick Navigation](#quick-navigation)
  - [Development Tasks](#development-tasks)
  - [Key Directories](#key-directories)
- [Service Architecture Patterns](#service-architecture-patterns)
  - [Inheritance Hierarchy](#inheritance-hierarchy)
  - [Service Dependencies](#service-dependencies)
- [Benefits of This Structure](#benefits-of-this-structure)

## Directory Structure Overview

```plaintext
translate-react/
├── Project Documentation
│   ├── README.md                             # Main project documentation
│   ├── LICENSE                               # MIT License
│   └── docs/                                 # Technical documentation
│       ├── ARCHITECTURE.md                   # System architecture and service design
│       ├── WORKFLOW.md                       # Execution workflow analysis
│       ├── ERROR_HANDLING.md                 # Error taxonomy and recovery mechanisms
│       ├── TROUBLESHOOTING.md                # Troubleshooting and diagnostics
│       ├── PROJECT_STRUCTURE.md              # This file
│
├── Configuration Files
│   ├── package.json                          # Dependencies, scripts, and metadata
│   ├── tsconfig.json                         # TypeScript compiler configuration
│   ├── bunfig.toml                           # Bun runtime configuration
│   ├── eslint.config.mjs                     # Code linting rules
│   ├── prettier.config.mjs                   # Code formatting configuration
│   ├── .env.example                          # Environment variables template
│   └── .gitignore                            # Git ignore rules
│
├── Application Source
│   └── src/                                  # Main application code
│       ├── main.ts                           # Application entry point
│       ├── build.ts                          # Bun bundler build configuration
│       ├── types.d.ts                        # Global type definitions
│       │
│       ├── errors/                           # Error handling system
│       │   ├── index.ts                      # Error exports
│       │   ├── base.error.ts                 # Base error classes
│       │   ├── errors.ts                     # Specific error implementations
│       │   └── error.helper.ts               # Agnostic Error mapper
│       │
│       ├── locales/                          # Language locale definitions
│       │   ├── index.ts                      # Locale exports
│       │   ├── types.ts                      # Locale type definitions
│       │   └── pt-br.locale.ts               # Portuguese (Brazil) locale
│       │
│       ├── services/                         # Core business logic services
│       │   ├── index.ts                      # Service exports
│       │   ├── service-factory.service.ts    # Dependency injection factory
│       │   ├── comment-builder.service.ts    # PR comment generation
│       │   ├── language-detector.service.ts  # Language detection (CLD)
│       │   ├── translator.service.ts         # LLM translation engine
│       │   │
│       │   ├── cache/                        # Runtime cache services
│       │   │   ├── index.ts
│       │   │   ├── cache.service.ts          # Generic in-memory cache
│       │   │   └── language-cache.service.ts # Language detection cache
│       │   │
│       │   ├── github/                       # GitHub API integration
│       │   │   ├── index.ts
│       │   │   ├── base.service.ts           # Base GitHub service
│       │   │   ├── branch.service.ts         # Branch management
│       │   │   ├── content.service.ts        # Content and PR operations
│       │   │   └── repository.service.ts     # Repository operations
│       │   │
│       │   ├── locale/                       # Locale management
│       │   │   ├── index.ts
│       │   │   └── locale.service.ts         # Locale service
│       │   │
│       │   └── runner/                       # Workflow orchestration
│       │       ├── index.ts
│       │       ├── runner.types.ts           # Runner type definitions
│       │       ├── base.service.ts           # Base runner implementation
│       │       ├── runner.service.ts         # Main workflow orchestrator
│       │       ├── file-discovery.manager.ts # File discovery logic
│       │       ├── translation-batch.manager.ts # Batch processing
│       │       └── pr.manager.ts             # PR creation and management
│       │
│       └── utils/                            # Utility functions and constants
│           ├── index.ts                      # Utility exports
│           ├── constants.util.ts             # Application constants
│           ├── env.util.ts                   # Environment validation (Zod)
│           ├── logger.util.ts                # Pino logger configuration
│           ├── backoff.util.ts               # Exponential backoff utility
│           ├── common.util.ts                # Common utilities
│           ├── rate-limit-detector.util.ts   # Rate limit detection
│           └── setup-signal-handlers.util.ts # Process signal handlers
│
├── Testing Infrastructure
│   └── tests/                                # Test suite
│       ├── setup.ts                          # Test configuration
│       ├── mocks/                            # Mock implementations
│       │   ├── index.ts
│       │   ├── octokit.mock.ts
│       │   ├── openai.mock.ts
│       │   ├── repositories.mock.ts
│       │   └── services.mock.ts
│       ├── errors/                           # Error handling tests
│       │   ├── base.error.spec.ts
│       │   ├── errors.spec.ts
│       │   └── error.helper.spec.ts
│       ├── services/                         # Service tests
│       │   ├── comment-builder.service.spec.ts
│       │   ├── language-detector.service.spec.ts
│       │   ├── service-factory.service.spec.ts
│       │   ├── translator.service.spec.ts
│       │   ├── cache/
│       │   ├── github/
│       │   ├── locale/
│       └── utils/                            # Utility tests
│           ├── backoff.util.spec.ts
│           ├── env.util.spec.ts
│
└── Runtime Artifacts (Auto-generated)
    ├── dist/                                 # Build output directory (gitignored)
    ├── logs/                                 # Structured error logs (JSONL)
    ├── node_modules/                         # Package dependencies
    └── bun.lock                              # Bun lockfile
```

## Key Organization Principles

### 1. Service-Oriented Architecture

- Core business logic organized into specialized services
- Clear separation between GitHub integration, translation, and orchestration
- Inheritance-based service hierarchy with protected access modifiers
- Dependency injection via `ServiceFactory` for testability

### 2. Error-First Design

- Dedicated error handling system with custom error types
- GitHub-specific error mapping for better debugging
- Factory functions for common error scenarios

### 3. Documentation-Driven Development

- Comprehensive technical documentation in `docs/` directory
- Inline JSDoc comments for API documentation

### 4. Developer Experience Priority

- Bun-first runtime (no npm/yarn/pnpm)
- TypeScript with strict type checking
- Comprehensive test coverage with Bun test runner

## File Type Categories

### Configuration Files

| File                  | Purpose                    | Framework/Tool |
| --------------------- | -------------------------- | -------------- |
| `package.json`        | Dependencies and scripts   | Node.js/Bun    |
| `tsconfig.json`       | TypeScript compiler config | TypeScript     |
| `bunfig.toml`         | Bun runtime configuration  | Bun            |
| `eslint.config.mjs`   | Code linting rules         | ESLint         |
| `prettier.config.mjs` | Code formatting rules      | Prettier       |
| `.env.example`        | Environment template       | -              |

### Service Layer Files

| Service                        | Responsibility                  | Dependencies      |
| ------------------------------ | ------------------------------- | ----------------- |
| `runner.service.ts`            | Main workflow orchestration     | All services      |
| `service-factory.service.ts`   | Dependency injection            | All services      |
| `translator.service.ts`        | LLM translation engine          | OpenAI-compatible |
| `language-detector.service.ts` | Language detection and analysis | CLD library       |
| `cache.service.ts`             | Generic in-memory cache         | None              |
| `language-cache.service.ts`    | Language detection cache        | Cache service     |
| `locale.service.ts`            | Locale management               | None              |

### Error Handling Files

| File              | Purpose                 | Pattern  |
| ----------------- | ----------------------- | -------- |
| `base.error.ts`   | Base error class        | Class    |
| `errors.ts`       | Error factory functions | Factory  |
| `error.helper.ts` | Agnostic Error mapping  | Function |

## Quick Navigation

### Development Tasks

| Task        | Command                             |
| ----------- | ----------------------------------- |
| Development | `bun run dev` (watch mode)          |
| Production  | `bun start`                         |
| Build       | `bun run build`                     |
| Lint        | `bun run lint` / `bun run lint:fix` |
| Format      | `bun run format`                    |
| Type Check  | `bun run type-check`                |
| Test        | `bun test`                          |

### Key Directories

| Directory       | Purpose                 |
| --------------- | ----------------------- |
| `src/`          | Application source code |
| `src/services/` | Core business logic     |
| `src/errors/`   | Error handling system   |
| `tests/`        | Test suite              |
| `docs/`         | Technical documentation |

## Service Architecture Patterns

### Inheritance Hierarchy

```plaintext
BaseRunner
└── RunnerService (main orchestrator)
    ├── FileDiscoveryManager
    ├── TranslationBatchManager
    └── PRManager

BaseGitHub
├── RepositoryService (fork sync, tree operations)
├── BranchService (branch lifecycle)
└── ContentService (file operations, PR management)
```

### Service Dependencies

```plaintext
ServiceFactory (creates all services)
└── RunnerService
    ├── RepositoryService
    ├── BranchService
    ├── ContentService
    ├── TranslatorService
    │   └── RateLimiterService
    ├── LanguageDetectorService
    ├── LanguageCacheService
    │   └── CacheService<T>
    └── LocaleService
```

## Benefits of This Structure

1. **Clear Separation**: Services, errors, and utilities are logically organized
2. **Maintainable**: Service-oriented architecture allows for isolated changes
3. **Testable**: Each service can be tested independently
4. **Debuggable**: Comprehensive error handling and logging
5. **Documented**: Technical docs co-located with code
6. **Scalable**: Easy to extend with new services or features
