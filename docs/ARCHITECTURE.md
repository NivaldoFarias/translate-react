# Architecture Documentation

Overview of the `translate-react` CLI: service design, data flow, and error handling.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [System Overview](#system-overview)
- [Service Architecture](#service-architecture)
- [Core Services](#core-services)
  - [Runner Service](#runner-service)
  - [GitHub Service](#github-service)
  - [Translator Service](#translator-service)
  - [Language Detector Service](#language-detector-service)
  - [Cache Service](#cache-service)
- [Error Handling](#error-handling)
- [Design Patterns](#design-patterns)
- [Dependency Injection](#dependency-injection)
- [Performance Considerations](#performance-considerations)
- [References](#references)

## System Overview

[`main.ts`](../src/app/main.ts) imports `runnerService` from [`composition.ts`](../src/app/composition.ts). **RunnerService** drives GitHub, translator, language detector, and cache (see [WORKFLOW.md](./WORKFLOW.md)). **GitHubService** and **TranslatorService** call the GitHub REST API and the configured LLM endpoint. Errors reach [`handleTopLevelError`](../src/shared/errors/error.helpers.ts) in `main.ts` (Pino, then `process.exit(1)`).

```mermaid
graph TB
    subgraph "Entry Point"
        CLI[CLI / main.ts]
        Comp[composition.ts]
    end

    subgraph "Orchestration Layer"
        Runner[Runner Service]
    end

    subgraph "Domain Services"
        GitHub[GitHub Service]
        Translator[Translator Service]
        LangDetector[Language Detector]
        Cache[Cache Service]
        CommentBuilder[Comment Builder]
    end

    subgraph "Cross-Cutting Concerns"
        ErrorHandler[Top-Level Error Handler]
        Logger[Pino Logger]
    end

    subgraph "External Systems"
        GitHubAPI[GitHub REST API]
        LLMAPI[LLM API<br/>OpenAI/OpenRouter]
    end

    CLI --> Comp
    Comp --> Runner
    Runner --> GitHub
    Runner --> Translator
    Runner --> LangDetector
    Runner --> Cache

    GitHub --> GitHubAPI
    Translator --> LLMAPI
    Translator --> LangDetector

    CLI -.-> ErrorHandler
    ErrorHandler --> Logger

    classDef entryPoint fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef orchestration fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef domain fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef external fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef crossCutting fill:#fce4ec,stroke:#c2185b,stroke-width:2px

    class CLI entryPoint
    class Runner orchestration
    class GitHub,Translator,LangDetector,Cache,CommentBuilder domain
    class GitHubAPI,LLMAPI external
    class ErrorHandler,Logger crossCutting
```

## Service Architecture

A single **GitHubService** exposes all GitHub operations, internally composing three implementation classes:

```mermaid
classDiagram
    class GitHubService {
        -repository: GitHubRepository
        -content: GitHubContent
        -branch: GitHubBranch
    }
    class GitHubRepository {
        +getDefaultBranch()
        +getRepositoryTree()
        +syncFork()
    }
    class GitHubContent {
        +getFileContent()
        +createOrUpdatePullRequest()
        +commitTranslation()
    }
    class GitHubBranch {
        +createOrGetTranslationBranch()
        +cleanupBranch()
    }
    GitHubService *-- GitHubRepository
    GitHubService *-- GitHubContent
    GitHubService *-- GitHubBranch
```

## Core Services

### Runner Service

Code under `src/app/services/runner/`. [`RunnerService.run()`](../src/app/services/runner/runner.service.ts) keeps `RunnerState` in memory and delegates to workflow stages in [`runner/workflow/`](../src/app/services/runner/workflow/) (discovery, batch, PR). Details: [WORKFLOW.md](./WORKFLOW.md).

### Shared workflow types

[`src/app/services/github/types.ts`](../src/app/services/github/types.ts) and [`src/app/locales/types.ts`](../src/app/locales/types.ts) hold cross-cutting DTOs (`ProcessedFileResult`, tree items, PR status, workflow statistics). **GitHub** and **locales** share these modules; they do not import `runner/`.

### GitHub Service

Single public API (`services/github/`) for all GitHub operations. Internally composes three classes:

- **GitHubRepository**: Fork sync, tree fetching (`.md` in `src/`), token verification, translation guidelines retrieval
- **GitHubContent**: Upstream default-branch source reads (`getFile`), PR listing/create/update (with retried PR file lists), commits (branch-tip `sha` before contents API writes), progress-issue comments
- **GitHubBranch**: Translation branch creation (`translate/{file-path}`), cleanup, deletion

Public methods delegate to the appropriate internal class.

### Translator Service

[`TranslatorService`](../src/app/services/translator/translator.service.ts) coordinates translation. Supporting code lives alongside it:

- [`translation-file.ts`](../src/app/services/translator/translation-file.ts) — file entity
- [`pipeline/`](../src/app/services/translator/pipeline/) — validation retry loop
- [`llm/`](../src/app/services/translator/llm/) — prompts, [`TranslationLlmClient`](../src/app/services/translator/llm/translation-llm.client.ts) (OpenAI + retries)
- [`validation/`](../src/app/services/translator/validation/) — post-translation guards
- [`postprocess/`](../src/app/services/translator/postprocess/) — cleanup and chunk reassembly
- [`chunking/`](../src/app/services/translator/chunking/) — token limits and markdown splitting
- [`markdown/`](../src/app/services/translator/markdown/) — frontmatter, fence cleanup, regexes

```mermaid
graph LR
    A[Input] --> B{Optional large-fence mask}
    B --> C{Size Check}
    C -->|under limit| D[Direct Translation]
    C -->|over limit| E[Markdown chunking]
    E --> F[Translate chunks in parallel]
    F --> G[Reassemble]
    D --> H[Restore fences if masked]
    G --> H
    H --> I[Post-translation guards]
    I --> J[Output]
```

**Large-fence masking (optional, env-driven):** Fenced blocks whose tiktoken estimate meets `MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS` can be replaced by short HTML comment placeholders before any LLM call, then restored from the original source so structure and validators still see real fences. Disabled by default; see [`markdown-verbatim-fences.util.ts`](../src/app/utils/markdown-verbatim-fences.util.ts).

**Content chunking** (when input exceeds the safe token budget in [`ChunksManager`](../src/app/services/translator/chunking/chunks.manager.ts)): LangChain `MarkdownTextSplitter`, then parallel chunk translation and reassembly (`CHUNKS` in [`chunking.constants.ts`](../src/app/services/translator/chunking/chunking.constants.ts)).

**Post-translation validation:** Guards in `validation/guards/`; failures feed retry hints through `TranslationPipelineManager`.

**Translation guidelines**: Loaded from upstream `GLOSSARY.md`, passed to LLM as system instruction.

### Language Detector Service

Statistical language detection (`services/language-detector/language-detector.service.ts`) using Compact Language Detector (CLD).

**Detection Flow:**

1. Check content length (skip if below minimum)
2. Run CLD detection
3. Verify reliability and confidence (> 80%)
4. Calculate translation ratio: `targetScore / (targetScore + sourceScore)`
5. Mark as translated if `ratio > 0.5`

This ratio-based approach handles mixed-language content (code examples, technical terms) better than binary detection.

### Cache Service

In-memory caching (`services/cache/`) for runtime-scoped data.

- **CacheService**: Generic TTL cache with O(1) lookups, batch operations, composite key support (`filename:contentHash`)

## Error Handling

**ApplicationError** covers domain workflow failures (empty file, validation exhausted, and similar). It carries `ErrorCode`, an operation name, and optional metadata. Inner code rethrows `ApplicationError` unchanged; Octokit and OpenAI errors usually bubble to the boundary.

**Top-level handler** (`main.ts` via `handleTopLevelError`):

- **ApplicationError**: logs code, operation, message, metadata
- **RequestError** (Octokit): logs as GitHub API error with status, request ID
- **APIError** (OpenAI): logs as LLM API error with status, type
- Other errors: logs message and stack

All errors result in `process.exit(1)`.

## Design Patterns

- **Runner**: `BaseRunnerService` holds state and workflow-stage helpers; `RunnerService` implements `run()`
- **GitHub**: `GitHubService` composes repository, content, and branch helpers behind one facade
- **Translator**: `TranslatorService` orchestrates; `TranslationLlmClient` owns transport; guards are pluggable under `validation/guards/`

## Dependency Injection

[`composition.ts`](../src/app/composition.ts) wires service singletons. `main.ts` imports `runnerService` from there. Dependencies are passed via typed constructor arguments. Tests inject mocks via constructors:

```typescript
const service = new RunnerService({
	github: createMockGitHubService(),
	translator: createMockTranslatorService(),
});
```

Mock factories live in `tests/mocks/`.

## Performance Considerations

**Batch Processing**: Configurable batch size balances throughput, resource usage, and error isolation.

**Parallelization Strategy**:

| Operation             | Strategy                     |
| --------------------- | ---------------------------- |
| File content fetching | Batch of 10 concurrent       |
| Language detection    | Sequential (CPU-bound)       |
| Translation           | Sequential (rate-limited)    |
| PR creation           | Sequential (avoid conflicts) |

**Memory**: Streaming content processing, GC after each batch, lazy translation guidelines loading.

## References

- [WORKFLOW.md](./WORKFLOW.md) — Call order, stages, forks, releases
- [README.md](../README.md) — Install, env tables, troubleshooting
