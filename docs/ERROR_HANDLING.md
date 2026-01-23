# Error Handling Architecture

## Table of Contents

- [Table of Contents](#table-of-contents)
- [Overview](#overview)
- [Error Structure](#error-structure)
  - [Factory Functions](#factory-functions)
- [Error Codes](#error-codes)
  - [Content-Related Codes](#content-related-codes)
  - [Process-Related Codes](#process-related-codes)
  - [API-Related Codes](#api-related-codes)
- [`ApplicationError` Class](#applicationerror-class)
- [Error Mapping Function](#error-mapping-function)
  - [Examples](#examples)
    - [Github's API Error](#githubs-api-error)
    - [OpenAI/LLM API Error](#openaillm-api-error)
  - [Integration Tests](#integration-tests)
- [Related Documentation](#related-documentation)
  - [Source Files](#source-files)

---

## Overview

The translation workflow uses a simplified error handling system with a single `ApplicationError` class and factory functions for common error scenarios. Each error provides context through optional `operation` and `metadata` properties for debugging.

## Error Structure

```
Error (Native)
└── ApplicationError (single class with error codes)
```

### Factory Functions

- `createInitializationError()` - Service initialization failures
- `createResourceLoadError()` - Resource loading failures
- `createEmptyContentError()` - Empty file content
- `createTranslationValidationError()` - Translation output validation
- `createChunkProcessingError()` - Chunk workflow issues

## Error Codes

### Content-Related Codes

| Code                     | Description                                |
| ------------------------ | ------------------------------------------ |
| `NoContent`              | File content is empty or missing           |
| `InvalidContent`         | Content format or structure is invalid     |
| `ContentTooLong`         | Content exceeds maximum allowed length     |
| `FormatValidationFailed` | Translation format validation failed       |
| `ChunkProcessingFailed`  | Chunk processing failed during translation |

### Process-Related Codes

| Code                  | Description                   |
| --------------------- | ----------------------------- |
| `TranslationFailed`   | Translation process failed    |
| `InitializationError` | Service initialization failed |

### API-Related Codes

| Code                 | Description                  |
| -------------------- | ---------------------------- |
| `LLMApiError`        | LLM API request failed       |
| `GithubApiError`     | GitHub API request failed    |
| `RateLimitExceeded`  | API rate limit exceeded      |
| `GithubNotFound`     | GitHub resource not found    |
| `GithubUnauthorized` | GitHub authentication failed |
| `GithubForbidden`    | GitHub access forbidden      |
| `GithubServerError`  | GitHub server error          |

## `ApplicationError` Class

All errors are instances of `ApplicationError` with standardized properties:

```typescript
class ApplicationError extends Error {
	readonly code: ErrorCode; // Standardized error code
	readonly operation: string; // Operation that failed (defaults to "UnknownOperation")
	readonly metadata?: Record<string, unknown>; // Additional context

	constructor(
		message: string,
		code: ErrorCode,
		operation?: string,
		metadata?: Record<string, unknown>,
	);
}
```

## Error Mapping Function

This helper's implementation provides an error-type agnostic mapping mechanism. It translates third-party errors into `ApplicationError` instances with relevant context. This ensures consistent error handling across different services.

The main errors thrown in the workflow relate to octokit's `RequestError` and OpenAI's `APIError` (or `OpenAIError`), which are specifically handled by the `mapError` function.

### Examples

#### Github's API Error

```typescript
import { mapError } from "@/errors/";

try {
  await octokit.rest.repos.getContent({ ... });
} catch (error) {
  throw mapError(error, "ContentService.getFileContent", { path, owner, repo });
}
```

#### OpenAI/LLM API Error

```typescript
import { mapError } from "@/errors/";

try {
  await openai.chat.completions.create({ ... });
} catch (error) {
  throw mapError(error, "TranslatorService.callLanguageModel", { model, chunkIndex, chunkSize });
}
```

### Integration Tests

```typescript
test("handles chunk count mismatch", async () => {
	const largeContent = generateLargeContent();

	try {
		await translator.translateContent(file);
	} catch (error) {
		expect(error).toBeInstanceOf(ApplicationError);
		expect(error.code).toBe(ErrorCode.ChunkProcessingFailed);
		expect(error.metadata).toHaveProperty("expectedChunks");
	}
});
```

## Related Documentation

| Document                             | Description                                     |
| ------------------------------------ | ----------------------------------------------- |
| [DEBUGGING.md](./DEBUGGING.md)       | Troubleshooting guide and diagnostic procedures |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture and service design          |

### Source Files

| File                                                                            | Description                      |
| ------------------------------------------------------------------------------- | -------------------------------- |
| [`src/errors/base.error.ts`](../src/errors/error.ts)                            | Base error class and error codes |
| [`src/errors/error.helper`](../src/errors/error.helper.ts)                      | Agnostic error mapping function  |
| [`src/services/translator.service.ts`](../src/services/translator.service.ts)   | Primary error usage              |
| [`src/services/runner/base.service.ts`](../src/services/runner/base.service.ts) | Error handling in workflow       |
