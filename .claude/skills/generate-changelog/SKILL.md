---
name: generate-changelog
description: Add Keep a Changelog entries under `## [Unreleased]` in CHANGELOG.md from the staged diff, a branch diff or a commit message. Use when the user asks to update the changelog or add changelog entries.
---

# Generate changelog entries

Style and section rules live in `.claude/rules/changelog.md`, which loads when you open `CHANGELOG.md`. Read it before writing.

## Steps

1. **Gather changes:** take the commit message the user gave, or else `git diff --staged`, or else `git diff dev...HEAD` for a branch.
2. **Find outcomes:** for each change, decide who notices it (operator, React docs maintainer, contributor) and what behaves differently. Internal refactors with no visible effect get no entry.
3. **Categorize** each outcome into its section.
4. **Write** one outcome-first bullet per logical change, and add it under `## [Unreleased]` in the right `###` subsection. Create the subsection in canonical order if it's missing. Keep the existing entries and their order.
5. **Show** the `CHANGELOG.md` diff. Leave the version and dated heading alone, since that happens at release time.

## Examples

| Input                                                  | Entry                                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feat(ci): add setup-bun-deps composite action`        | Added: `setup-bun-deps` composite action for CI workflows.                                                                                                  |
| `fix(env): make OpenRouter metadata env vars optional` | Fixed: Blank OpenRouter metadata env vars no longer fail validation.                                                                                        |
| Segment-first translation, fallback on parse failure   | Changed: Markdown body translation runs segment-by-segment by default, with automatic fallback to full-document translation when parsing or batching fails. |

A bullet that lists new files and methods (`translator-segment-batch.schema.ts`, `callLanguageModelSegmentBatch`, ...) or cites PR numbers and SHAs is an implementation journal. Rewrite it as the outcome.
