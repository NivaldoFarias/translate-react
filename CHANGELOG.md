# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-05-31

### Changed

- Refreshed Changelog's links to the project wiki.
- Removed mentions to local, gitignored files.

## [0.2.0] - 2026-05-31

### Added

- Upstream SHA polling: [`.github/workflows/poll.yml`](./.github/workflows/poll.yml), [`.github/upstream-locales.json`](./.github/upstream-locales.json), `ci:poll-upstream`, and `ci:resolve-matrix` so translation runs only when `reactjs/<lang>.react.dev` default branch changes.
- Repository variables `UPSTREAM_SHA_<LANG>` updated after each successful locale job.
- Source layout: `src/app/` (translation CLI), `src/ci/` (Actions helpers), `src/shared/` (errors, logger factory, bare Octokit); ESLint import boundaries between runtimes.
- Phase 5 layout: `schemas/`, `constants/`, `ci/actions/` entry scripts; `citty` for `ci:resolve-matrix --langs`; workflow types colocated in `services/github/types.ts`, `services/runner/types.ts`, `locales/types.ts`.
- [Project wiki](https://github.com/NivaldoFarias/translate-react/wiki): Workflow (run order, polling, forks), Codebase (layout and services), Configuration, For React Docs Maintainers, and FAQ.

### Changed

- [`.github/workflows/workflow.yml`](./.github/workflows/workflow.yml) is reusable (`workflow_call`) with a `prepare-matrix` job; matrix rows come from the locale registry instead of hard-coded YAML.
- **Breaking (contributors):** app env at `src/app/schemas/env.schema.ts`, CI env at `src/ci/schemas/env.schema.ts`, constants at `src/app/constants/` and `src/shared/constants/`; `ci:*` scripts point to `src/ci/actions/`; dissolved `app/domain/workflow/`.
- `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` point to the wiki for workflow, configuration, and layout; env variable tables removed from the README.
- Translation PR bodies link to the maintainer wiki page instead of the runner new-issue chooser tip.

### Removed

- `ci:smoke-llm` npm script and tracked `src/ci/smoke-llm.ts` (gitignored local-only dev helper; use integration tests instead).
- In-repo `docs/WORKFLOW.md`, `docs/ARCHITECTURE.md`, and `docs/PROJECT_STRUCTURE.md` (superseded by the wiki).

## [0.1.30] - 2026-05-26

### Added

- `src/domain/workflow/` shared types (`workflow.types`, `pull-request.types`) decoupled from runner
  imports; `composition.ts` wires service singletons.
- Translator pipeline split: `TranslationLlmClient`, `TranslationPromptBuilder`,
  `TranslationPipelineManager`, `TranslationFile`, and `markdown/` helpers (`artifacts`,
  `frontmatter`, `markdown.regexes`).
- Post-translation validation under `translator/validation/`: `PostTranslationValidationService`,
  pluggable guards (frontmatter, headings, fence identifiers, non-empty content), and
  `fence-code-identifier.analyzer`.
- `postprocess/` (`chunk-reassembly`, `translation-output-cleanup`) for assembled chunk output.
- `isCompletionLengthTruncationError` in `error.helpers.ts` for truncated LLM completions (including
  when wrapped in `AbortError`).
- Specs for LLM client, pipeline manager, chunk reassembly, validation guards/analyzer, and
  `translation-file`; tests mirrored to the new `src/` layout.

### Changed

- Remove `src/services/index.ts` barrel; import domain and service modules directly.
- Runner `managers/` → `workflow/`; translator `managers/` → `chunking/`; extract
  `TranslationLlmClient` and group markdown helpers.
- `github/` and `locales/` no longer import runner types; use `@/domain/workflow/`.
- `OpenRouterModelLimitsService` injected via `composition.ts` and `TranslatorService` DI.
- `CommentBuilderService`: deduplicate progress-issue filtering via `buildReportableComment`.
- Throw `InsufficientPermissions` when the GitHub token scope check fails.
- Drop dead `RATIOS` alias, `ChunkTranslationMode` enum, and unused validator code.
- `docs/ARCHITECTURE.md`, `docs/PROJECT_STRUCTURE.md`, `docs/WORKFLOW.md`, and `README.md` updated
  for the new module layout; `eslint.config.mjs` path rules aligned with `src/`.

## [0.1.29] - 2026-05-19

### Added

- `TranslationPullRequestValidityManager`: skip translation when an open `translate/…` PR has
  target-language fork content and is in sync with its base.
- `getTranslationBranchNameFromPath` (`translation-branch.util.ts`) and
  `GitHubContent.getForkFileContentAtBranch` for fork reads on translation branches.
- `PullRequestProgressAction` on `ProcessedFileResult`; `selectProgressCommentPayload` /
  `filterReportableProgressCommentResults` so progress-issue comments list only PRs opened in the
  current run.
- `ProgressCommentRunContext` and locale `comment.prefix` callbacks (`pt-br`, `ru`) for
  CI-aware translation-progress issue openers.
- Fixture `tests/fixtures/md/use-memo.md`; specs for validity manager, progress comment util,
  `github-actions-run.util`, and extended batch / discovery / GitHub service tests.

### Changed

- `FileDiscoveryManager.filterByPRs`: per-path branch validation via validity manager instead of
  bulk PR file-list mapping.
- `TranslationBatchManager`: reset `translate/…` branches to a single commit before
  translate/commit; close open PRs before reset; reuse valid open PRs without re-translating.
- `CommentBuilderService.buildComment`: document and filter to newly created PRs only.
- Translation-progress issue comments: branch or tag ref and linked workflow run in the opening
  line; drop `formatGithubActionsRunIssueLine` footer.
- `resolveGitHubActionsRunContext`: resolve `refLabel` from `GITHUB_REF` / `GITHUB_REF_NAME`.
- Actions workflow: pass `github.ref` and `github.ref_name` into `.env` for the translation step.
- Integration workflow spec: separate small (`use-memo.md`) and medium (`hydrateRoot.md`) runs.

## [0.1.28] - 2026-05-18

### Added

- `translator-frontmatter-batch.schema` and `callLanguageModelFrontmatterBatch`: translate
  frontmatter `description` in one structured LLM completion via `zodResponseFormat` (metadata pass
  no longer includes `title`).
- `leadingNewlineRunLength` export and `normalizeBodyAfterFrontmatterMerge` to preserve body
  spacing after frontmatter merge.
- Tests: `translation-batch.manager`, `file-discovery.manager`, passthrough chat-completions mock,
  and extended translator / frontmatter specs.

### Changed

- `LanguageDetectorService`: apply minimum length to cleaned prose before CLD.
- `FileDiscoveryManager`: cache detected language when the file is already translated.
- PR body: shorter conflict notice copy and placement in `pr-body.builder` and `pt-br` / `ru`
  locales; normalize WIP wording in locale strings.
- Actions workflow: remove `tool_ref` dispatch input; checkout uses `github.ref` for branches and
  tags; `docs/WORKFLOW.md` drops the pinning section.
- `logger.util`: honor `LOG_TO_CONSOLE` for pretty transport in all environments.
- `locale.service.spec`: remove hanging unit test for PR `mergeable_state` in conflict notice.

### Fixed

- `GitHubContent.getFile`: read source markdown from upstream default branch via `repos.getContent`
  instead of fork `git.getBlob`, so existing `translate/...` translations are not re-used as input.
- `filterByPRs` / `getPullRequestFiles`: retry PR file lists and fail discovery when mapping is
  unreliable; `TranslationBatchManager` skips translate/commit when a mergeable open PR already
  exists for the path.

## [0.1.27] - 2026-05-18

### Fixed

- `CHANGELOG.md`: add the missing `[0.1.26]` release reference link at the bottom so version anchors
  match the other shipped releases.

## [0.1.26] - 2026-05-18

### Added

- `buildRunnerNewIssueChooserUrl` / `resolveRunnerNewIssueChooserUrl`
  (`src/utils/runner-issue-chooser-url.util.ts`): resolve a GitHub new-issue chooser URL for runner
  feedback, with `WORKFLOW_RUNNER_REPOSITORY_HTML_BASE` fallback; covered by
  `tests/utils/runner-issue-chooser-url.util.spec.ts`.
- PR body: translation model line, metric footnotes, and a feedback tip; locale stats `notes` /
  `feedbackTip` in `locale.types`, `pr-body.builder`, and `pt-br` / `ru` locales; extended
  `locale.service` PR body tests.
- `TranslationBatchManager` / runner base: pass `translationModel` and `newIssueChooserUrl` into PR
  metadata.

### Changed

- `TranslatorService`: chunk translation always runs in parallel; remove `CHUNK_TRANSLATION_MODE`
  from the environment schema and defaults (`env.util`, `constants.util`).
- README: minor setup copy tweaks.

## [0.1.25] - 2026-05-18

### Added

- `bun run smoke:llm-workflow` (`src/scripts/llm-workflow-smoke.ts`): one-shot run with real
  `translatorService` / LLM and mocked GitHub; loads every `tests/fixtures/md/*.md` (same helper as
  integration tests) and writes artifacts under `.out/` for review.
- `.gitignore`: ignore `.out/` (smoke and local inspection output).
- Markdown fixture `tests/fixtures/md/hydrateRoot.md` for integration smoke and specs.
- `docs/WORKFLOW.md`: Local LLM workflow smoke section and ToC entry.

### Changed

- Translator ([#15](https://github.com/NivaldoFarias/translate-react/pull/15), squash `smoke` → `dev`,
  [`9bb9c27`](https://github.com/NivaldoFarias/translate-react/commit/9bb9c27459f1dbe111d7f0b8c154004eabb0755b)):
  resolve document source language once on full-file markdown (after optional verbatim fence masking)
  before chunking; `TranslationFile` accepts optional `documentSourceLanguage`, exposes it in
  `getLogContext()`, and uses it for chunked and non-chunked LLM prompts.
- `LanguageDetectorService.detectPrimaryLanguage`: on CLD failure, log at `warn`, return `"en"` for
  prompts, and document alignment with full-file detection in `TranslatorService`.
- Integration harness: `tests/integration/create-integration-runner.ts` refactored so smoke script and
  `workflow.integration.spec.ts` share fixture loading and in-memory GitHub wiring; related test and
  mock updates.
- `docs/PROJECT_STRUCTURE.md`: note that `tests/fixtures/md/` backs smoke runs and specs.
- `GitHubContent.getFile`: clarify JSDoc `@returns` for `TranslationFile`.

## [0.1.24] - 2026-05-13

### Added

- `CHANGELOG.md`; release steps in `docs/WORKFLOW.md`.
- `CONTRIBUTING.md`, `SECURITY.md`.
- Actions: `tool_ref` input; workflow `permissions`; maintainer settings checklist in `docs/WORKFLOW.md`.
- CI: `bun -e` in `lint-and-typecheck` asserts `CHANGELOG.md` has a `## [version]` heading for `package.json` `version`.
- OpenRouter: `GET /v1/models` metadata via `OpenRouterModelLimitsService` (`src/services/openrouter/`) to size chunk inputs and align `max_tokens` with provider completion caps.

### Changed

- OpenRouter defaults documented (`HEADER_*` from `package.json`); see README and `src/utils/constants.util.ts`.
- Actions Bun default `1.3` (override with repo variable `BUN_VERSION`); `engines.bun` in `package.json`.
- OpenRouter models list: Zod types aligned with OpenRouter `ModelsListResponse` / `Model` in `openrouter.schemas.ts`; README footnote links to the [get-models](https://openrouter.ai/docs/api/api-reference/models/get-models) API reference.
- Removed unused `TOKEN_COUNT_MODE` / `LOG_MAX_STRING_LENGTH` defaults from the environment schema surface (they were never read).

### Fixed

- README `MAX_RETRY_ATTEMPTS` default matches `src/utils/constants.util.ts` (`3`).

[0.2.0]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.0
[0.1.30]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.30
[0.1.29]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.29
[0.1.28]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.28
[0.1.27]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.27
[0.1.26]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.26
[0.1.25]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.25
[0.1.24]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.24
