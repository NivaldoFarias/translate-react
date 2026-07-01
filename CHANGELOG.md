# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Segment batches pack at most 20 prose segments per LLM request (down from 40), reducing structured JSON parse failures and split retries on segment-heavy pages.
- Quick `ci:smoke` profile includes `invalid-hook-call-warning.md` as a structured-output stress fixture.
- Segment batch failures from truncated output, id mismatch, or malformed JSON now split the batch on the first error instead of repeating the same LLM call through `p-retry`, reducing wasted retries and LLM cost.
- Manual `smoke.yml` dispatch selects fixtures by profile only; the `files` input is removed.
- GitHub Actions smoke packs `.out/` into `artifacts/smoke/<profile>-<run_id>.tar.gz` before upload (because `upload-artifact` skips hidden dot-directories) and uses `archive: false` so downloads extract with one `tar -xzf`, not zip then tar.
- `ci:smoke` artifact capture writes `pull-request.md` when the runner refreshes an open pull request, not only on new PR creation.
- Advisory validation on translation pull requests inlines the guard id and violation tally on each `###` heading, uses `####` line anchors one level below, and fences violation snippets in `markdown` code blocks so sample headings do not render as PR content.
- Release history bullets rewritten for outcome-first, reader-facing prose.

### Fixed

- Full-body LLM calls with provider `finishReason: "error"` no longer pass as success; truncated or malformed output fails and retries instead of reaching guards with misleading `contentRatio` blocks.
- Glued inline code, MDX slug comments, and adjacent markdown links are repaired before advisory validation so those mechanical spacing regressions no longer surface as `mdxSpacing` reviewer notices on translation pull requests.
- Blank `TARGET_LANGUAGE` or `SOURCE_LANGUAGE` from GitHub Actions or `.env` no longer fails validation; empty values default to `pt-br` and `en`.

## [0.2.9] - 2026-06-22

### Added

- Post-translation validation now blocks PRs when heading syntax, heading count, or MDX slug comments (`{/*slug*/}`) drift from the source; additional advisory checks cover MDX spacing, sentence-case headings, and extra markdown links.
- Upstream refresh and maintainer-remediation runs reuse the open translation pull request and branch instead of closing and recreating them.
- `ci:smoke` runs the full translation workflow against real LLM calls with mocked GitHub (`quick`, `workflow`, and `full` profiles); [`.github/workflows/smoke.yml`](./.github/workflows/smoke.yml) supports manual dispatch.

### Changed

- Segment reinsert no longer glues prose, links, or slug comments: boundary whitespace is preserved during cleanup.
- Segment batches are smaller (40 items max) and cap estimated JSON completion tokens to reduce truncation.
- Translation PR advisory warnings use GitHub-style `L{N}` / `L{N}-L{M}` line anchors, grouped in `<details>` sections per guard.
- Russian translation PR bodies label all advisory and structural guard findings (parity with `pt-br`).

### Fixed

- Translated headings no longer get duplicated `##` markers when the model echoes markdown syntax in heading text.
- Maintainer remediation keeps an open pull request when an approved review is already present (no unnecessary branch close).

### Removed

- Gitignored local `smoke-llm` script; use tracked `ci:smoke` instead.

## [0.2.8] - 2026-06-16

### Added

- Markdown body translation runs segment-by-segment by default (prose, link labels, fence comments, and MDX string attributes), with automatic fallback to full-document translation when parsing or batching fails.
- Segment batch failures retry only missing segments (up to three rounds) before wider fallback.

### Changed

- Maintainer remediation follows unresolved `CHANGES_REQUESTED` pull request reviews after the latest runner commit; issue comments no longer invalidate open PRs. Review summaries and inline comments feed the re-translation prompt.
- Translation PR bodies open with a human-review notice, link the maintainer wiki in a `[!TIP]` callout, and group advisory warnings by validator in collapsible sections with per-violation diffs.
- Verbatim fence masking applies only on the legacy full-body fallback path.
- CI reports test coverage via `bun run test:coverage`.
- Legacy full-body translation APIs (`extractSegments`, `buildMarkdownDocumentSystemPrompt`, `translateWithChunking`) are deprecated; used only by fallback.

### Fixed

- MDX-heavy pages stay on the segment path: extraction no longer runs on masked placeholder text from `MASK_VERBATIM_LARGE_FENCES`.

### Removed

- Exploratory segment spike modules and their production exports.

## [0.2.7] - 2026-06-05

### Added

