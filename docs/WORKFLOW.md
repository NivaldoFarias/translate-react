# Workflow Execution Documentation

Detailed breakdown of the translation workflow: execution stages, data flow, and error recovery.

## Table of Contents

- [Overview](#overview)
- [Execution Stages](#execution-stages)
- [Data Flow Diagrams](#data-flow-diagrams)
- [Data Structures](#data-structures)
- [Error Recovery](#error-recovery)
- [References](#references)

## Overview

The translation workflow executes in **six primary stages**, each with specific responsibilities and performance characteristics.

```mermaid
flowchart TD
    A[1. Initialization] --> B[2. Repository Setup]
    B --> C[3. Content Discovery]
    C --> D[4. File Filtering]
    D --> E[5. Batch Translation]
    E --> F[6. Progress Reporting]

    B -->|Fork Out of Sync| B1[Sync Fork]
    B1 --> C

    C -->|Snapshot Available| C1[Load from Cache]
    C1 --> D

    E -->|Per File| E1[Create Branch]
    E1 --> E2[Translate]
    E2 --> E3[Commit]
    E3 --> E4[Create PR]

    E -->|On Error| E5[Cleanup & Log]
    E5 --> E

    F --> G[Complete]

    classDef stage fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef subprocess fill:#f3e5f5,stroke:#7b1fa2,stroke-width:1px
    classDef error fill:#ffebee,stroke:#d32f2f,stroke-width:1px

    class A,B,C,D,E,F stage
    class B1,C1,E1,E2,E3,E4 subprocess
    class E5 error
```

## Execution Stages

The workflow executes in six stages. Each stage has specific responsibilities and failure modes.

### Stage 1: Initialization

Validates environment, instantiates services, registers signal handlers.

**Operations:** Zod schema validation → Pino logger init → Service instantiation (GitHub, Translator, Locale, Language Detector, Cache) → Signal handlers (SIGINT, SIGTERM)

### Stage 2: Repository Setup

Verifies GitHub token permissions and synchronizes fork with upstream.

```mermaid
flowchart LR
    A[Verify Token] --> B{Valid?}
    B -->|No| C[Error]
    B -->|Yes| D{Fork Synced?}
    D -->|Yes| E[Continue]
    D -->|No| F[Sync Fork] --> E
```

**Operations:** `verifyTokenPermissions` → `isForkSynced` → `syncFork` (if needed)

### Stage 3: Content Discovery

Fetches repository tree and glossary, filters for markdown files in `src/`.

```mermaid
flowchart LR
    A[Fetch Tree] --> B[Filter .md in src/]
    B --> C[Fetch Glossary]
    C --> D[Discovery Complete]
```

**Filter criteria:** `.md` extension + `src/` directory + has path and SHA

### Stage 4: File Filtering

Multi-step pipeline to minimize unnecessary translations.

```mermaid
flowchart LR
    A[Candidates] --> B[Batch Fetch Content]
    B --> C{Has Open PR?}
    C -->|Yes| D[Skip]
    C -->|No| E{Already Translated?}
    E -->|Yes| D
    E -->|No| F[Add to Queue]
```

**Pipeline:** Cache check → Open PR filter → Content fetch (batched) → Language detection

### Stage 5: Batch Translation

Processes queued files: branch creation → translation → commit → PR.

```mermaid
stateDiagram-v2
    [*] --> BranchCheck
    BranchCheck --> CreateBranch : missing
    BranchCheck --> Translate : exists
    CreateBranch --> Translate
    Translate --> Commit : valid
    Translate --> Cleanup : error
    Commit --> CreatePR
    CreatePR --> [*]
    Cleanup --> [*]
```

**Operations:**

- Branch: `createOrGetTranslationBranch` (reuses existing or creates new)
- Translate: Direct or chunked based on token threshold (`MAX_CHUNK_TOKENS`)
- Commit: `commitTranslation` → `createOrUpdatePullRequest`
- Error: `cleanupFailedTranslation`, circuit-breaker at `MAX_CONSECUTIVE_FAILURES`

### Stage 6: Progress Reporting

Posts summary to progress issue (non-blocking), prints final statistics.

**Operations:** `commentCompiledResultsOnIssue` (if issue found) → `printFinalStatistics` → cleanup → exit

## Data Flow Diagrams

### Discovery Phase

```mermaid
flowchart TD
    A[Start] --> B[Fetch Repository Tree]
    B --> C[Filter .md in src/]
    C --> D[Batch by 10]
    D --> E[Fetch Content]
    E --> F{Has Open PR?}
    F -->|Yes| G[Skip]
    F -->|No| H{Already Translated?}
    H -->|Yes| G
    H -->|No| I[Add to Queue]
    G --> J[Discovery Complete]
    I --> J
```

### Translation Phase

```mermaid
flowchart TD
    A[Translation Queue] --> B[For Each File]
    B --> C[Create/Get Branch]
    C --> D{Size > Threshold?}
    D -->|Yes| E[Chunked Translation]
    D -->|No| F[Direct Translation]
    E --> G[Reassemble]
    F --> H[Validate]
    G --> H
    H -->|Valid| I[Commit & Create PR]
    H -->|Invalid| J[Cleanup Branch]
    I --> K[Update Progress]
    J --> K
    K --> L{More Files?}
    L -->|Yes| B
    L -->|No| M[Complete]
```

## Data Structures

| Structure             | Purpose                        | Key Fields                                                            |
| --------------------- | ------------------------------ | --------------------------------------------------------------------- |
| `TranslationFile`     | File candidate for translation | `content`, `filename`, `path`, `sha`                                  |
| `ProcessedFileResult` | Processing outcome per file    | `filename`, `branch`, `translation`, `pullRequest`, `error`           |
| `RunnerState`         | Workflow state (in-memory)     | `repositoryTree`, `filesToTranslate`, `processedResults`, `timestamp` |

See [`services/runner/runner.types.ts`](../src/services/runner/runner.types.ts) for type definitions.

## Error Recovery

```mermaid
flowchart TD
    A[Error] --> B{Severity}
    B -->|Warning| C[Log & Continue]
    B -->|Error| D[Cleanup]
    B -->|Fatal| E[Abort]
    D --> F[Delete Branch/Close PR]
    F --> G{Retry?}
    G -->|Yes| H[Retry Queue]
    G -->|No| I[Log Failure]
    H --> J[Next File]
    I --> J
    C --> J
    E --> K[Exit]
```

**Error handling strategy:**

- **Warning**: Log and continue to next file
- **Error**: Cleanup resources (branch/PR), mark failed, continue
- **Fatal**: Log error, abort workflow, exit process
- **Circuit breaker**: After `MAX_CONSECUTIVE_FAILURES`, workflow terminates early

## References

- [Architecture Documentation](./ARCHITECTURE.md) — Service design and patterns
- [Project README](../README.md) — High-level overview
