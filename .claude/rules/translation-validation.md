---
paths:
  - "src/app/services/translator/**"
---

# Translation pipeline and validation

`validation.constants.ts` (`POST_TRANSLATION_GUARD_IDS`) is the current guard list. These rules cover how to change it.

## Blocking vs advisory

- Every guard is blocking (no PR opens) or advisory (shows up as `reviewerNotices` on the PR). A new guard is advisory unless its defect makes the output unusable: empty content, broken heading syntax, a wild length ratio.
- Guards run once after a single LLM pass. A failing guard is reviewer signal, so keep retry loops out of guard results.
- Advisory output is rendered by `comment-builder/reviewer-warnings.util.ts`: a plain intro line, then a `<details>` block with one `###` section per guard, `####` line anchors per violation, and ` ```markdown ` snippets. List every violation, without slice caps.
- Call it a "guard hint", not a "retry hint". Passing all guards is a quality signal, not approval; word PR copy and logs that way.

## Where code goes

- Guards and analyzers live in dedicated modules under `validation/guards/` or `validation/analyzers/`, not in `TranslatorService`. Merge closely related small ones into one module of about 300–500 lines when that reads better.
- Deterministic, language-agnostic output defects (MDN `/en-US/` links, inline-code spacing, link-label spacing) get a mechanical pass in `translation-output-cleanup.ts`, not a stricter prompt. Locale-specific glitches go in that locale's `repairs/`.
- Keep segment cleanup free of `.trim()`. Trimming whole segments caused the v0.2.8 spacing and `## ##` regressions.

## Errors and retries

- Split-eligible segment batch failures (JSON parse, schema, truncation, id mismatch) abort `p-retry` with `AbortError` and split the batch. Rate-limit and transient errors keep retrying.
- Treat `finishReason: "error"` like `"length"`: a failure that retries. OpenRouter sends it even though the OpenAI SDK types omit it.
- On a completion-token limit, re-chunk with a smaller budget. Accepting truncated output is never correct.

## Verification

Run `bun run ci:smoke -- --profile quick` before merging changes here. Override the language or model with `--lang` / `--model` (e.g. `bun run ci:smoke -- --lang ru --files use-client.md --model openai/gpt-5.4-nano`). Output lands in `artifacts/smoke/`. A full re-translation is non-deterministic: it can fix one defect class and introduce another.