- Post-translation validation blocks PRs when static JSX demo text inside fenced code is translated; advisory findings ship on the PR with maintainer-facing hints.
- Blocking vs advisory guard outcomes are separated: only `contentRatio` and `nonEmptyContent` stop the workflow; other guard failures still open or update the PR with warnings.
- Per-file and run-level LLM usage totals (tokens and OpenRouter cost when available).

### Fixed

- Maintainer-feedback PR checks work on Octokit v22 (discovery and batch no longer fail with `route.endpoint is not a function`).

### Changed

- Maintainer-feedback re-translations refresh the open pull request body, including advisory guard hints.
- Post-translation validation uses a single LLM pass; guard failures no longer trigger extra LLM retries.
- `markdownLinksPreserved` and `fenceFunctionIdentifiers` list every violation in PR hints (no arbitrary caps).
- Translation PR bodies drop operator stats blocks; model, token, and ratio metadata log at `debug` when the PR is built.
- Translation-progress issue comments separate **created** and **updated** pull requests.
- Translation workflow concurrency is per matrix locale: a new run cancels only the in-flight job for that locale.
- Poll workflow no longer cancels an in-progress upstream SHA check when another poll starts on the same ref.
- GitHub Actions: `actions/cache` v5; CI Bun default `1.3.14` (override with `BUN_VERSION`).
- Wiki: locale onboarding checklist, concurrency policy, and parallel matrix capacity guidance.

### Removed

- `git-cliff`, `cliff.toml`, and `release:draft`; releases use curated `## [Unreleased]` entries only.
- Guard-driven LLM retry hints from translation attempt context and prompts.

## [0.2.6] - 2026-06-04

### Added

- Open translation PRs are invalidated and re-translated when a maintainer comments after the latest runner commit; feedback is included in the LLM prompt on the existing branch.
- `pt-br` locale rules: fenced-code policy, maintainer terminology, sentence-case headings, and link preservation.
- Post-translation guards for markdown link integrity and content length ratio (70%–140% of source).

### Fixed

- Unknown `TARGET_LANGUAGE` values fail fast instead of silently falling back to `pt-br`.
- Language detection respects per-instance source and target configuration.

### Changed

- CI enforces parity between `.github/locales.json` and registered locales.

## [0.2.5] - 2026-06-02

### Changed

- Dependabot targets `dev` instead of `main`.
- Updated `p-retry`, GitHub Actions (`checkout`, `create-github-app-token`, `upload-artifact`), and dev tooling (`eslint` 10, `typescript` 6, `typescript-eslint` 8.60).

### Fixed

- Bun test preload path in `bunfig.toml` after dependency upgrades.

## [0.2.4] - 2026-06-02

### Changed

- Clearer prose in `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` (colons and plainer link text replace em-dash glue).

## [0.2.3] - 2026-06-02

### Added

- Content-ratio post-translation guard with retry metadata on translation PRs.
- Release tooling (`release:prepare`) and `release.yml` to tag and publish on merge to `main`.

### Changed

- Translation-progress comments link to the workflow run and release.

### Fixed

- Polled matrix JSON passes correctly through `workflow.yml`.
- Blank OpenRouter metadata env vars no longer fail validation.

## [0.2.2] - 2026-06-01

### Added

- `setup-bun-deps` composite action and `ci:verify-changelog`.
- Translation CLI flags for matrix locale and fork/upstream repos (`--lang`, fork/upstream flags).
- Workflow job timeouts; log artifacts retained 30 days.
- GitHub Sponsors, Dependabot, issue forms, PR template, `CODEOWNERS`, and `CODE_OF_CONDUCT.md`.

### Changed

- Locale registry renamed to `.github/locales.json`.
- Workflows use composite setup, shallow checkout, CLI-driven matrix, and step-scoped secrets.
- Poll jobs can invoke reusable workflows (`actions: write`).
- Translation workflow concurrency groups by event and ref.
- `README.md` adds tagline, badges, How it works, and Sponsor section.

## [0.2.1] - 2026-05-31

### Changed

- Changelog and docs link to the project wiki instead of gitignored local paths.

## [0.2.0] - 2026-05-31

### Added

