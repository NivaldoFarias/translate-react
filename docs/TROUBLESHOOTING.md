# Troubleshooting & Debugging Guide

Guide for troubleshooting common issues and debugging the translation workflow.

## Table of Contents

- [Common Issues](#common-issues)
- [Debug Mode](#debug-mode)
- [Chunked Translation Issues](#chunked-translation-issues)
- [Validation Checks](#validation-checks)
- [Diagnostic Procedures](#diagnostic-procedures)
- [Getting Help](#getting-help)

---

## Common Issues

### Environment & Configuration

| Error                                                      | Cause                             | Solution                                                                          |
| ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `GH_TOKEN: String must contain at least 1 character(s)`    | Missing environment variable      | Set `GH_TOKEN` in your `.env` file                                                |
| `LLM_API_KEY: String must contain at least 1 character(s)` | Missing environment variable      | Set `LLM_API_KEY` in your `.env` file                                             |
| `Zod validation failed`                                    | Invalid environment configuration | Check [`src/utils/env.util.ts`](../src/utils/env.util.ts) for schema requirements |

### GitHub API Issues

GitHub API errors are logged with status code and request ID. Common cases:

| Symptom / Log context    | Cause                                   | Solution                                                                  |
| ------------------------ | --------------------------------------- | ------------------------------------------------------------------------- |
| 404 / Not Found          | Repository or resource not found        | Verify repository exists and token has `repo` scope                       |
| 403 + rate limit message | API rate limit exceeded                 | Tool auto-retries with backoff; consider GitHub App token for heavy usage |
| 403 / Forbidden          | Insufficient permissions                | Verify token has write access to fork repository                          |
| 422 / Conflict           | Branch already exists or merge conflict | Delete existing branch or resolve conflict manually                       |

### LLM/Translation Issues

LLM API errors are logged with status and type. Common cases:

| Symptom / Log context           | Cause                                | Solution                                                   |
| ------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `insufficient_quota` / 402      | API credits exhausted                | Check API credits; switch providers via `LLM_API_BASE_URL` |
| 429 / rate limit                | Too many requests to LLM API         | Reduce `BATCH_SIZE` or wait for rate limit reset           |
| Timeout / long-running request  | Request took too long                | Increase timeout or reduce content size                    |
| `Translation validation failed` | Output doesn't match expected format | Check LLM model compatibility; review prompt template      |

---

## Debug Mode

Enable debug logging via environment variable:

```bash
LOG_LEVEL="debug" bun run dev
```

Or add to `.env`: `LOG_LEVEL="debug"`

**Log Levels:**

| Level   | Description                                      |
| ------- | ------------------------------------------------ |
| `trace` | Most verbose; internal state details             |
| `debug` | Detailed diagnostics (recommended for debugging) |
| `info`  | Standard messages (default)                      |
| `warn`  | Warning conditions                               |
| `error` | Error conditions                                 |
| `fatal` | Critical errors causing termination              |

**Debug output includes:** File processing, branch creation, token estimates, chunking decisions, validation results, commit/PR timing.

---

## Chunked Translation Issues

For workflow timing details, see [WORKFLOW.md](./WORKFLOW.md).

### Key Log Indicators

| Log Message                                     | Level | Meaning                                             |
| ----------------------------------------------- | ----- | --------------------------------------------------- |
| `Chunk count mismatch detected`                 | Error | `translatedChunks.length !== originalChunks.length` |
| `Translation lost all markdown headings`        | Error | Markdown structure not preserved                    |
| `Translation size ratio outside expected range` | Warn  | Ratio < 0.5 or > 2.0                                |

### Issue: Incomplete Translation

**Symptoms:** Truncated PR content, chunk count mismatch, size ratio < 0.5

**Debug:** Enable debug logging → Run single file → Check chunk counts and completion times

### Issue: Race Condition Suspected

**Symptoms:** Missing content, inconsistent results between runs

**Debug:**

```bash
LOG_LEVEL="debug" bun run dev 2>&1 | grep -E "(Chunk.*translated|Commit completed|reassembly)"
```

Verify: Each chunk completes before next starts → Reassembly before commit

## Validation Checks

The workflow validates translations at multiple checkpoints:

| Check         | Severity | Condition                                           | Location                  |
| ------------- | -------- | --------------------------------------------------- | ------------------------- |
| Chunk count   | ❌ Error | `translatedChunks.length !== originalChunks.length` | `translateWithChunking()` |
| Content empty | ❌ Error | Content is empty or whitespace-only                 | `validateTranslation()`   |
| Size ratio    | ⚠️ Warn  | Ratio outside 0.5–2.0x range                        | `validateTranslation()`   |
| Headings      | ⚠️ Warn  | Markdown headings not preserved                     | `validateTranslation()`   |

**Log file location:** `logs/YYYY-MM-DDTHH:MM:SS.sssZ.pino.log`

```bash
# View recent errors
grep '"level":50' logs/*.log | tail -20

# Count warnings by type
grep '"level":40' logs/*.log | jq -r '.msg' | sort | uniq -c
```

---

## Diagnostic Procedures

### Quick Health Check

```bash
# Test GitHub API connectivity
curl -H "Authorization: token $GH_TOKEN" https://api.github.com/user

# Check rate limit status
curl -H "Authorization: token $GH_TOKEN" https://api.github.com/rate_limit
```

### Single File Test

1. Modify runner filter to process only the target file
2. Enable debug logging: `LOG_LEVEL="debug"`
3. Run and analyze logs

---

## Getting Help

1. **Search existing issues**: [GitHub Issues](https://github.com/NivaldoFarias/translate-react/issues)
2. **Open a new issue** with: error message, environment config (redacted), steps to reproduce, debug logs

## References

- [WORKFLOW.md](./WORKFLOW.md) — Execution stages and timing
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Service design
- [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) — Directory structure
