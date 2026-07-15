# Contributing

MIT. Not a hosted app: forks use their own API keys and Actions config.

- Bun only (`bun install`, `bun run …`); see `engines` in [`package.json`](./package.json).
- TypeScript strict; match patterns in [`src/`](./src/).
- Layout and services: [Wiki: Codebase](https://github.com/NivaldoFarias/translate-react/wiki/Codebase); run order: [Wiki: Workflow](https://github.com/NivaldoFarias/translate-react/wiki/Workflow). App wiring: [`src/app/composition.ts`](./src/app/composition.ts).
- Tests: `bun test` (or `bun run test:coverage` locally); CI runs coverage. Mirror `src/` paths under `tests/`; mock GitHub and LLM.
- Changes under `src/app/services/translator/`, `src/app/services/runner/`, or `src/app/locales/` trigger a required `ci.yml` smoke gate that runs `ci:smoke -- --profile quick --lang pt-br` (real LLM, mocked GitHub) before merge; other configured locales run as optional matrix jobs that do not block merge. Run locally first with `bun run ci:smoke -- --profile quick --lang <locale>` to catch issues before pushing. See [Workflow smoke](#workflow-smoke) for outputs and CI artifacts.
- Before push: `bun run lint`, `bun run format`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `chore`, `refactor`; optional scope).
- Changelog: accumulate entries under `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md) as you work. Never hand-write a `## [X.Y.Z]` heading or bump `version` outside the release flow below; CI fails a bumped version whose section lacks a date, footer link, or entries.
- Docs: [Wiki](https://github.com/NivaldoFarias/translate-react/wiki). [`CHANGELOG.md`](./CHANGELOG.md), [`SECURITY.md`](./SECURITY.md) stay in the repo.
- Adding a production locale: follow the [wiki checklist](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#adding-a-locale) (registry, `LocaleService`, parity test, fork secrets, dry run).
- Automated PRs are drafts and need manual validation on locale repos. Mention this repo’s version when debugging a run.

## Workflow smoke

Profiles, CLI flags, and when CI runs smoke: [README: Smoke runs](./README.md#smoke-runs). Fixture lists: [`smoke-profiles.util.ts`](./src/ci/services/smoke/smoke-profiles.util.ts).

Local runs and manual [`smoke.yml`](./.github/workflows/smoke.yml) dispatch write into gitignored `artifacts/smoke/`. Each fixture gets a subdirectory (for example `use-memo/`) with `translated.md` and `pull-request.md`. When the run posts progress, `translation-progress-issue-comment.md` sits at the `artifacts/smoke/` root. Override the directory with `--out-dir`/`-o` or `SMOKE_OUTPUT_DIR`.

CI smoke jobs and `smoke.yml` upload that tree as a standard zip artifact. Download with:

```bash
gh run download <run_id> --dir artifacts/smoke/<run_id>
```

## Investigating workflow runs

| Artifact                             | Workflow                    | When uploaded                               |
| ------------------------------------ | --------------------------- | ------------------------------------------- |
| `artifacts/smoke/` (fixture outputs) | `ci.yml` smoke, `smoke.yml` | Always                                      |
| `logs/` (Pino file logs)             | `workflow.yml` translation  | Always (`translation-logs-<lang>-<run_id>`) |

Use `gh run download <run_id> --dir artifacts/smoke/<run_id>` for smoke outputs. For translation logs, download the `translation-logs-*` artifact the same way (extracted tree includes `logs/`).

If `gh run view --log` returns empty, fetch per-job logs via the REST API:

```bash
mkdir -p logs
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh run view "<run_id>" --json jobs -q '.jobs[] | "\(.databaseId) \(.name)"' | while read -r job_id job_name; do
  slug=$(echo "$job_name" | tr ' /' '--' | tr -cd '[:alnum:]-')
  gh api "/repos/$REPO/actions/jobs/$job_id/logs" > "logs/<run_id>-${slug}.log"
done
```

## Releasing

1. Ensure `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md) reflects the release.
2. `bun run release:prepare patch|minor|major`: bump `package.json` and promote `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` with a footer link (no git tag).
3. Open a `dev` → `main` PR titled `release X.Y.Z`; CI enforces changelog compliance.
4. Merge. [`release.yml`](./.github/workflows/release.yml) tags the merge commit `vX.Y.Z` and publishes the GitHub Release from the curated section. Non-release merges are a no-op; use the workflow's manual trigger to re-run.