- Upstream SHA polling runs translation only when `reactjs/<lang>.react.dev` changes ([`poll.yml`](./.github/workflows/poll.yml), [`locales.json`](./.github/locales.json), `ci:poll-upstream`, `ci:resolve-matrix`).
- Repository variables `UPSTREAM_SHA_<LANG>` update after each successful locale job.
- [Project wiki](https://github.com/NivaldoFarias/translate-react/wiki) for workflow, configuration, codebase layout, and maintainer guidance.

### Changed

- Translation workflow is reusable (`workflow_call`); matrix rows come from the locale registry.
- **Breaking (contributors):** source layout under `src/app/`, `src/ci/`, and `src/shared/` with import boundaries; env schemas and `ci:*` entry scripts moved accordingly.
- `README.md`, `CONTRIBUTING.md`, and `SECURITY.md` point to the wiki; env tables removed from the README.
- Translation PR bodies link to the maintainer wiki page.

### Removed

- `ci:smoke-llm` script (use integration tests or later `ci:smoke`).
- In-repo `docs/WORKFLOW.md`, `docs/ARCHITECTURE.md`, and `docs/PROJECT_STRUCTURE.md` (superseded by the wiki).

## [0.1.30] - 2026-05-26

### Added

- Pluggable post-translation validation (frontmatter, headings, fence identifiers, non-empty content).
- Translator pipeline split into focused services (LLM client, prompt builder, pipeline manager, markdown helpers).
- Truncated LLM completion detection for safer retry handling.

### Changed

- Module layout under `src/` with runner `workflow/`, translator `chunking/`, and shared workflow types decoupled from runner imports.
- GitHub token scope failures surface as `InsufficientPermissions`.
- Docs updated for the new layout.

## [0.1.29] - 2026-05-19

### Added

- Skip re-translation when an open `translate/…` PR is in sync and already in the target language.
- Translation-progress issue comments list only PRs opened in the current run.
- Locale-aware progress comment prefixes for `pt-br` and `ru`.

### Changed

- File discovery validates each path individually instead of bulk PR file-list mapping.
- `translate/…` branches reset to a single commit before re-translating; valid open PRs are reused without re-translation.
- Translation-progress comments show branch or tag ref and linked workflow run.
- Actions workflow passes `github.ref` and `github.ref_name` into the translation step.

## [0.1.28] - 2026-05-18

### Added

- Frontmatter `description` translates in one structured LLM call (`title` stays unchanged).
- Body spacing preserved after frontmatter merge.

### Changed

- Language detection applies minimum length to cleaned prose before CLD.
- Already-translated files cache detected language during discovery.
- Shorter conflict notice copy in translation PR bodies.
- Actions checkout uses `github.ref`; `tool_ref` dispatch input removed.
- `LOG_TO_CONSOLE` enables pretty logging in all environments.

### Fixed

- Source markdown reads from upstream default branch, not fork blob tips (prevents re-translating existing fork content as input).
- Discovery retries unreliable PR file lists; skips translate/commit when a mergeable open PR already exists.

## [0.1.27] - 2026-05-18

### Fixed

- Missing `[0.1.26]` release footer link in `CHANGELOG.md`.

## [0.1.26] - 2026-05-18

### Added

- Translation PR bodies show model, metric footnotes, and a feedback tip.
- Feedback links resolve to the runner new-issue chooser.

### Changed

- Chunk translation always runs in parallel; `CHUNK_TRANSLATION_MODE` env var removed.

## [0.1.25] - 2026-05-18

### Added

- `smoke:llm-workflow` script: one-shot real-LLM run with mocked GitHub; artifacts under `.out/`.
- `hydrateRoot.md` fixture for integration and smoke runs.

### Changed

- Document source language is detected once on full-file markdown before chunking, improving prompt accuracy.
- CLD failures log a warning and default to `"en"` for prompts.
- Smoke script and integration tests share fixture loading and in-memory GitHub wiring.

## [0.1.24] - 2026-05-13

### Added

- `CHANGELOG.md`, `CONTRIBUTING.md`, and `SECURITY.md`.
- CI verifies `CHANGELOG.md` matches `package.json` version.
- OpenRouter model metadata sizes chunk inputs and aligns `max_tokens` with provider caps.

### Changed

- OpenRouter defaults documented in README.
- Actions Bun default `1.3` (override with `BUN_VERSION`).
- Unused `TOKEN_COUNT_MODE` and `LOG_MAX_STRING_LENGTH` env defaults removed.

### Fixed

- README `MAX_RETRY_ATTEMPTS` default matches runtime (`3`).

[0.2.9]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.9
[0.2.8]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.8
[0.2.7]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.7
[0.2.6]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.6
[0.2.5]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.5
[0.2.4]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.4
[0.2.3]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.3
[0.2.2]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.2
[0.2.1]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.1
[0.2.0]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.2.0
[0.1.30]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.30
[0.1.29]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.29
[0.1.28]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.28
[0.1.27]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.27
[0.1.26]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.26
[0.1.25]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.25
[0.1.24]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.24
