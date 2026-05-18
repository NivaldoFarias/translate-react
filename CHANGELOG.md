# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

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
- `docs/WORKFLOW.md`: [Local LLM workflow smoke](docs/WORKFLOW.md#local-llm-workflow-smoke) section and ToC entry.

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

[0.1.27]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.27
[0.1.26]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.26
[0.1.25]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.25
[0.1.24]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.24
