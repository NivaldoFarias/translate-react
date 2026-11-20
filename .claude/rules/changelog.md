---
paths:
  - "CHANGELOG.md"
---

# Changelog

`CHANGELOG.md` follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and SemVer. It is written for people: curate outcomes, never paste git log output.

## Where entries go

- Add entries under `## [Unreleased]`. `bun run release:prepare` promotes it to `## [X.Y.Z] - YYYY-MM-DD` and adds the footer link, and `ci:verify-changelog` checks the format.
- Use only the sections you need, in this order: Added, Changed, Deprecated, Removed, Fixed, Security.

| Change                                                     | Section |
| ---------------------------------------------------------- | ------- |
| `feat`                                                     | Added   |
| `fix`                                                      | Fixed   |
| `refactor`, `chore`, `docs`, `ci`, `style`, `test`, `perf` | Changed |
| Removal of a feature, file or script                       | Removed |

- Skip internal noise (formatting, lockfile bumps, test-only churn, renames) unless it changes workflow behaviour, CI gates or contributor setup.
- Leave out PR numbers, commit SHAs and merge titles.

## Readers

| Reader                              | Cares about                                                    |
| ----------------------------------- | -------------------------------------------------------------- |
| Operators (fork/runner maintainers) | When translation runs, PR reuse, concurrency, env and CI needs |
| React docs maintainers              | Translation quality, what appears on PRs, blocking vs advisory |
| Contributors                        | Layout or env moves, new scripts, validation policy, wiki/CI   |

## Bullet style

- Lead with the outcome for the reader, then identifiers (`ci:smoke`, env vars, guard names).
- One idea per bullet. Merge commits into one bullet only when they form one visible change.
- In Fixed, state the symptom, then what users see now.
- Prefix changes contributors must act on with `**Breaking (contributors):**`.
- Backtick code identifiers, files, scripts and env vars.

| Implementation journal                                            | Outcome                                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `` `refreshTranslationBranchPreservePr` for `out_of_sync` runs `` | Upstream refresh reuses the open translation pull request instead of closing it.     |
| `` `segment-batch.util.ts` token-aware packing ``                 | Segment batches cap item count and estimated completion tokens to reduce truncation. |
