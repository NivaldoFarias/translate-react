---
paths:
  - "src/app/services/translator/**"
---

# Translation pipeline and validation

`validation.constants.ts` (`POST_TRANSLATION_GUARD_IDS`) is the current guard list. These rules cover how to change it.

## Blocking vs advisory

- Every guard is blocking (no PR opens; listed in `BLOCKING_POST_TRANSLATION_GUARD_IDS`) or advisory (shows up as `reviewerNotices` on the PR). A new guard is advisory unless its defect makes the output unusable, such as empty content or a wild length ratio.
- Guards run once after a single LLM pass. A failing guard is reviewer signal, so keep retry loops out of guard results.
- Advisory output is rendered by `comment-builder/reviewer-warnings.util.ts`: a plain intro line, then a `<details>` block with one `###` section per guard, `####` line anchors per violation, and ` ```markdown ` snippets. List every violation, without slice caps.
- Call it a "guard hint" in copy and logs (the field is still named `retryHint`). Passing all guards is a quality signal, not approval; word PR copy and logs that way.

## Where code goes

- Guards and analyzers live in dedicated modules under `validation/guards/` or `validation/analyzers/`, not in `TranslatorService`. Merge closely related small ones into one module of about 300–500 lines when that reads better.
- Deterministic, language-agnostic output defects (MDN `/en-US/` links, inline-code spacing, link-label spacing) get a mechanical pass in `translation-output-cleanup.ts`, not a stricter prompt. Locale-specific glitches go in that locale's `repairs/`.
- Keep segment cleanup free of `.trim()`. Trimming whole segments caused the v0.2.8 spacing and `## ##` regressions.

## Errors and retries

- Split-eligible segment batch failures (JSON parse, schema, truncation, id mismatch) abort `p-retry` with `AbortError` and split the batch. Rate-limit and transient errors keep retrying; auth, exhausted credit and the daily free-model quota abort at once.
- Treat `finishReason: "error"` like `"length"`: a failure that retries. OpenRouter sends it even though the OpenAI SDK types omit it.
- On a completion-token limit, re-chunk with a smaller budget. Accepting truncated output is never correct.

## Verification

The PR's CI runs `quick` smoke. For a fixture outside that profile, dispatch `smoke.yml` on the branch (`gh workflow run smoke.yml --ref <branch> -f files=<fixture>.md -f lang=<locale>`) and read the output with the `investigate-workflow-run` skill. When a change alters what stays in English or how text is repaired, also run every guard, locale guards included, on saved drafts: a fix can expose a false positive that an earlier pass was hiding. A full re-translation is non-deterministic: it can fix one defect class and introduce another.
