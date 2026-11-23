---
name: generate-release
description: Prepare a release by promoting the curated `## [Unreleased]` changelog section and bumping the version. Use when the user asks to cut, prepare or draft a release.
---

# Prepare a release

`.github/workflows/release.yml` tags and publishes on push to `main`. This skill stops before anything is merged.

## Steps

1. **Review** `## [Unreleased]` in `CHANGELOG.md` against `git log main..dev`. Add or tighten entries for anything that shipped without one (see `.claude/rules/changelog.md`). Use the recent released sections as the style reference.
2. **Pick the bump** (SemVer): breaking changes are `major`, new features `minor`, fixes and internal changes `patch`. Pre-1.0, confirm the choice with the user.
3. **Prepare:**

```bash
bun run release:prepare <patch|minor|major>
```

This bumps `package.json` and promotes `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD` with its footer link. It creates no tag. Run `bun run ci:verify-changelog` afterwards.

4. **Hand off:** propose a commit titled ``chore(release): bump version to `X.Y.Z` `` and a `dev` → `main` release PR, merged as a merge commit (not squash). Commit, push, tag or merge only when the user asks.
