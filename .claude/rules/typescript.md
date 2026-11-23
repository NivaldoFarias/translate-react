---
paths:
  - "**/*.ts"
  - "**/*.mjs"
---

# TypeScript and JSDoc

ESLint and `tsconfig.json` (strict, `noUncheckedIndexedAccess`) enforce most formatting. These are the conventions they don't catch.

## Imports

- Prefix native modules: `node:fs/promises`, `bun:test`.
- Import internal code through `@/` aliases. Use `import type` for type-only imports.

## Types

- Let TypeScript infer return types. Use `unknown` over `any`, and discriminated unions for constrained values.
- Name the runtime `const` and its derived `type` differently:

```typescript
export const POST_TRANSLATION_GUARD_IDS = {
	nonEmptyContent: "nonEmptyContent",
	contentRatio: "contentRatio",
} as const;

export type PostTranslationGuardId =
	(typeof POST_TRANSLATION_GUARD_IDS)[keyof typeof POST_TRANSLATION_GUARD_IDS];
```

- Use a named `interface` for known-shape data (log fields, API payloads, config). Keep `Record<string, unknown>` for truly dynamic data.
- Put internal types in normal `.ts` files. `*.d.ts` is only for untyped external modules and the documented test fixture exception (`tests/fixtures/markdown-text.d.ts`).
- Reuse types from libraries already in use (remark/mdast/unist, Octokit, OpenAI SDK) over parallel custom interfaces.
- Fix a typing problem at its source with a type guard or a corrected type (e.g. `isLlmApiError`). If a cast is unavoidable, keep it in one place (a factory or harness), never repeated at call sites.

## Classes, env and constants

- Give class members explicit access modifiers, and `readonly` for data that doesn't change.
- Read env through the validated `env` export from `src/app/schemas/env.schema.ts` (or the `ci` equivalent), not `process.env`. CLI bootstrap code that sets env before validation is the exception.
- Compare against typed constants or enums, not string literals. Use `StatusCodes` from `http-status-codes` for HTTP statuses.
- Every numeric threshold, budget or limit gets a JSDoc receipt: what was observed that led to the value. For an externally mandated value, state the constraint instead.

```typescript
/** Reduced from 40 to cut structured-output JSON parse failures and split cascades observed in production. */
export const SEGMENT_BATCH_MAX_ITEMS_PER_BATCH = 20;
```

- Pull complex conditions into named booleans (`const isStale = ...; if (isStale && hasPermission)`).

## JSDoc

- Document with JSDoc, not `//` inline comments.
- Start every block with a one-line summary. Use the single-line form `/** ... */` when it fits in about 80 characters. Add `@param`, `@returns`, `@throws` and `@example` for non-trivial functions.
- Leave TypeScript types out of JSDoc tags. Backtick code identifiers, and link related symbols with `{@link Symbol}` or `@see`.
- Use realistic project data in `@example`, inside a fenced block with a language tag. When the example itself contains backticks, use a `plaintext` fence instead of double-backtick escapes.
- Say "slash-star" or "double-slash-star" in prose rather than writing comment delimiters inside JSDoc.
- Mark superseded APIs with `@deprecated` when you touch them.
- Update JSDoc in the same change as the code it describes. Keep it direct and complete: when tightening, keep the detail and concrete examples.
- Write a literal `...`, not the `…` glyph.
