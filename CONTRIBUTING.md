# Contributing

MIT. Not a hosted app: forks use their own API keys and Actions config.

- Bun only (`bun install`, `bun run …`); see `engines` in [`package.json`](./package.json).
- TypeScript strict; match patterns in [`src/`](./src/).
- Layout and services: [Wiki: Codebase](https://github.com/NivaldoFarias/translate-react/wiki/Codebase); run order: [Wiki: Workflow](https://github.com/NivaldoFarias/translate-react/wiki/Workflow). App wiring: [`src/app/composition.ts`](./src/app/composition.ts).
- Tests: `bun test` (or `bun run test:coverage` locally); CI runs coverage. Mirror `src/` paths under `tests/`; mock GitHub and LLM.
- Before merging changes under `src/app/services/translator/`, `src/app/services/runner/`, or `src/app/locales/`: CI green and `bun run ci:smoke -- --profile quick` (real LLM, mocked GitHub). Optional: [Workflow smoke](https://github.com/NivaldoFarias/translate-react/actions/workflows/smoke.yml) on GitHub. See [Workflow smoke](#workflow-smoke) for outputs and CI artifacts.
- Before push: `bun run lint`, `bun run format`.
- Commits: [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`, `chore`, `refactor`; optional scope).
- Changelog: accumulate entries under `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md) as you work. Never hand-write a `## [X.Y.Z]` heading or bump `version` outside the release flow below; CI fails a bumped version whose section lacks a date, footer link, or entries.
- Docs: [Wiki](https://github.com/NivaldoFarias/translate-react/wiki). [`CHANGELOG.md`](./CHANGELOG.md), [`SECURITY.md`](./SECURITY.md) stay in the repo.
- Adding a production locale: follow the [wiki checklist](https://github.com/NivaldoFarias/translate-react/wiki/Workflow#adding-a-locale) (registry, `LocaleService`, parity test, fork secrets, dry run).
- Automated PRs still need human review on locale repos. Mention this repo’s version when debugging a run.

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
> - [`smoke.yml`](./.github/workflows/smoke.yml) is manual dispatch only. The job writes the same tree to `.out/`, packs it to `artifacts/smoke/<profile>-<run_id>.tar.gz`, and uploads artifact `smoke-<profile>-<run_id>`.

Extract the downloaded artifact[^1]:

```bash
tar -xzf smoke-quick-<run_id>.tar.gz
```

## Releasing

1. Ensure `## [Unreleased]` in [`CHANGELOG.md`](./CHANGELOG.md) reflects the release.
2. `bun run release:prepare patch|minor|major`: bump `package.json` and promote `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` with a footer link (no git tag).
3. Open a `dev` → `main` PR titled `release X.Y.Z`; CI enforces changelog compliance.
4. Merge. [`release.yml`](./.github/workflows/release.yml) tags the merge commit `vX.Y.Z` and publishes the GitHub Release from the curated section. Non-release merges are a no-op; use the workflow's manual trigger to re-run.

[^1]: The pack step is required because `actions/upload-artifact@v7` skips hidden dot-directories such as `.out/`. Production translation logs under `logs/` upload directly because that path is not hidden.
