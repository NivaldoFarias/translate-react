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

[`ci:smoke`](./package.json) runs the translation workflow against fixture markdown with a live LLM and mocked GitHub.

Profiles:

- `quick`: default pre-merge slice
- `workflow`: PR scenarios only
- `full`: every `tests/fixtures/md/*.md`

Fixture lists: [`smoke-profiles.util.ts`](./src/ci/services/smoke/smoke-profiles.util.ts).

> [!IMPORTANT]
>
> - Local runs write gitignored `.out/`. Each translated fixture gets a subdirectory (i.e. `use-memo/`) with `translated.md` and `pull-request.md`. When the run posts progress, `translation-progress-issue-comment.md` sits at the `.out/` root.
> - `TARGET_LANGUAGE` defaults to `pt-br`; pass `--lang <locale>` to smoke a different configured locale. Pass `--model <id>` to override `LLM_MODEL` for a local run (for example `bun run ci:smoke -- --lang ru --files use-client.md --model openai/gpt-5.4-nano`). Manual [`smoke.yml`](./.github/workflows/smoke.yml) dispatch accepts the locale override via `lang` and an optional `llm_model` input that replaces the selected environment's `LLM_MODEL` when set.
> - [`ci.yml`](./.github/workflows/ci.yml) runs the `quick` profile for `pt-br` as a required gate whenever `src/app/services/translator/`, `src/app/services/runner/`, or `src/app/locales/` changes; other locales from [`.github/locales.json`](./.github/locales.json) run as optional jobs (`continue-on-error`) with a 120-minute timeout. Failed smoke jobs upload `.out/` as an artifact.
> - [`smoke.yml`](./.github/workflows/smoke.yml) stays manual dispatch for ad hoc `workflow`/`full` profile runs, a chosen locale, an optional LLM model override, or a specific GitHub Environment. The job writes the same tree to `.out/`, packs it to `artifacts/smoke/<lang>-<profile>-<run_id>.tar.gz`, and uploads artifact `smoke-<lang>-<profile>-<run_id>`.

Extract the downloaded artifact[^1]:

```bash
tar -xzf smoke-pt-br-quick-<run_id>.tar.gz
```

## Releasing

1. Ensure `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md) reflects the release.
2. `bun run release:prepare patch|minor|major`: bump `package.json` and promote `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` with a footer link (no git tag).
3. Open a `dev` → `main` PR titled `release X.Y.Z`; CI enforces changelog compliance.
4. Merge. [`release.yml`](./.github/workflows/release.yml) tags the merge commit `vX.Y.Z` and publishes the GitHub Release from the curated section. Non-release merges are a no-op; use the workflow's manual trigger to re-run.

[^1]: The pack step is required because `actions/upload-artifact@v7` skips hidden dot-directories such as `.out/`. Production translation logs under `logs/` upload directly because that path is not hidden.
