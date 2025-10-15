# Project Structure

A comprehensive overview of the translate-react project organization, designed for maintainability and developer understanding.

## Directory Structure Overview

```plaintext
translate-react/
├── Project Documentation
│   ├── README.md                             # Main project documentation
│   ├── LICENSE                               # MIT License
│   └── docs/                                 # Technical documentation
│       ├── README.md                         # Documentation entrypoint
│       ├── ARCHITECTURE.md                   # System architecture and service design
│       ├── WORKFLOW.md                       # Execution workflow and timing analysis
│       ├── ERROR_HANDLING.md                 # Error taxonomy and recovery mechanisms
│       ├── DEBUGGING.md                      # Troubleshooting and diagnostics
│       ├── PROJECT_STRUCTURE.md              # This file - project structure overview
│
├── Configuration Files
│   ├── package.json                          # Dependencies, scripts, and metadata
│   ├── tsconfig.json                         # TypeScript compiler configuration
│   ├── bunfig.toml                           # Bun runtime configuration
│   ├── eslint.config.mjs                     # Code linting rules
│   ├── prettier.config.mjs                   # Code formatting configuration
│   ├── .env.example                          # Environment variables template
│   ├── .env                                  # Local environment variables (gitignored)
│   ├── .env.dev                              # Development environment (gitignored)
│   └── .gitignore                            # Git ignore rules
│
├── Application Source
│   └── src/                                  # Main application code
│       ├── index.ts                          # Application entry point
│       ├── types.d.ts                        # Global type definitions
│       │
│       ├── errors/                           # Error handling system
│       │   ├── index.ts                      # Error exports
│       │   ├── base-error.ts                 # Base error classes
│       │   ├── errors.ts                     # Specific error implementations
│       │   └── helpers/                      # Error helper utilities
│       │       ├── index.ts
│       │       ├── error.helper.ts           # General error utilities
│       │       ├── github-error.helper.ts    # GitHub error mapping
│       │       └── llm-error.helper.ts       # LLM error handling
│       │
│       ├── services/                         # Core business logic services
│       │   ├── comment-builder.service.ts    # PR comment generation
│       │   ├── database.service.ts           # SQLite state persistence
│       │   ├── language-detector.service.ts  # Language detection (CLD)
│       │   ├── snapshot.service.ts           # Snapshot management
│       │   ├── translator.service.ts         # LLM translation engine
│       │   │
│       │   ├── github/                       # GitHub API integration
│       │   │   ├── base.service.ts           # Base GitHub service
│       │   │   ├── branch.service.ts         # Branch management
│       │   │   ├── content.service.ts        # Content and PR operations
│       │   │   ├── github.service.ts         # Main GitHub orchestrator
│       │   │   └── repository.service.ts     # Repository operations
│       │   │
│       │   └── runner/                       # Workflow orchestration
│       │       ├── base.service.ts           # Base runner implementation
│       │       └── runner.service.ts         # Main workflow orchestrator
│       │
│       └── utils/                            # Utility functions and constants
│           ├── index.ts                      # Utility exports
│           ├── constants.util.ts             # Application constants
│           ├── env.util.ts                   # Environment validation (Zod)
│           ├── logger.util.ts                # Pino logger configuration
│           ├── rate-limit-detector.util.ts   # Rate limit detection
│           └── setup-signal-handlers.util.ts # Process signal handlers
│
├── Testing Infrastructure
│   └── tests/                                      # Test suite
│       ├── setup.ts                                # Test configuration
│       ├── errors/                                 # Error handling tests
│       ├── services/                               # Service tests
│       │   ├── comment-builder.service.spec.ts  
│       │   ├── database.service.spec.ts
│       │   ├── language-detector.service.spec.ts
│       │   ├── snapshot.service.spec.ts
│       │   ├── translator.service.spec.ts
│       │   └── github/                             # GitHub service tests
│       │       ├── base.service.spec.ts
│       │       ├── branch.service.spec.ts
│       │       └── content.service.spec.ts
│       └── utils/                                  # Utility tests
│           └── env.util.spec.ts
│
└── Runtime Artifacts (Auto-generated)
    ├── logs/                              # Structured error logs (JSONL)
    ├── snapshots.sqlite                   # SQLite state persistence database
    ├── node_modules/                      # Package dependencies
    └── bun.lockb                          # Bun lockfile
```

## Key Organization Principles

