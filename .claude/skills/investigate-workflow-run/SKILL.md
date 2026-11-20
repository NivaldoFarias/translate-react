---
name: investigate-workflow-run
description: Fetch a GitHub Actions run's artifacts and raw job logs, then diagnose it. Use when the user asks why a CI, smoke or translation run failed, or wants to check the latest run's output.
---

# Investigate workflow run

The default target is the latest `Workflow smoke` run (`.github/workflows/smoke.yml`). Any workflow works when given a run ID.

## Steps

1. **Resolve the run ID** unless the user gave one:

```bash
gh run list --workflow=smoke.yml --limit 1 --json databaseId,conclusion,displayTitle,createdAt -q '.[0]'
```

2. **Download artifacts** into `.out/<run-id>/`:

```bash
RUN_ID=<run-id>
mkdir -p ".out/$RUN_ID"
gh run download "$RUN_ID" --dir ".out/$RUN_ID"
```

Translation runs upload `translation-logs-<lang>-<run_id>`, with Pino logs under `logs/`. Older runs uploaded with `archive: false` need the REST artifact zip and then `tar -xzf`.

3. **Download job logs.** `gh run view --log` is often empty, so fetch each job through REST:

```bash
mkdir -p ".out/$RUN_ID/logs"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh run view "$RUN_ID" --json jobs -q '.jobs[] | "\(.databaseId) \(.name)"' | while read -r job_id job_name; do
  slug=$(echo "$job_name" | tr ' /' '--' | tr -cd '[:alnum:]-')
  gh api "/repos/$REPO/actions/jobs/$job_id/logs" > ".out/$RUN_ID/logs/${slug}.log"
done
```

If the user's untracked `scripts/fetch-workflow-run.sh <run-id>` (or `--last`) exists, it does steps 2 and 3 in one go.

4. **Read the summary** with `gh run view "$RUN_ID"`: the conclusion, the failing step and any annotations.

5. **Cross-reference** logs and artifacts:
   - Count outcomes per file in the logs: `Discovered N files to translate`, `File processing failed`, `File processing complete`, `Failed files`.
   - For LLM parsing problems, search `Segment batch failed` and `Frontmatter batch response`.
   - A discovered file with no artifact folder (no `translated.md` / `pull-request.md`) is usually the one that failed. Grep the logs for its name to find the thrown error and stack.
   - Read `translation-progress-issue-comment.md` and each `pull-request.md` to see what would have shipped.
   - Segment JSON parse failures often trace back to `LLM_MODEL`. Before blaming the parser, check which model the environment used.

6. **Report:** the success rate, the failing files or steps, the root-cause error with its stack, and why it happened (retry exhaustion, schema mismatch, rate limit, ...).

An empty artifact list means the job died before the upload step, so rely on the logs alone. `.out/` is gitignored scratch, and re-running steps 2–3 overwrites in place.
