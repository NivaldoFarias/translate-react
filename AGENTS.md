# AGENTS.md

`translate-react` drafts translation PRs for `react.dev` locale forks. Drafts are for human review: passing every guard does not mean a translation is ready to merge.

Path-scoped standards live in `.claude/rules/` and load with the files they cover: TypeScript and JSDoc, tests, locales, the translator pipeline, GitHub Actions and the changelog.

## Working agreements

- Run `git commit`, `push`, rebase, or amend only when the user asks for it. "Append a commit" describes the end state you're aiming for. It isn't permission to commit.
- File GitHub issues when a skill's workflow calls for them (see `docs/agents/issue-tracker.md`). Track tech debt that needs design notes in issues with the `tech debt` label rather than in-code TODOs.
- Validate with `smoke.yml` dispatches (`gh workflow run smoke.yml`), not local `ci:smoke` runs: GitHub keeps the run history. `development` runs a free model. `production` runs the paid model that ships, so ask before dispatching there. Never trigger `workflow.yml` or `poll.yml` translation and never set `SCHEDULED_TRANSLATION_ENABLED`: real runs can open invalid PRs on `reactjs` locale repos.
- Keep `${{ vars.X }}` references in workflow YAML. When a variable's value is wrong or too low, tell the user to fix it in GitHub Settings.
- Prefer the smallest proven slice. Push back on speculative automation: locale-specific heuristic guards, guard-driven retries, automated maintainer remediation, pre-commit tooling (Husky, lint-staged, commitlint), coverage thresholds or Codecov. Investigate a post-incident fix before building a large layer for it.
- Write `.md` files when the user asks or a skill's workflow writes them (`GLOSSARY.md`, `docs/adr/`, `.wiki/` drafts). One-off explanations go in chat.
- Use `git mv` (or `mv` for untracked files) to move or rename a file without changing its content.
- Before opening a PR, run the `pre-pr-sweep` skill on the branch diff.

## Commits and PRs

- Use Conventional Commits: `<type>(<scope>): <description>`, imperative, lowercase, at most 72 characters, no trailing period, identifiers in backticks. Use a short bullet body for multi-part changes.
- Write messages the way you'd explain the change to a teammate. Skip "This commit..." and "In order to...". Add no `Co-authored-by` or other attribution trailers.
- Keep PR titles in Conventional Commits form, and follow `.github/PULL_REQUEST_TEMPLATE.md`.

## Branches and releases

- Start feature branches from `dev` and open PRs against `dev`. Dependabot also targets `dev`. Release PRs go `dev` → `main` as merge commits, not squashes. Land a Dependabot compatibility fix on the Dependabot branch itself. Rebase a stale Dependabot PR instead of trusting its inflated diff.
- `main` only accepts an up-to-date PR, so merge `main` into the release branch before the release PR. Issue-closing keywords work only in PRs to `main`: repeat them in the release PR, because PRs into `dev` leave their issues open.
- Add changelog entries under `## [Unreleased]` as work lands (the `generate-changelog` skill). Cut releases with the `generate-release` skill.
- Pushing changes under `.github/workflows/**` needs the `workflow` OAuth scope (`gh auth login -s workflow`).

## Architecture

- Use Bun as package manager and runtime. Before a PR, run `bun run lint`, `bun run format:check`, `bun run type-check` and `bun test`. For changes to the translator, runner or locales, the PR's CI runs `quick` smoke for each locale (real LLM, mocked GitHub): read its drafts before calling the PR ready, and rerun a job that failed on `429 Provider returned error`.
- `src/` has three runtimes: `app/` (translation CLI), `ci/` (GitHub Actions scripts) and `shared/`. `app` and `ci` never import each other, and `shared` imports neither. Organize by role (`services/`, `clients/`, `utils/`, `schemas/`, `constants/`, `actions/`), then by feature. Do not add buckets like `lib/`, `entries/` or `domain/`.
- Wire service singletons only in `src/app/composition.ts`. `github/` and `locales/` never import from `services/runner/`; shared workflow types live in each service's `types.ts`.
- Errors: throw `ApplicationError` (with `ErrorCode`) for domain failures and rethrow it unchanged. Let library errors bubble up. `main.ts` handles them at the top level. When a budget or limit causes the failure (retries, circuit breaker, token cap), name the constant and its value in the message or `metadata`.
- Log with the Pino logger and structured fields: `logger.debug({ filename }, "Processing file")`. Log a caught error under the `error` key, where the logger strips headers, request and response, or spread `toSafeErrorLogFields(error)`.
- Before writing a custom implementation of chunking, parsing, retry, caching, date handling or token counting, check for an existing library.
- Keep user-facing copy and docs direct and human. Use colons or separate sentences, not em-dash chains. Operational docs belong on the GitHub Wiki (drafts in `.wiki/`, published with the `sync-wiki` skill). The repo keeps README, CONTRIBUTING, SECURITY and CHANGELOG.

## Gotchas

- With Octokit v22, `octokit.paginate` needs REST route strings (`GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews`). Method references throw `route.endpoint is not a function`.
- GitHub Actions and blank `.env` entries pass `""`, which bypasses Zod `.default()`. Handle defaults in the env schema (`emptyEnvValueToUndefined`), not with workflow expression fallbacks.
- TypeScript is split in two: `tsc` 7 comes from `@typescript/native` for type-checking, and `typescript@6.0.3` is a runtime dependency for fence parsing and `typescript-eslint`. TS 7 has no programmatic compiler API.
- A 403 from the GitHub App on upstream progress comments or locale-fork PR PATCHes is expected. The runner falls back to the operator PAT.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `NivaldoFarias/translate-react`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
