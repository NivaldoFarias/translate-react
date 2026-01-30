# Workflow Execution Documentation

This document provides a detailed breakdown of the translation workflow execution, including timing analysis, data flow, and stage-specific operations.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Overview](#overview)
- [Execution Stages](#execution-stages)
  - [Stage 1: Initialization](#stage-1-initialization)
    - [Description](#description)
    - [Workflow](#workflow)
    - [Key Operations](#key-operations)
  - [Stage 2: Repository Setup](#stage-2-repository-setup)
    - [Description](#description-1)
    - [Workflow](#workflow-1)
    - [Key Operations](#key-operations-1)
  - [Stage 3: Content Discovery](#stage-3-content-discovery)
    - [Description](#description-2)
    - [Workflow](#workflow-2)
    - [Key Operations](#key-operations-2)
  - [Stage 4: File Filtering](#stage-4-file-filtering)
    - [Description](#description-3)
    - [Workflow](#workflow-3)
  - [Stage 5: Batch Translation](#stage-5-batch-translation)
    - [Description](#description-4)
    - [Workflow](#workflow-4)
    - [Key Operations](#key-operations-3)
  - [Stage 6: Progress Reporting](#stage-6-progress-reporting)
    - [Description](#description-5)
    - [Workflow](#workflow-5)
    - [Key Operations](#key-operations-4)
- [Detailed Stage Workflows](#detailed-stage-workflows)
  - [Content Discovery Workflow](#content-discovery-workflow)
  - [Translation Workflow](#translation-workflow)
  - [GitHub Integration Workflow](#github-integration-workflow)
- [Data Structures](#data-structures)
  - [`TranslationFile`](#translationfile)
  - [`ProcessedFileResult`](#processedfileresult)
  - [`RunnerState`](#runnerstate)
- [Error Recovery Flow](#error-recovery-flow)
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

### Stage 1: Initialization

#### Description

This stage validates runtime configuration, instantiates core services, and registers process signal handlers. The implementation corresponds to environment validation in [`utils/env.util.ts`](../src/utils/env.util.ts), runner initialization in [`services/runner/runner.service.ts`](../src/services/runner/runner.service.ts), and signal setup in [`services/runner/base.service.ts`](../src/services/runner/base.service.ts) _(see JSDoc on the runner classes for details)_.

#### Workflow

```mermaid
sequenceDiagram
    participant CLI
    participant Env as Environment Validator
    participant Logger
    participant Runner

    CLI->>Env: Validate environment variables
    Env->>Env: Parse .env with Zod schema

    alt Validation Success
        Env-->>CLI: Validated config
        CLI->>Logger: Initialize Pino logger
        Logger-->>CLI: Logger instance
        CLI->>Runner: Create RunnerService
        Runner->>Runner: Initialize services
        Note over Runner: GitHub, Translator,<br/>Locale, Language Detector, Cache
        Runner-->>CLI: Ready
    else Validation Failure
        Env-->>CLI: Throw validation error
        CLI->>CLI: Exit with error code 1
    end
```

#### Key Operations

- Environment variable validation via Zod schema
- Logger initialization (Pino with JSON output)
- Service instantiation (GitHub, Translator, Locale, Language Detector, Cache)
- Signal handler setup (SIGINT, SIGTERM, uncaught exceptions)

### Stage 2: Repository Setup

#### Description

This stage ensures the runner can read from the upstream repository and write to the fork. It verifies the GitHub token permissions and checks/synchronizes the fork state. See [`services/github/github.service.ts`](../src/services/github/github.service.ts) and [`services/github/github.repository.ts`](../src/services/github/github.repository.ts) for repository and fork-related implementations, and [`services/runner/base.service.ts`](../src/services/runner/base.service.ts) for how the runner invokes `verifyPermissions()` and `syncFork()` during startup.

#### Workflow

```mermaid
flowchart TD
    A[Start Repository Setup] --> B[Verify Token Permissions]
    B --> C{Permissions Valid?}
    C -->|No| D[Throw InitializationError]
    C -->|Yes| E[Check Fork Status]

    E --> F{Fork Synced?}
    F -->|Yes| G[Continue to Discovery]
    F -->|No| H[Sync Fork with Upstream]

    H --> I{Sync Success?}
    I -->|No| J[Throw InitializationError]
    I -->|Yes| G

    style D fill:#ffebee,stroke:#d32f2f
    style J fill:#ffebee,stroke:#d32f2f
    style G fill:#e8f5e9,stroke:#388e3c
```

#### Key Operations

- **Token verification** (`GitHubService.verifyTokenPermissions`): validates access to fork and upstream repositories via GitHub API.
- **Fork synchronization** (`GitHubService.syncFork`, `GitHubService.isForkSynced`, `GitHubService.forkExists`): ensures the fork matches upstream and performs a merge when necessary.
- **GitHub API Calls** (representative):

```plaintext
// Token verification
GET / user;
GET / repos / { owner } / { repo };

// Fork sync check
GET / repos / { fork } / commits;
GET / repos / { upstream } / commits;

// Sync execution (if needed)
POST / repos / { fork } / merge - upstream;
```

### Stage 3: Content Discovery

#### Description

This stage collects candidate files for translation by retrieving the upstream repository tree and applying repository-level filters and a glossary fetch. The implementation lives primarily in [`services/github/github.repository.ts`](../src/services/github/github.repository.ts) _(`getRepositoryTree`, `fetchGlossary`)_ and the file discovery pipeline in [`services/runner/file-discovery.manager.ts`](../src/services/runner/file-discovery.manager.ts) _(`discoverFiles`, `checkCache`, `filterByPRs`, `fetchContent`, `detectAndCacheLanguages`)_. Refer to those JSDoc comments for detailed behavior and pipeline stages.

#### Workflow

```mermaid
flowchart LR
    A[Start Discovery] --> B{Snapshot Available?}
    B -->|Yes| C[Load Cached Tree]
    B -->|No| D[Fetch Repository Tree]

    D --> E[GET /git/trees?recursive=true]
    C --> G[Filter Results]
    E --> G

    G --> H[Apply Filters]
    H --> I[".md files only"]
    I --> J["src/ directory only"]
    J --> K[Has path and SHA]

    K --> M[Fetch Glossary]
    M --> N[Load Glossary.md]
    N --> O[Discovery Complete]

    style E fill:#e1f5fe,stroke:#0277bd
    style M fill:#f3e5f5,stroke:#7b1fa2
```

#### Key Operations

- **Filter Criteria**:

```typescript
function filterRepositoryTree(tree: GitHubTreeItem[]) {
	return tree.filter(
		(item) =>
			item.path && // Has path
			item.path.endsWith(".md") && // Markdown file
			item.path.includes("/") && // Not root-level
			item.path.includes("src/"), // In src/ directory
	);
}
```

### Stage 4: File Filtering

#### Description

This stage applies a multi-step filtering pipeline to repository tree items to minimize unnecessary translations. It performs cache lookups, checks open PRs, fetches file content in controlled batches, and runs language detection to determine whether translation is required. See `services/runner/file-discovery.manager.ts` for the pipeline (`checkCache`, `filterByPRs`, `fetchContent`, `detectAndCacheLanguages`) and `services/language-detector.service.ts` for language analysis logic.

#### Workflow

```mermaid
flowchart TD
    A[Candidate Files] --> B[Batch Files by BATCH_SIZE]
    B --> C[Fetch Content Batch]

    C --> D{Batch Complete?}
    D -->|No| C
    D -->|Yes| E[Check Open PRs]

    E --> F{Has PR?}
    F -->|Yes| G[Skip File]
    F -->|No| J[Language Detection]

    J --> K{Is Translated?}
    K -->|Yes| L[Skip: Already Translated]
    K -->|No| M[Add to Queue]

    M --> N[Final Queue]
    G --> N
    L --> N

    style C fill:#fff3e0,stroke:#f57c00
    style J fill:#e1f5fe,stroke:#0277bd
```

### Stage 5: Batch Translation

#### Description

This stage processes queued files through branch creation, translation, commit, and pull request lifecycle. The implementation is rooted in [`services/runner/translation-batch.manager.ts`](../src/services/runner/translation-batch.manager.ts) (file-level lifecycle and error handling) and [`services/translator.service.ts`](../src/services/translator.service.ts) (token-based chunking and LLM interaction). Commit and PR operations are performed by [`services/github/github.content.ts`](../src/services/github/github.content.ts).

#### Workflow

```mermaid
sequenceDiagram
    participant R as Runner
    participant G as GitHub Service
    participant T as Translator
    participant API as GitHub API

    loop For Each File in Queue
        R->>G: createOrGetTranslationBranch(file)
        G->>API: GET /git/refs/heads/translate/{path}

        alt Branch Exists
            API-->>G: Branch reference
        else Branch Missing
            G->>API: POST /git/refs (create branch)
            API-->>G: New branch reference
        end

        G-->>R: Branch ref

        R->>T: translateContent(file)
        T->>T: Check token estimate (needs chunking?)

        alt Tokens < Threshold
            T->>T: Direct translation
        else Tokens > Threshold
            T->>T: Split into chunks (token-based)
            T->>T: Translate sequentially
            T->>T: Reassemble
        end

        T-->>R: Translated content

        R->>G: commitTranslation(file, branch, content)
        G->>API: PUT /repos/{owner}/{repo}/contents/{path}
        API-->>G: Commit SHA

        R->>G: createOrUpdatePullRequest(file)
        G->>API: POST /repos/{owner}/{repo}/pulls
        API-->>G: PR number

        G-->>R: PR created

        R->>R: Update metadata
    end

    R->>R: Print batch statistics
```

#### Key Operations

- Branch creation and reuse logic (`TranslationBatchManager.createOrGetTranslationBranch`) — handles existing PRs and branch recreation on conflicts.
- Token-based chunking and LLM calls (`TranslatorService.needsChunking`, `TranslatorService.translateWithChunking`, `TranslatorService.callLanguageModel`).
- Commit and PR operations (`GitHubService.commitTranslation`, `GitHubService.createPullRequest`, `TranslationBatchManager.createOrUpdatePullRequest`).
- Error handling and cleanup (`TranslationBatchManager.cleanupFailedTranslation`, circuit-breaker using `MAX_CONSECUTIVE_FAILURES`).

### Stage 6: Progress Reporting

#### Description

This stage compiles processing results and attempts to post a summary to a configured translation progress issue. The behavior is implemented in [`services/runner/pr.manager.ts`](../src/services/runner/pr.manager.ts) (`PRManager.updateIssue`, `PRManager.printFinalStatistics`) which delegates comment creation to [`services/github/github.content.ts`](../src/services/github/github.content.ts) (`commentCompiledResultsOnIssue`). If no progress issue is found or creation fails, the runner logs final statistics and continues; updating the issue is non-blocking.

#### Workflow

```mermaid
flowchart LR
    A[All Files Processed] --> B{Progress Issue Found?}
    B -->|Yes| C[Create Comment via GitHubService]
    B -->|No| D[Print Final Statistics]

    C --> E[Comment Created]
    E --> D

    D --> F[Log Final Metrics]
    F --> G[Cleanup Resources]
    G --> H[Exit]

    style H fill:#e8f5e9,stroke:#388e3c
```

#### Key Operations

- Compile results and format a comment (`PRManager.updateIssue` -> `GitHubService.commentCompiledResultsOnIssue`).
- Find the translation progress issue and post or update a comment (`GitHubService.commentCompiledResultsOnIssue`).
- Always print final statistics and elapsed time (`PRManager.printFinalStatistics`) even when commenting fails.

## Detailed Stage Workflows

### Content Discovery Workflow

```mermaid
flowchart LR
    subgraph Init["Initialization"]
        A1[Verify Permissions] --> A2[Check Fork Status]
    end
    subgraph Fetch["Tree Fetching"]
        B1[GET Default Branch] --> B2[GET Repository Tree] --> B3[Filter Results]
    end
    subgraph Gloss["Glossary"]
        C1[GET Glossary File] --> C2[Parse Glossary]
    end

    Init --> Fetch --> Gloss
```

### Translation Workflow

```mermaid
stateDiagram-v2
    [*] --> BranchCheck

    BranchCheck --> BranchExists : Branch found
    BranchCheck --> CreateBranch : Branch missing

    BranchExists --> SizeCheck
    CreateBranch --> SizeCheck

    SizeCheck --> DirectTranslation : Below token threshold
    SizeCheck --> ChunkedTranslation : Exceeds token threshold

    DirectTranslation --> Validation
    ChunkedTranslation --> Reassembly
    Reassembly --> Validation

    Validation --> CommitSuccess : Valid
    Validation --> ApplicationError : Invalid

    CommitSuccess --> PRCreation

    PRCreation --> UpdateMetadata : Success
    PRCreation --> PRError : Failure

    UpdateMetadata --> [*]

    ApplicationError --> Cleanup
    PRError --> Cleanup
    Cleanup --> [*]
```

### GitHub Integration Workflow

```mermaid
flowchart TD
    A[PR Creation Request] --> B{Check Existing PR}
    B -->|Query by Branch| C[Search Open PRs]

    C --> D{PR Found?}
    D -->|Yes| E[Update Existing PR]
    D -->|No| F[Create New PR]

    E --> G["PATCH /pulls"]
    F --> H["POST /pulls"]

    G --> I[PR Updated]
    H --> J[PR Created]

    I --> K[Return PR Data]
    J --> K

    K --> L{Production Mode?}
    L -->|Yes| M[Comment on Progress Issue]
    L -->|No| N[Skip Issue Update]

    M --> O[Complete]
    N --> O
```

## Data Structures

### `TranslationFile`

Represents a file candidate for translation:

```typescript
class TranslationFile {
	constructor(
		public readonly content: string, // File content (UTF-8)
		public readonly filename: string, // e.g., "homepage.md"
		public readonly path: string, // e.g., "src/content/homepage.md"
		public readonly sha: string, // Git blob SHA
	) {}
}
```

###### Source: [`services/translator.service.ts`](../src/services/translator.service.ts)

### `ProcessedFileResult`

Tracks processing outcome for each file:

```typescript
interface ProcessedFileResult {
	filename: string;
	branch: GitHubBranchRef | null;
	translation: string | null;
	pullRequest: GitHubPR | null;
	error: Error | null;
}
```

###### Source: [`services/runner/runner.types.ts`](../src/services/runner/runner.types.ts)

### `RunnerState`

Persistent workflow state:

```typescript
interface RunnerState {
	repositoryTree: GitHubTreeItem[];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
	timestamp: number;
}
```

###### Source: [`services/runner/runner.types.ts`](../src/services/runner/runner.types.ts)

## Error Recovery Flow

```mermaid
flowchart TD
    A[Error Detected] --> B{Error Severity}

    B -->|Warning| C[Log & Continue]
    B -->|Error| D[Cleanup Resources]
    B -->|Fatal| E[Abort Workflow]

    D --> F{Resource Type}
    F -->|Branch| G[Delete Translation Branch]
    F -->|PR| I[Close PR]

    G --> J[Mark as Failed]
    H --> J
    I --> J

    J --> K{Retry Possible?}
    K -->|Yes| L[Add to Retry Queue]
    K -->|No| M[Log Permanent Failure]

    L --> N[Continue Next File]
    M --> N

    E --> O[Log Fatal Error]
    O --> P[Exit Process]

    C --> N
    N --> Q[Update Statistics]

    style E fill:#ffebee,stroke:#d32f2f
    style O fill:#ffebee,stroke:#d32f2f
```

## References

- [Architecture Documentation](./ARCHITECTURE.md): Service design details
- [Project README](../README.md): High-level overview
