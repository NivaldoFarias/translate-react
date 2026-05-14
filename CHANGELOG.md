# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- CI: `bun -e` in `lint-and-typecheck` asserts `CHANGELOG.md` has a `## [version]` heading for `package.json` `version`.
- OpenRouter: `GET /v1/models` metadata via `OpenRouterModelLimitsService` (`src/services/openrouter/`) to size chunk inputs and align `max_tokens` with provider completion caps.

### Changed

- OpenRouter models list: Zod types aligned with OpenRouter `ModelsListResponse` / `Model` in `openrouter.schemas.ts`; README footnote links to the [get-models](https://openrouter.ai/docs/api/api-reference/models/get-models) API reference.
- Removed unused `TOKEN_COUNT_MODE` / `LOG_MAX_STRING_LENGTH` defaults from the environment schema surface (they were never read).

## [0.1.24] - 2026-05-13

### Added

- `CHANGELOG.md`; release steps in `docs/WORKFLOW.md`.
- `CONTRIBUTING.md`, `SECURITY.md`.
- Actions: `tool_ref` input; workflow `permissions`; maintainer settings checklist in `docs/WORKFLOW.md`.

### Changed

- OpenRouter defaults documented (`HEADER_*` from `package.json`); see README and `src/utils/constants.util.ts`.
- Actions Bun default `1.3` (override with repo variable `BUN_VERSION`); `engines.bun` in `package.json`.

### Fixed

- README `MAX_RETRY_ATTEMPTS` default matches `src/utils/constants.util.ts` (`3`).

[0.1.24]: https://github.com/NivaldoFarias/translate-react/releases/tag/v0.1.24
