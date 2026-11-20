---
paths:
  - ".github/workflows/**"
  - ".github/actions/**"
---

# GitHub Actions

This is a solo-maintainer project on GitHub-hosted runners. Add CI machinery only for a current need.

- **Permissions:** declare `permissions` at workflow level with the minimum (`contents: read`), and widen only on the job that needs more.
- **Concurrency:** set `concurrency` on every workflow. Use `cancel-in-progress: true` when a newer run supersedes the old one (PR CI, per-locale translation). Use `false` when a run must finish (polling, releases), since cancelling can leave a SHA variable or tag half-updated.
- **Credentials:** read secrets from `secrets.*` and settings from `vars.*`. Repo writes use a GitHub App token (`actions/create-github-app-token@v3` with `client-id`). Fall back to the operator PAT only where the App isn't installed.
- **Pinning:** pin third-party actions to a major tag (`actions/checkout@v7`), not a SHA.
- **Reuse:** shared steps go in a composite action under `.github/actions/<name>/`. The calling job runs `actions/checkout` first. A pipeline shared by several workflows becomes a `workflow_call` reusable workflow, called with `secrets: inherit`.
- **Timeouts:** set `timeout-minutes` on short deterministic jobs (lint, test, release, poll). Leave it off translation and real-LLM smoke jobs, where the ~6h default is the real bound and free-tier rate limits make runs slow.
- **Artifacts:** upload diagnostics with `if: always()` (or `failure()` for PR CI), use `if-no-files-found: warn` for conditional outputs, and size `retention-days` to how long the artifact is useful.
- **Caching:** key caches by `hashFiles('bun.lock')` with an OS-scoped `restore-keys`, and skip install on a hit (see `setup-bun-deps`).
- **Smoke gating:** the required `pt-br` smoke runs only on `pull_request` when `translator/`, `runner/` or `locales/` changed. Other locales are optional `continue-on-error` jobs.
- **Inputs:** coalesce optional dispatch inputs in YAML (`inputs.llm_model != '' && inputs.llm_model || vars.LLM_MODEL`) before passing a single value down. GitHub `choice` options are static, so keep them in sync with `.github/locales.json`.

`bun run lint` includes `actionlint`.