### 1. Service-Oriented Architecture

- Core business logic organized into specialized services
- Clear separation between GitHub integration, translation, and orchestration
- Inheritance-based service hierarchy with protected access modifiers

### 2. Error-First Design

- Dedicated error handling system with custom error types
- GitHub-specific error mapping for better debugging
- Proxy pattern for automatic error wrapping and context enrichment

### 3. Documentation-Driven Development

- Comprehensive technical documentation in `docs/` directory
- Inline JSDoc comments following project standards
- Instruction files for coding conventions and standards

### 4. Developer Experience Priority

- Bun-first runtime (no npm/yarn/pnpm)
- TypeScript with strict type checking
- Comprehensive test coverage with Bun test runner
- Diagnostic scripts for debugging and troubleshooting

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
| `github.service.ts`            | GitHub API integration          | Octokit REST API  |
| `translator.service.ts`        | LLM translation engine          | OpenAI-compatible |
| `language-detector.service.ts` | Language detection and analysis | CLD library       |
| `database.service.ts`          | SQLite state persistence        | SQLite3           |
| `snapshot.service.ts`          | Snapshot management             | Database service  |

### Error Handling Files

| File                     | Purpose                        | Pattern  |
| ------------------------ | ------------------------------ | -------- |
| `base-error.ts`          | Base error classes             | Class    |
| `errors.ts`              | Specific error implementations | Class    |
| `error.helper.ts`        | Error utilities                | Function |
| `github-error.helper.ts` | GitHub error mapping           | Function |
| `llm-error.helper.ts`    | LLM error handling             | Function |

## Quick Navigation

### Development Tasks

- **Start development**: `bun run dev` (watch mode)
- **Run production**: `bun start`
- **Linting**: `bun run lint` / `bun run lint:fix`
- **Formatting**: `bun run format`
- **Type checking**: `bun run type-check`
- **Testing**: `bun test`

### Documentation

- **Architecture**: `docs/ARCHITECTURE.md`
- **Workflow**: `docs/WORKFLOW.md`
- **Error Handling**: `docs/ERROR_HANDLING.md`
- **Debugging**: `docs/DEBUGGING.md`
- **Main README**: `README.md`

### Key Directories

- **Application logic**: `src/`
- **Services**: `src/services/`
- **Error handling**: `src/errors/`
- **Tests**: `tests/`
- **Scripts**: `scripts/`
- **Documentation**: `docs/`

## Service Architecture Patterns

### Inheritance Hierarchy

```plaintext
BaseRunner
└── RunnerService (main orchestrator)

BaseGitHub
├── RepositoryService (fork sync, tree operations)
├── BranchService (branch lifecycle)
├── ContentService (file operations, PR management)
└── GitHubService (main GitHub orchestrator)
```

### Service Dependencies

```plaintext
RunnerService
├── GitHubService
│   ├── RepositoryService
│   ├── BranchService
│   └── ContentService
├── TranslatorService
├── LanguageDetectorService
├── DatabaseService
└── SnapshotService
    └── DatabaseService
```

### Error Handling Flow

```plaintext
Service Method
└── Try-Catch Block
    └── Error Helper
        ├── Transform to Custom Error
        ├── Add Context
        ├── Map HTTP Status (GitHub)
        └── Throw Enhanced Error
```

## Benefits of This Structure

1. **Clear Separation**: Services, errors, and utilities are logically organized
2. **Maintainable**: Service-oriented architecture allows for isolated changes
3. **Testable**: Each service can be tested independently
4. **Debuggable**: Comprehensive error handling and logging
5. **Documented**: Technical docs co-located with code
6. **Scalable**: Easy to extend with new services or features

## Development Workflow

### Adding a New Feature

1. Create service in `src/services/` (if needed)
2. Add error types in `src/errors/errors.ts` (if needed)
3. Write tests in `tests/services/`
4. Update documentation in `docs/`
5. Add environment variables to `env.util.ts` (if needed)

### Debugging Workflow

1. Check error logs in `logs/` directory
3. Enable debug mode with `LOG_LEVEL=debug`
4. Consult `docs/DEBUGGING.md` for common issues
5. Analyze snapshots in `snapshots.sqlite`

### Testing Workflow

1. Write tests following `testing.instructions.md`
2. Run tests with `bun test`
3. Check coverage (if enabled)
4. Use test scripts in `scripts/` for integration testing
5. Follow TDD principles for new features
