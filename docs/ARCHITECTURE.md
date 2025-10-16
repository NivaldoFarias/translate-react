# Architecture Documentation

This document provides a comprehensive overview of the `translate-react` system architecture, including service design, data flow, and error handling mechanisms.

## Table of Contents

- [Architecture Documentation](#architecture-documentation)
  - [Table of Contents](#table-of-contents)
  - [System Overview](#system-overview)
  - [Service-Oriented Architecture](#service-oriented-architecture)
    - [Service Hierarchy](#service-hierarchy)
  - [Core Services](#core-services)
    - [Runner Service (`services/runner/`)](#runner-service-servicesrunner)
    - [GitHub Service (`services/github/`)](#github-service-servicesgithub)
    - [Translator Service (`services/translator.service.ts`)](#translator-service-servicestranslatorservicets)
    - [Language Detector Service (`services/language-detector.service.ts`)](#language-detector-service-serviceslanguage-detectorservicets)
    - [Database Service (`services/database.service.ts`)](#database-service-servicesdatabaseservicets)
  - [Error Handling Architecture](#error-handling-architecture)
    - [Error Hierarchy](#error-hierarchy)
    - [Error Transformation Pipeline](#error-transformation-pipeline)
    - [GitHub API Error Mapping](#github-api-error-mapping)
  - [Data Flow Architecture](#data-flow-architecture)
    - [Discovery Phase Data Flow](#discovery-phase-data-flow)
    - [Translation Phase Data Flow](#translation-phase-data-flow)
  - [Design Patterns](#design-patterns)
    - [Inheritance-Based Service Design](#inheritance-based-service-design)
    - [Proxy Pattern for Error Handling](#proxy-pattern-for-error-handling)
    - [Snapshot Pattern for State Persistence](#snapshot-pattern-for-state-persistence)
  - [Performance Considerations](#performance-considerations)
    - [Batch Processing](#batch-processing)
    - [Concurrent Operations](#concurrent-operations)
    - [Memory Management](#memory-management)
  - [References](#references)

## System Overview

The system follows a **modular, service-oriented architecture** with clear separation of concerns. Each service handles a specific domain (GitHub operations, translation, language detection, etc.) and communicates through well-defined interfaces.

```mermaid
graph TB
    subgraph "Entry Point"
        CLI[CLI / index.ts]
    end
    
    subgraph "Orchestration Layer"
        Runner[Runner Service]
    end
    
    subgraph "Domain Services"
        GitHub[GitHub Service]
        Translator[Translator Service]
        LangDetector[Language Detector]
        DB[Database Service]
    end
    
    subgraph "GitHub Sub-Services"
        RepoSvc[Repository Service]
        ContentSvc[Content Service]
        BranchSvc[Branch Service]
    end
    
    subgraph "Cross-Cutting Concerns"
        ErrorHandler[Error Handler]
        Logger[Pino Logger]
    end
    
    subgraph "External Systems"
        GitHubAPI[GitHub REST API]
        LLMAPI[LLM API<br/>OpenAI/OpenRouter]
        SQLite[(SQLite DB)]
    end
    
    CLI --> Runner
    Runner --> GitHub
    Runner --> Translator
    Runner --> LangDetector
    Runner --> DB
    
    GitHub --> RepoSvc
    GitHub --> ContentSvc
    GitHub --> BranchSvc
    
    RepoSvc --> GitHubAPI
    ContentSvc --> GitHubAPI
    BranchSvc --> GitHubAPI
    
    Translator --> LLMAPI
    Translator --> LangDetector
    
    DB --> SQLite
    
    Runner -.-> ErrorHandler
    GitHub -.-> ErrorHandler
    Translator -.-> ErrorHandler
    
    ErrorHandler --> Logger
    
    classDef entryPoint fill:#e1f5fe,stroke:#0277bd,stroke-width:2px
    classDef orchestration fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef domain fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef external fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef crossCutting fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    
    class CLI entryPoint
    class Runner orchestration
    class GitHub,Translator,LangDetector,DB domain
    class GitHubAPI,LLMAPI,SQLite external
    class ErrorHandler,Logger crossCutting
```

## Service-Oriented Architecture

### Service Hierarchy

```mermaid
classDiagram
    class BaseGitHubService {
        #octokit: Octokit
        #repositories: RepositoryConfig
        #helpers: HelperServices
        +constructor(config)
    }
    
    class RepositoryService {
        +getDefaultBranch()
        +getRepositoryTree()
        +verifyTokenPermissions()
        +isForkSynced()
        +syncFork()
        +fetchGlossary()
        -filterRepositoryTree()
    }
    
    class ContentService {
        +getFileContent()
        +listOpenPullRequests()
        +createOrUpdatePullRequest()
        +commitTranslation()
        +createCommentOnPullRequest()
        +commentCompiledResultsOnIssue()
    }
    
    class BranchService {
        +createOrGetTranslationBranch()
        +cleanupBranch()
        +deleteBranch()
    }
    
    class GitHubService {
        -repository: RepositoryService
        -content: ContentService
        -branch: BranchService
        +* (delegates to sub-services)
    }
    
    BaseGitHubService <|-- RepositoryService
    BaseGitHubService <|-- ContentService
    BaseGitHubService <|-- BranchService
    
    GitHubService *-- RepositoryService
    GitHubService *-- ContentService
    GitHubService *-- BranchService
```

## Core Services

### Runner Service (`services/runner/`)

The Runner Service acts as the **workflow orchestrator**, coordinating all other services to execute the complete translation pipeline.

#### Responsibilities

- Workflow state management and orchestration
- Batch processing coordination
- Progress tracking and logging
- Error recovery and cleanup
- Snapshot persistence (development mode)

#### Key Methods

```typescript
class RunnerService extends BaseRunnerService {
  // Main workflow execution
  async run(): Promise<void>
  
  // Workflow stages
  protected async verifyPermissions(): Promise<void>
  protected async syncFork(): Promise<boolean>
  protected async fetchRepositoryTree(): Promise<void>
  protected async fetchFilesToTranslate(): Promise<void>
  protected async processInBatches(files, batchSize): Promise<void>
  
  // File processing
  private async processFile(file, progress): Promise<void>
  private async fetchBatch(batch, updateFn): Promise<TranslationFile[]>
  
  // State management
  protected async loadSnapshot(isForkSynced): Promise<void>
  protected async updateIssueWithResults(): Promise<void>
  
  // Cleanup and reporting
  private async cleanupFailedTranslation(metadata): Promise<void>
  protected async printFinalStatistics(): Promise<void>
}
```

#### State Management

The Runner maintains workflow state in a `RunnerState` object:

```typescript
interface RunnerState {
  repositoryTree: GitHubTreeItem[];
  filesToTranslate: TranslationFile[];
  processedResults: ProcessedFileResult[];
  timestamp: number;
}
```

This state is persisted to SQLite in development mode for interruption recovery.

### GitHub Service (`services/github/`)

Modular composition of specialized GitHub operation services.

#### Service Composition

The main `GitHubService` delegates to three specialized sub-services:

```typescript
class GitHubService {
  private repository: RepositoryService;
  private content: ContentService;
  private branch: BranchService;
  
  // Delegation methods expose sub-service functionality
  public getRepositoryTree = (...args) => this.repository.getRepositoryTree(...args);
  public createOrUpdatePullRequest = (...args) => this.content.createOrUpdatePullRequest(...args);
  public createOrGetTranslationBranch = (...args) => this.branch.createOrGetTranslationBranch(...args);
}
```

#### Repository Service

Manages repository-level operations:

- Fork synchronization detection and execution
- Repository tree fetching with recursive option
- Token permission verification
- Default branch detection (dynamic, not hardcoded)
- Glossary file retrieval

<details>
<summary>Implementation Details</summary>

```typescript
class RepositoryService extends BaseGitHubService {
  async getRepositoryTree(baseBranch?: string, filterIgnored = true) {
    const branchName = baseBranch || await this.getDefaultBranch('fork');
    const response = await this.octokit.git.getTree({
      ...this.repositories.fork,
      tree_sha: branchName,
      recursive: 'true',
    });
    
    return filterIgnored 
      ? this.filterRepositoryTree(response.data.tree)
      : response.data.tree;
  }
  
  // Filters for .md files in src/ directory
  protected filterRepositoryTree(tree) {
    return tree.filter(item => 
      item.path &&
      item.path.endsWith('.md') &&
      item.path.includes('/') &&
      item.path.includes('src/')
    );
  }
}
```

</details>

#### Content Service

Handles file content and pull request operations:

- File content retrieval via blob SHA
- Open PR listing and filtering
- PR creation with detailed descriptions
- Commit operations with proper messages
- Issue commenting for progress tracking

<details>
<summary>PR Creation Flow</summary>

```mermaid
sequenceDiagram
    participant R as Runner
    participant C as ContentService
    participant G as GitHub API
    
    R->>C: createOrUpdatePullRequest(file, options)
    C->>G: Check if PR exists (by branch)
    
    alt PR Exists
        G-->>C: Return existing PR
        C->>G: Update PR (title, body)
        G-->>C: Updated PR
    else PR Does Not Exist
        C->>G: Create new PR
        Note over C,G: title, body, head, base
        G-->>C: New PR created
    end
    
    C-->>R: PR data
```

</details>

#### Branch Service

Manages translation branch lifecycle:

- Branch creation with naming convention (`translate/{file-path}`)
- Branch existence checking
- Failed translation branch cleanup
- Reference resolution and validation

### Translator Service (`services/translator.service.ts`)

Core translation engine interfacing with LLM APIs.

#### Translation Pipeline

```mermaid
graph LR
    A[Input Content] --> B[Parse Markdown]
    B --> C{Size Check}
    C -->|< 4000 tokens| D[Direct Translation]
    C -->|> 4000 tokens| E[Chunking]
    E --> F[Translate Chunks]
    F --> G[Reassemble]
    D --> H[Glossary Validation]
    G --> H
    H --> I[Format Validation]
    I --> J[Output Translation]
    
    style C fill:#fff3e0,stroke:#f57c00
    style E fill:#e1f5fe,stroke:#0277bd
```

#### Content Chunking Strategy

For files exceeding `MAX_CHUNK_TOKENS` (default: 4000):

1. **Text Splitting**: Uses `RecursiveCharacterTextSplitter` from LangChain
2. **Context Preservation**: Maintains overlap between chunks to preserve context
3. **Sequential Translation**: Translates chunks in order, passing previous context
4. **Reassembly**: Combines translated chunks with original formatting

```typescript
async translateLargeContent(content: string): Promise<string> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: MAX_CHUNK_TOKENS,
    chunkOverlap: 200, // Preserve context
  });
  
  const chunks = await splitter.splitText(content);
  const translations: string[] = [];
  
  for (const [index, chunk] of chunks.entries()) {
    const context = index > 0 ? translations[index - 1].slice(-500) : '';
    const translated = await this.translateChunk(chunk, context);
    translations.push(translated);
  }
  
  return translations.join('\n\n');
}
```

#### Glossary Management

The glossary enforces consistent translation of technical terms:

- Loaded from `GLOSSARY.md` in upstream repository
- Passed as system instruction to LLM
- Validated post-translation for adherence

### Language Detector Service (`services/language-detector.service.ts`)

Statistical language detection using Compact Language Detector (CLD).

#### Detection Strategy

```mermaid
graph TD
    A[Input Content] --> B{Content Length Check}
    B -->|< MIN_LENGTH| C[Return: Unknown]
    B -->|>= MIN_LENGTH| D[CLD Detection]
    
    D --> E{Reliable?}
    E -->|Yes| F{Confidence > 80%?}
    E -->|No| G[Return: Low Confidence]
    
    F -->|Yes| H{Language Matches Target?}
    F -->|No| G
    
    H -->|Yes| I[Return: Already Translated]
    H -->|No| J[Return: Needs Translation]
    
    style E fill:#fff3e0,stroke:#f57c00
    style F fill:#e1f5fe,stroke:#0277bd
```

#### Confidence Scoring

```typescript
interface LanguageAnalysis {
  languageScore: {
    target: number;  // Percentage of target language
    source: number;  // Percentage of source language
  };
  ratio: number;           // Target / Source ratio
  isTranslated: boolean;   // ratio > TRANSLATION_THRESHOLD (0.5)
  detectedLanguage: string | undefined;
  rawResult: cld.DetectLanguage;
}
```

The detector calculates a **translation ratio**:

- `ratio = targetScore / (targetScore + sourceScore)`
- `isTranslated = ratio > 0.5`

This approach handles mixed-language content (code examples, technical terms) better than binary detection.

### Database Service (`services/database.service.ts`)

SQLite-based persistence for workflow state.

#### Schema Structure

```sql
CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repositoryTree TEXT NOT NULL,
  filesToTranslate TEXT NOT NULL,
  processedResults TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

-- Future optimization: Add indexes
-- CREATE INDEX idx_timestamp ON snapshots(timestamp);
```

#### Snapshot System

Snapshots are stored as **JSON-serialized state**:

```typescript
interface Snapshot {
  id?: number;
  repositoryTree: GitHubTreeItem[];
  filesToTranslate: TranslationFile[];
  processedResults: ProcessedFileResult[];
  timestamp: number;
}
```

**Key operations**:

- `save()`: Complete snapshot save
- `append()`: Incremental updates to specific fields
- `loadLatest()`: Retrieve most recent snapshot
- `clear()`: Truncate table (development mode)

## Error Handling Architecture

### Error Hierarchy

```mermaid
classDiagram
    class TranslationError {
        +code: string
        +severity: ErrorSeverity
        +context: ErrorContext
        +originalError?: Error
    }
    
    class APIError {
        +code: GITHUB_* | OPENAI_*
    }
    
    class ResourceLoadError {
        +code: RESOURCE_LOAD_FAILED
    }
    
    class InitializationError {
        +code: INITIALIZATION_FAILED
    }
    
    class ValidationError {
        +code: VALIDATION_FAILED
    }
    
    TranslationError <|-- APIError
    TranslationError <|-- ResourceLoadError
    TranslationError <|-- InitializationError
    TranslationError <|-- ValidationError
```

### Error Transformation Pipeline

```mermaid
sequenceDiagram
    participant S as Service Method
    participant P as Error Proxy
    participant H as Error Handler
    participant M as Error Mapper
    participant L as Logger
    
    S->>S: Operation fails
    S->>P: Throw raw error
    P->>H: handleError(error, context)
    H->>M: mapError(error)
    M->>M: Identify error type
    M->>M: Add context
    M-->>H: TranslationError
    H->>L: Log structured error
    H->>H: Format error message
    H-->>P: Transformed error
    P-->>S: Throw TranslationError
```

### GitHub API Error Mapping

Specific error codes for different GitHub API failures:

| HTTP Status      | Error Code                | Description               |
| ---------------- | ------------------------- | ------------------------- |
| 404              | `GITHUB_NOT_FOUND`        | Resource does not exist   |
| 401              | `GITHUB_UNAUTHORIZED`     | Invalid or missing token  |
| 403              | `GITHUB_FORBIDDEN`        | Insufficient permissions  |
| 403 (rate limit) | `GITHUB_RATE_LIMITED`     | API rate limit exceeded   |
| 422              | `GITHUB_VALIDATION_ERROR` | Request validation failed |
| 500-599          | `GITHUB_SERVER_ERROR`     | GitHub server error       |

## Data Flow Architecture

### Discovery Phase Data Flow

```mermaid
flowchart TD
    A[Start Discovery] --> B[Fetch Repository Tree]
    B --> C{Tree Cached?}
    C -->|Yes| D[Load from Snapshot]
    C -->|No| E[GET /git/trees/{sha}]
    
    E --> F[Filter .md in src/]
    D --> F
    
    F --> G[Batch Files by 10]
    G --> H[Fetch File Content]
    
    H --> I{Has Open PR?}
    I -->|Yes| J[Skip File]
    I -->|No| K{Size > MAX?}
    
    K -->|Yes| L[Skip File - Too Large]
    K -->|No| M[Language Detection]
    
    M --> N{Already Translated?}
    N -->|Yes| O[Skip File]
    N -->|No| P[Add to Translation Queue]
    
    P --> Q[Discovery Complete]
    J --> Q
    L --> Q
    O --> Q
    
    style H fill:#e1f5fe,stroke:#0277bd
    style M fill:#f3e5f5,stroke:#7b1fa2
```

### Translation Phase Data Flow

```mermaid
flowchart TD
    A[Translation Queue] --> B[Process in Batches]
    B --> C[For Each File]
    
    C --> D[Create Translation Branch]
    D --> E{Branch Exists?}
    E -->|Yes| F[Use Existing]
    E -->|No| G[Create New Branch]
    
    F --> H[Translate Content]
    G --> H
    
    H --> I{Size > Chunk Threshold?}
    I -->|Yes| J[Chunked Translation]
    I -->|No| K[Direct Translation]
    
    J --> L[Reassemble Chunks]
    K --> M[Validate Translation]
    L --> M
    
    M --> N{Valid?}
    N -->|No| O[Error: Cleanup Branch]
    N -->|Yes| P[Commit to Branch]
    
    P --> Q[Create Pull Request]
    Q --> R[Update Progress Issue]
    R --> S[Complete]
    
    O --> T[Log Error]
    T --> S
    
    style H fill:#e8f5e9,stroke:#388e3c
    style M fill:#fff3e0,stroke:#f57c00
```

## Design Patterns

### Inheritance-Based Service Design

All GitHub services extend `BaseGitHubService`:

```typescript
abstract class BaseGitHubService {
  protected readonly octokit: Octokit;
  protected readonly repositories: RepositoryConfig;
  protected readonly helpers: HelperServices;
  
  constructor(config?: GitHubServiceConfig) {
    this.octokit = new Octokit({ auth: env.GITHUB_TOKEN });
    this.repositories = { fork: {...}, upstream: {...} };
    this.helpers = { github: new GitHubErrorHelper(), ... };
  }
}
```

**Benefits**:
- Shared authentication and configuration
- Consistent error handling via helpers
- Protected access to common utilities

### Proxy Pattern for Error Handling

Services are wrapped in error handling proxies:

```typescript
export function createErrorHandlingProxy<T extends object>(
  target: T,
  context: string
): T {
  return new Proxy(target, {
    get(target, prop) {
      const original = target[prop];
      
      if (typeof original === 'function') {
        return async function(...args: unknown[]) {
          try {
            return await original.apply(target, args);
          } catch (error) {
            throw handleError(error, { operation: `${context}.${String(prop)}` });
          }
        };
      }
      
      return original;
    }
  });
}
```

### Snapshot Pattern for State Persistence

Incremental state updates with append-only semantics:

```typescript
class SnapshotService {
  async append<K extends keyof Snapshot>(
    key: K,
    value: Snapshot[K]
  ): Promise<void> {
    const latest = await this.loadLatest();
    
    await this.save({
      ...latest,
      [key]: value,
      timestamp: Date.now()
    });
  }
}
```

## Performance Considerations

### Batch Processing

Files are processed in configurable batches to balance:

- **Throughput**: Parallel processing of multiple files
- **Resource Usage**: Controlled memory and API consumption
- **Error Isolation**: Failed file doesn't block entire batch

```typescript
const batches = this.createBatches(files, batchSize);

for (const batch of batches) {
  await Promise.all(
    batch.map(file => this.processFile(file, progress))
  );
}
```

### Concurrent Operations

**Parallelization strategy**:

- File content fetching: Batch of 10 concurrent requests
- Language detection: Sequential (CPU-bound)
- Translation: Sequential (API rate-limited)
- PR creation: Sequential (to avoid conflicts)

### Memory Management

**Key optimizations**:

- Streaming content processing (no full repository in memory)
- Garbage collection after each batch
- Snapshot incremental updates (not full state rewrites)
- Lazy loading of translation glossary

## References

- [Workflow Documentation](./WORKFLOW.md) - Detailed execution flow
- [Error Handling Documentation](./ERROR_HANDLING.md) - Error taxonomy
- [Project README](../README.md) - High-level overview
