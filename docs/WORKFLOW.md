# Workflow Execution Documentation

Detailed breakdown of the translation workflow: execution stages, data flow, and error recovery.

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Overview](#overview)
  - [Actual `run()` order](#actual-run-order)
- [Automated upstream polling](#automated-upstream-polling)
- [Operating translate-react (forks)](#operating-translate-react-forks)
- [Pinning translate-react in GitHub Actions](#pinning-translate-react-in-github-actions)
- [Releases and semantic versioning](#releases-and-semantic-versioning)
- [Stable 1.x expectations](#stable-1x-expectations)
- [GitHub repository settings (maintainers)](#github-repository-settings-maintainers)
- [Execution Stages](#execution-stages)
  - [Stage 1: Initialization](#stage-1-initialization)
  - [Stage 2: Repository Setup](#stage-2-repository-setup)
  - [Stage 3: Content Discovery](#stage-3-content-discovery)
  - [Stage 4: File Filtering](#stage-4-file-filtering)
  - [Stage 5: Batch Translation](#stage-5-batch-translation)
  - [Stage 6: Progress Reporting](#stage-6-progress-reporting)
- [Data Flow Diagrams](#data-flow-diagrams)
  - [Discovery Phase](#discovery-phase)
  - [Translation Phase](#translation-phase)
- [Data Structures](#data-structures)
- [Error Recovery](#error-recovery)
  - [Empty discovery](#empty-discovery-no-files-to-translate)

## Overview

The sections below group behavior into **six conceptual stages**. For the exact call sequence, see [Actual `run()` order](#actual-run-order).

```mermaid
flowchart TD
    A[1. Initialization] --> A1[LLM connectivity]
    A1 --> B[2. Repository Setup]
    B --> C[3. Content Discovery]
    C --> D[4. File Filtering]
    D --> E[5. Batch Translation]
    E --> F[6. Progress Reporting]

    B -->|Fork Out of Sync| B1[Sync Fork]
    B1 --> C

    C -.->|optional: pre-filled queue| C1[Skip file discovery]
    C1 -.-> D

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

    class A,A1,B,C,D,E,F stage
    class B1,C1,E1,E2,E3,E4 subprocess
    class E5 error
```

### Actual `run()` order

Order in [`RunnerService.run()`](../src/app/services/runner/runner.service.ts), then [`main()`](../src/app/main.ts):

1. `verifyLLMConnectivity()`: translator API reachability
2. `verifyPermissions()`: wraps `verifyTokenPermissions` on fork and upstream
3. `syncFork()`: `forkExists()`, then `isForkSynced()` / `syncFork` if behind
4. `fetchRepositoryTree()`: upstream tree (markdown + `src/` filter applied in GitHub layer) and translation guidelines
5. `fetchFilesToTranslate()`: unless `state.filesToTranslate` is already populated (unusual outside tests), runs `FileDiscoveryManager.discoverFiles`; returns `false` when that pipeline yields no candidates, so the next step is skipped
6. `processInBatches()`: when step 5 returned `true`, per-file branch, translate, commit, PR; omitted when there is nothing to translate (workflow still completes successfully)
7. `updateIssueWithResults()`: `PRManager.updateIssue` → `GitHubService.commentCompiledResultsOnIssue` (see [Stage 6: Progress Reporting](#stage-6-progress-reporting))
8. `printFinalStatistics()`: returns counts to the caller (zeros when step 6 was skipped); `main` logs them and exits successfully when no exception was thrown

## Automated upstream polling

Translation runs only when an upstream React docs repository (`reactjs/<lang>.react.dev`) has a **new default-branch commit** compared to the last successful workflow run for that locale.

### Components

| Piece                                                                           | Role                                                                           |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`.github/upstream-locales.json`](../.github/upstream-locales.json)             | Registry of locales, upstream/fork repo names, and guidelines file             |
| [`.github/workflows/upstream-poll.yml`](../.github/workflows/upstream-poll.yml) | Scheduled poll (every 6 hours) and optional `workflow_dispatch` dry run        |
| [`.github/workflows/workflow.yml`](../.github/workflows/workflow.yml)           | Reusable translation workflow (`workflow_call`) and manual `workflow_dispatch` |
| [`src/ci/actions/poll-upstream.ts`](../src/ci/actions/poll-upstream.ts)         | Compares upstream SHAs to repository variables; outputs a matrix               |
| [`src/ci/actions/resolve-matrix.ts`](../src/ci/actions/resolve-matrix.ts)       | Builds a matrix for manual runs (optional `--langs` via `citty`)               |

```mermaid
flowchart TD
  Cron[schedule / manual poll] --> PollJob[poll job]
  PollJob -->|SHAs changed| Translate[workflow_call translation]
  PollJob -->|no changes| Done[workflow ends]
  Translate --> Run[bun run start per matrix.lang]
  Run -->|success| Var[gh variable set UPSTREAM_SHA_*]
```

### Stored SHAs

For each `lang` in the registry, the workflow stores the processed upstream tip in a repository variable:

- Name: `UPSTREAM_SHA_<LANG>` with hyphens mapped to underscores (e.g. `pt-br` → `UPSTREAM_SHA_PT_BR`)
- Updated: only after a **successful** matrix job for that locale (`Record upstream SHA` step)
- Read: poll job via [`UpstreamShaVariableReader`](../src/ci/services/upstream/upstream-sha-variable.reader.ts)

If a translation run fails, the variable is left unchanged so the next poll still sees a mismatch and can retry.

### Triggers

| Trigger                             | Workflow            | Behaviour                                                                     |
| ----------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| Cron `0 */6 * * *`                  | `upstream-poll.yml` | Poll all locales; call translation only for changed upstreams                 |
| Manual **Poll upstream React docs** | `upstream-poll.yml` | Same poll; enable **dry run** to log changes without starting translation     |
| Manual **Run Translation Workflow** | `workflow.yml`      | Skip poll; run `ci:resolve-matrix` for `langs` input (empty = all configured) |

### Adding a locale

1. Fork `reactjs/<lang>.react.dev` and install the bot on the fork.
2. Add one object to [`.github/upstream-locales.json`](../.github/upstream-locales.json).
3. No workflow matrix edit is required; the next poll or manual run picks up the new row.

### Local commands

```bash
export GH_TOKEN=...
export GITHUB_OUTPUT=/tmp/github-output
export GITHUB_REPOSITORY=owner/translate-react
export GITHUB_REPOSITORY_OWNER=owner

bun run ci:poll-upstream
bun run ci:resolve-matrix --langs pt-br,ru
```

### Permissions

The translation workflow needs `actions: write` on `GITHUB_TOKEN` (or the bot token used with `gh variable set`) so successful runs can update repository variables. The poll workflow only reads variables and repositories.

## Operating translate-react (forks)

No hosted backend: you set `LLM_API_KEY` (OpenAI-compatible API) and pay or quota-manage with the provider. Translation Actions use the [translate-react bot app](https://github.com/apps/translate-react-bot); secrets such as `BOT_APP_ID`, `BOT_PRIVATE_KEY`, `LLM_API_KEY`, optional `GH_PAT_TOKEN` / `OPENAI_PROJECT_ID`, and variables such as `LLM_MODEL` are wired in [`.github/workflows/workflow.yml`](../.github/workflows/workflow.yml) and [`.github/workflows/upstream-poll.yml`](../.github/workflows/upstream-poll.yml). Review PRs on the locale fork; note this tool’s version (logs, `package.json`, or CI ref) when comparing runs.

Rate and cost knobs: [`src/app/constants/`](../src/app/constants/), [`src/app/schemas/env.schema.ts`](../src/app/schemas/env.schema.ts) — e.g. `LLM_MAX_REQUESTS_PER_MINUTE`, `MAX_LLM_CONCURRENCY`, `MAX_RETRY_ATTEMPTS`, `BATCH_SIZE`, `MASK_VERBATIM_LARGE_FENCES`.

## Local LLM exercise (integration tests)

For a real LLM pass with mocked GitHub, use [`tests/integration/workflow.integration.spec.ts`](../tests/integration/workflow.integration.spec.ts) and helpers in [`create-integration-runner.ts`](../tests/integration/create-integration-runner.ts) (markdown under [`tests/fixtures/md/`](../tests/fixtures/md/)). Configure `LLM_API_KEY` and related vars in `.env` the same way as production runs.

## Releases and semantic versioning

Semver is [`package.json`](../package.json) `version` (OpenRouter title defaults use `name` + `version` from there; see [`src/app/constants/`](../src/app/constants/)).

CI on `main` / `dev` fails if `package.json` `version` does not appear as a `## [version]` heading in [`CHANGELOG.md`](../CHANGELOG.md) (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

1. Edit [`CHANGELOG.md`](../CHANGELOG.md) (`[Unreleased]` then new dated section).
2. Bump `version` in [`package.json`](../package.json).
3. `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin vX.Y.Z`.
4. GitHub **Release** from that tag; paste the changelog slice into the description.

Rough bump rules: **patch** — fixes / internal prompts, same env contract; **minor** — new optional env or backward-compatible behavior; **major** — breaking env or workflow contract.

## Stable 1.x expectations

`1.0.0` would mean documented stability of required env names (`env.util`), the high-level steps (LLM check → GitHub → sync → discover → translate → PRs → optional issue comment), and a short note on which upstream React docs branch you last tested against. Upstream content pinning is not part of this package’s semver. Until then `0.x` is normal; pin CI if you care.

## GitHub repository settings (maintainers)

Check occasionally alongside workflow YAML (`permissions` in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), etc.).

- **Actions → General** — `GITHUB_TOKEN` default permission (read vs write); fork workflow approval; log/artifact retention.
- **Rulesets / branch protection** — CI required on default branch; force-push policy.
- **Secrets and variables** — secrets for keys; variables for defaults (`LLM_MODEL`, `BUN_VERSION`, optional `HEADER_APP_*`); use **environments** with protection rules if you gate `development` / `production` runs.
- **Security** — Dependabot / secret scanning if available; reporting per [`SECURITY.md`](../SECURITY.md).
- **Collaborators** — Who approves external fork workflow runs; who edits secrets.

## Execution Stages

The six stages below match the overview diagram. For conflict handling and branch-tip `sha` behavior, see Stage 4 and Stage 5.

### Stage 1: Initialization

**At import / process startup:** Zod validates `env` when the module loads; [`composition.ts`](../src/app/composition.ts) constructs service singletons; `BaseRunnerService` registers signal cleanup (`registerCleanup`).

**At `run()` start:** `verifyLLMConnectivity()` runs before any GitHub setup.

**Operations (combined):** env validation → logger → composition wiring → cleanup registration → LLM connectivity check

### Stage 2: Repository Setup

Verifies GitHub token permissions and synchronizes fork with upstream.

```mermaid
flowchart LR
    A[Verify Token] --> B{Valid?}
    B -->|No| C[Error]
    B -->|Yes| D[Fork exists check]
    D --> E{Fork Synced?}
    E -->|Yes| F[Continue]
    E -->|No| G[Sync Fork] --> F
```

**Operations:** `verifyPermissions` (uses `verifyTokenPermissions` on fork and upstream); then `syncFork`: `forkExists` → `isForkSynced` → `syncFork` when behind

### Stage 3: Content Discovery

Fetches the **upstream** Git tree via `getRepositoryTree`, which applies `filterMarkdownFiles` before the runner sees items: `.md` paths under `src/` (with a `/` in the path). The runner then patches filenames, loads translation guidelines (optional), and stores `repositoryTree`.

```mermaid
flowchart LR
    A[Fetch upstream tree] --> B[filterMarkdownFiles in API layer]
    B --> C[Patch filenames / SHA]
    C --> D[Fetch translation guidelines]
    D --> E[Ready for filtering pipeline]
```

**Filter criteria (in `filterMarkdownFiles`):** `.md` suffix, path contains `src/`, path contains `/`, and non-empty `path` (SHA enforced when building `PatchedRepositoryTreeItem` in the runner)

### Stage 4: File Filtering

Multi-step pipeline to minimize unnecessary translations. **Conflicted open PRs are not closed here:** they are recorded in `invalidPRsByFile`, the file stays in the queue, and close/delete/recreate happens during batch translation when branches or PRs are handled.

```mermaid
flowchart LR
    A[Candidates] --> B{Has Open PR?}
    B -->|Yes| C{PR Has Conflicts?}
    C -->|No| D[Skip]
    C -->|Yes| E[Queue for Re-translation]
    B -->|No| F[Batch Fetch Content]
    F --> G{Already Translated?}
    G -->|Yes| D
    G -->|No| E
```

**Pipeline:** Deduplicate by `path` → Language cache lookup → Open PR filter (conflict-aware; queues conflicted paths) → Content fetch (batched) → Language detection

**Source content (`getFile`):** After the PR filter, each candidate is loaded with `repos.getContent` on the **upstream** repository at the **default branch** (`main`), using `file.path`. The runner does **not** read blobs from the fork or from a `translate/...` branch tip, so an existing translation on a topic branch cannot be mistaken for English source.

**PR file list reliability (`filterByPRs`):** Open PRs are mapped to changed paths via `getPullRequestFiles`, which retries transient failures. If the file list for a PR cannot be loaded after retries, discovery **fails** instead of omitting that PR from the map (which would queue already-translated paths for another run).

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

- **Existing PR guard:** Before branch work, `processFile` checks `findPullRequestByBranch` + `checkPullRequestStatus`. Mergeable open PRs skip translate/commit (belt-and-suspenders if a path slipped past discovery).
- Branch: `createOrGetTranslationBranch` (reuses existing or creates new)
- Translate: Direct or chunked using the `CHUNKS` budget in [`chunking.constants.ts`](../src/app/services/translator/chunking/chunking.constants.ts). Optional cost control: when `MASK_VERBATIM_LARGE_FENCES` is enabled, fences at or above `MASK_VERBATIM_LARGE_FENCES_MIN_TOKENS` (tiktoken estimate) are replaced with HTML comment placeholders before the LLM and merged back after translation ([`markdown-verbatim-fences.util.ts`](../src/app/utils/markdown-verbatim-fences.util.ts)); natural language **inside** those large fences is not translated while they stay masked.
- Commit: `commitTranslation` → `createOrUpdatePullRequest` (see [Branch-tip SHA before commit](#branch-tip-sha-before-commit))
- Error: `cleanupFailedTranslation`, circuit-breaker at `MAX_CONSECUTIVE_FAILURES`

#### Branch-tip SHA before commit

> [!NOTE]
> GitHub [`createOrUpdateFileContents`](https://docs.github.com/rest/repos/contents#create-or-update-file-contents)
> needs the **current** blob `sha` when replacing a file. Discovery stores a `sha` from
> upstream `getContent` (default branch) for reading source bytes; a **reused** `translate/...`
> branch may already point
> that path at a **different** blob. `commitTranslation` therefore calls `repos.getContent` on the
> **fork** for `path` at `branch.ref`, uses that `sha` on update, and **omits** `sha` when the path
> is missing on the branch (create). Sending a stale `sha` yields **HTTP 409 Conflict** (body text
> indicates the `sha` does not match).

#### Stale PR conflict handling

**Discovery (`filterByPRs`):** Open PRs are listed; files touched by a PR get `checkPullRequestStatus`. Valid (mergeable) PRs cause the file to be skipped. Conflicted or indeterminate PRs are **kept in the work queue** and summarized in `invalidPRsByFile` for messaging in a **new** PR body (`> [!IMPORTANT]` via [`pr-body.builder.ts`](../src/app/locales/pr-body.builder.ts)) — the old PR is **not** closed during discovery.

**Translation (`createOrGetTranslationBranch` / `createOrUpdatePullRequest`):** When an existing branch or upstream PR is conflicted, the workflow closes the PR with a comment, deletes the translation branch, and creates a fresh branch/commit/PR — regardless of who opened the original PR.

```mermaid
flowchart TD
    A[Existing PR at translate time] --> B{"checkPullRequestStatus polls if mergeable null"}
    B -->|clean| C[Reuse branch / PR]
    B -->|"dirty / unknown / null after retries"| D[Conflicts]
    D --> E[Comment + close PR]
    E --> F[Delete translation branch]
    F --> G[Re-translate from current upstream]
    G --> H[Open new PR]
    H --> I[Optional: invalidPRsByFile notice in body]
```

**Conflict detection:** The workflow fetches `mergeable` and `mergeable_state` for each existing PR. GitHub computes `mergeable` asynchronously, so when the value is `null` the workflow polls up to 3 times (2 s apart). A PR is treated as conflicted when:

- `mergeable === false` and `mergeable_state === "dirty"`
- `mergeable === false` and `mergeable_state === "unknown"`
- `mergeable` remains `null` after all polling attempts (conservative fallback)

**Complete rewrite (during translation, not during discovery filtering):** the workflow:

1. Closes the conflicted PR with an explanatory comment
2. Deletes the stale translation branch
3. Uses freshly fetched source content for the new translation
4. Commits on a new or recreated branch
5. Opens a new PR; the body may include context from `invalidPRsByFile` when that metadata was captured earlier

**Why not merge conflicts by hand:** merging hunks tends to mix old and new wording in one file. Re-translating from the current upstream keeps tone and glossary usage consistent and avoids a custom three-way merge for prose.

When `invalidPRsByFile` is set from discovery, the PR template adds an `> [!IMPORTANT]` conflict
notice; every PR body also includes a separate `> [!IMPORTANT]` human-review block from the locale
template.

### Stage 6: Progress Reporting

After batches finish, the runner may add a **new** comment on the upstream **Translation Progress**
issue with a compiled summary. Commenting is **skipped** when any of the following is true:

- There are zero `ProcessedFileResult` rows
- There are zero candidate `filesToTranslate`
- **No result has a non-null `pullRequest`** (nothing opened or updated on GitHub — typical for
  failure-only runs)
- Issue search finds no matching open issue (warn and continue)

Otherwise `issues.createComment` runs on the upstream repo. Final counts are always logged via
`printFinalStatistics`. **Process cleanup** on success path is normal exit; `registerCleanup` runs
on termination signals.

**Operations:** `PRManager.updateIssue` → `GitHubService.commentCompiledResultsOnIssue` (early
return when skipped as above) → `printFinalStatistics` → `main` logs statistics and exits `0`

## Data Flow Diagrams

Compact views of the same pipeline as [Stage 4](#stage-4-file-filtering) and [Stage 5](#stage-5-batch-translation); use those sections for the full diagrams and notes.

### Discovery Phase

Same decision flow as under [Stage 4: File Filtering](#stage-4-file-filtering).

### Translation Phase

Same branch → translate → commit → PR loop as under [Stage 5: Batch Translation](#stage-5-batch-translation).

## Data Structures

| Structure             | Purpose                        | Key fields                                                                                                                       |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `TranslationFile`     | File candidate for translation | `content`, `filename`, `path`, `sha`, `logger` — see [`translation-file.ts`](../src/app/services/translator/translation-file.ts) |
| `ProcessedFileResult` | Outcome per file               | `filename`, `branch`, `translation`, `pullRequest`, `pullRequestProgress`, `error`                                               |
| `RunnerState`         | In-memory workflow state       | `repositoryTree`, `filesToTranslate`, `processedResults`, optional `invalidPRsByFile`                                            |

Shared types: [`src/app/services/github/types.ts`](../src/app/services/github/types.ts), [`src/app/locales/types.ts`](../src/app/locales/types.ts). Runner-only types (`RunnerState`, dependencies): [`runner.types.ts`](../src/app/services/runner/runner.types.ts).

## Error Recovery

```mermaid
flowchart TD
    A[Per-file failure in batch] --> B[cleanupFailedTranslation]
    B --> C[Increment consecutiveFailures]
    C --> D{consecutiveFailures >= MAX_CONSECUTIVE_FAILURES?}
    D -->|Yes| E[Throw ApplicationError stop batches]
    D -->|No| F[Log error record ProcessedFileResult]
    F --> G[Next file]

    H[Failure inside run try block] --> I[Log + rethrow to main]

    P[Runner completes in main] --> Q[Log statistics + exit 0]
```

**Error handling strategy:**

- **Per file:** On failure after branch work, `cleanupFailedTranslation` deletes the translation branch when possible; the result is stored with `error` set; processing continues with the next file unless the circuit breaker trips.
- **Circuit breaker:** After `MAX_CONSECUTIVE_FAILURES` consecutive failures, `processFile` throws before starting the next file’s work. That rejection propagates through `Promise.all` in the current batch, so `processBatches` stops and **`run()` fails**; later batches are not processed.
- **Workflow-level:** `RunnerService.run()` wraps the body in `try`/`catch`, logs `Translation workflow failed`, then **rethrows** so `main` can exit with code `1`.

### Empty discovery (no files to translate)

When `FileDiscoveryManager.discoverFiles` returns zero files (for example every path already has a mergeable open PR, or language detection treats content as already translated), `fetchFilesToTranslate` logs at **info** and returns `false`. `RunnerService.run()` **does not** call `processInBatches`, then continues with `updateIssueWithResults` and `printFinalStatistics`.
