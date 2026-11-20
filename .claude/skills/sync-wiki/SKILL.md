---
name: sync-wiki
description: Publish the local `.wiki/` drafts to the project's GitHub Wiki. Use when the user asks to sync, publish or push wiki changes.
---

# Sync wiki drafts

`.wiki/` (gitignored, at the main checkout's root) holds drafts of every page of the `translate-react.wiki.git` repository. The drafts are the source of truth for review, and the wiki clone is only how they get published. Tracked docs (README, CONTRIBUTING, SECURITY, CHANGELOG) are committed to this repo instead.

## Steps

1. **Review the drafts.** Read the changed pages under `.wiki/` and check them against what the user asked for. This is the last checkpoint before content goes public. Wiki copy follows the same tone rules as tracked docs, with no mention of AI tooling or of how it was written.
2. **Publish:**

```bash
.claude/skills/sync-wiki/scripts/sync-wiki.sh "<short human summary of what changed>"
```

The script finds or clones the wiki repo (default `<main-checkout>.wiki`, override with `WIKI_DIR`), checks out the wiki branch named after the current branch (creating it off the wiki default branch if needed), copies every `.wiki/*.md`, then commits and pushes. Set `WIKI_DRAFTS_DIR` to publish from somewhere other than `<main-checkout>/.wiki`.

3. **Report** the published pages, the wiki branch, and links to the live pages. The links resolve once that branch is on the wiki's default branch.

Every page under `.wiki/` gets published, so keep pages you don't want live out of it.
