---
name: pre-pr-sweep
description: Sweep a branch diff for AI-artifact phrasing, stale docs, stale bot copy and doc bloat before opening a pull request. Use before creating a PR, or when the user asks to double-check a branch.
---

# Pre-PR sweep

A copy and documentation gate for what code review and CI miss. It is not a code review: pair it with `/code-review` when the user wants both.

## Scope

The whole branch diff against `dev` (`git diff dev...HEAD --stat` first), covering:

- Code comments and JSDoc.
- Tracked docs: `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `SECURITY.md`, and `.wiki/` drafts if they changed.
- Bot-authored runtime copy: locale PR-body builders, guard and reviewer hint text, progress-issue comment templates.

Agent configuration (`AGENTS.md`, `.claude/`, `docs/agents/`) is out of scope.

## Checks

1. **AI-artifact phrasing:** no mentions of Cursor, Copilot, Claude, agents, skills or rules in product copy. No "as requested" or "per your prompt", and no "AI-generated" meta-commentary. Error messages address the problem, not the requester.
2. **Stale JSDoc:** descriptions of renamed fields, parameters or types under their old name; references to modules that have since been split or moved; behaviour or concurrency claims a refactor broke.
3. **Stale bot copy:** PR bodies, issue comments or guard hints describing behaviour that no longer exists (e.g. "the PR was closed" after a switch to refresh-in-place). This is a functional defect, not a wording nit.
4. **Doc bloat:** new docs that restate a wiki page or an existing doc, or sections added "just in case".
5. **IDE path leakage:** tracked `README.md` / `CONTRIBUTING.md` reference no IDE- or agent-only paths (`.cursor/`, `.claude/`). Inline the real operator steps instead.

## Steps

1. Run the phrasing scan as a first pass. It checks added lines only:

```bash
.claude/skills/pre-pr-sweep/scripts/scan-phrasing.sh [<base>]
```

2. Read every touched doc, comment and copy section in full for checks 2–5, which the script can't catch.
3. Fix unambiguous wording and stale references in place. If fixing copy reveals a behaviour bug, stop and flag it rather than rewording the copy to match broken behaviour.
4. Report what was swept, what was fixed, and what needs the user's judgment.

Change only what a check flags, and only in files inside the branch diff.
