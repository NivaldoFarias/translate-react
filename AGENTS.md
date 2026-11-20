# AGENTS.md

`translate-react` drafts translation PRs for `react.dev` locale forks. Drafts are for human review: passing every guard does not mean a translation is ready to merge.

MUST/SHOULD carry their [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) meaning.

## Working agreements

- Run `git commit`, `push`, rebase, or amend only when the user asks for it. "Append a commit" describes the end state you're aiming for. It isn't permission to commit.
- Commit messages and PR bodies carry no `Co-authored-by` or other attribution trailers.
- Do not create GitHub issues unless the user asks. Outline follow-up work in chat and let the user decide what to file. Track tech debt that needs design notes in issues with the `tech debt` label rather than in-code TODOs.
- Leave real GitHub Actions runs (`gh workflow run`) to the user unless they ask you to start one. A plan step that needs a real run stays a manual step.
- Keep `${{ vars.X }}` references in workflow YAML. When a variable's value is wrong or too low, tell the user to fix it in GitHub Settings.
- Prefer the smallest proven slice. Push back on speculative automation: locale-specific heuristic guards, guard-driven retries, automated maintainer remediation, pre-commit tooling (Husky, lint-staged, commitlint), coverage thresholds or Codecov. Investigate a post-incident fix before building a large layer for it.
- Write `.md` files only when the user asks, or when a skill's workflow writes them (`GLOSSARY.md`, `docs/adr/`). Explanations go in chat.
- Use `git mv` (or `mv` for untracked files) to move or rename a file without changing its content.

## Branches and releases

- Start feature branches from `dev` and open PRs against `dev`. Dependabot also targets `dev`. Release PRs go `dev` → `main` as merge commits, not squashes.
- Changelog entries go under `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog). Write each entry outcome-first, for operators, React docs maintainers, and contributors. Never hand-write a versioned heading: `bun run release:prepare` promotes `[Unreleased]` and bumps the version, and `ci:verify-changelog` enforces the format.
- Pushing changes under `.github/workflows/**` needs the `workflow` OAuth scope (`gh auth login -s workflow`).

## Code standards

- Use Bun as package manager and runtime. Before a PR, run `bun run lint`, `bun run format:check`, `bun run type-check` and `bun test`.
- Changes under `src/app/services/translator/`, `src/app/services/runner/` or `src/app/locales/` also need `bun run ci:smoke -- --profile quick` (real LLM, mocked GitHub, output in `artifacts/smoke/`).
- `src/` has three runtimes: `app/` (translation CLI), `ci/` (GitHub Actions scripts) and `shared/`. `app` and `ci` never import each other, and `shared` imports neither. Organize by role (`services/`, `clients/`, `utils/`, `schemas/`, `constants/`, `actions/`), then by feature. Do not add buckets like `lib/`, `entries/` or `domain/`.
- Wire service singletons only in `src/app/composition.ts`. `github/` and `locales/` never import from `services/runner/`; shared workflow types live in each service's `types.ts`.
- Errors: throw `ApplicationError` (with `ErrorCode`) for domain failures and rethrow it unchanged. Let library errors bubble up. `main.ts` handles them at the top level. When a budget or limit causes the failure (retries, circuit breaker, token cap), name the constant and its value in the message or `metadata`.
- Log with the Pino logger and structured fields: `logger.debug({ filename }, "Processing file")`. Use `toSafeErrorLogFields()` instead of raw `{ error }` so request headers stay out of logs.
- Name the runtime `const` and its derived `type` differently: `POST_TRANSLATION_GUARD_IDS` / `PostTranslationGuardId`. Use named interfaces for known-shape data, normal `.ts` files instead of `*.d.ts` for internal types, and existing library types (remark/mdast/unist, Octokit) over parallel custom ones. Fix a type at its root, with a type guard rather than casts.
- Before writing a custom implementation of chunking, parsing, retry, caching, date handling or token counting, check for an existing library.
- JSDoc every exported symbol (ESLint enforces it). Keep JSDoc and user-facing copy direct and human. Use colons or separate sentences, not em-dash chains, and write a literal `...`.
- Tests: mock at service boundaries with typed factories that return production types, and keep any DI cast in a single test harness. Cover diverse, realistic failure modes rather than near-duplicate cases.

## Translation policy

- Post-translation guards live under `translator/validation/` and are declared in `validation.constants.ts`. A new guard is advisory by default. Blocking is reserved for unusable output (empty content, broken headings, wild length ratio). Guards run once after a single LLM pass; advisory failures become `reviewerNotices` on the PR.
- Locale terminology and style stay prompt-only in `src/app/locales/<lang>/rules.ts`; `locale.ts` is wiring only. A deterministic, production-observed locale glitch goes in that locale's `repairs/` module (`constants.ts`, `definition.ts`, `index.ts`, registered in `repairs/registry.ts`). A language-agnostic defect goes in the shared `translation-output-cleanup.ts` pass.
- A new locale needs the full module layout (CI enforces it), an entry in `locales/registry.ts` and `repairs/registry.ts`, and a row in `.github/locales.json` (a parity spec checks it).

## Gotchas

- With Octokit v22, `octokit.paginate` needs REST route strings (`GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`). Method references throw `route.endpoint is not a function`.
- GitHub Actions and blank `.env` entries pass `""`, which bypasses Zod `.default()`. Handle defaults in the env schema (`emptyEnvValueToUndefined`), not with workflow expression fallbacks.
- A job that uses a local composite action (`uses: ./.github/actions/...`) must run `actions/checkout` first in that same job.
- Bun `mock.module` leaks across test files. Keep `language-detector.service-cld-failure.spec.ts` sorted after `language-detector.service.spec.ts`.
- TypeScript is split in two: `tsc` 7 comes from `@typescript/native` for type-checking, and `typescript@6.0.3` is a runtime dependency for fence parsing and `typescript-eslint`. TS 7 has no programmatic compiler API.
- A 403 from the GitHub App on upstream progress comments or locale-fork PR PATCHes is expected. The runner falls back to the operator PAT.
- Segment JSON parse failures in smoke runs often come from `LLM_MODEL`. Check that the dev and production environment models match before changing the parser or retries.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `NivaldoFarias/translate-react`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
