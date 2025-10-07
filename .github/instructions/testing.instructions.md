---
description: Testing standards for unit tests, integration tests, and test-driven development in a Bun and TypeScript environment.
applyTo: "**/*.test.ts,**/*.spec.ts,**/test/**,**/tests/**"
---

# Testing Standards for Development

This document provides testing-specific standards for the project, optimized for the Bun Test Runner, comprehensive mocking, and type-safe patterns.

Auxiliary files to refer to for more context:

- [Workspace Copilot Instructions](../copilot-instructions.md): for general AI-assisted coding guidelines.
- [TypeScript Instructions](./typescript.instructions.md): for TypeScript-specific testing patterns.

## Bun Test Runner: Best Practices and Guidelines

Bun's test runner is designed for speed and is largely compatible with the Jest API. Adhering to these practices will ensure tests are fast, efficient, and maintainable.

### 1. Test Structure and Naming [P0]

- **Suites and Tests**: Group related tests within a `describe` block. Individual test cases should be defined with `test` or `it`.
- **Descriptive Names**: Test names MUST be descriptive and clear, following the `"should <expected behavior> when <condition>"` pattern. For example: `test("should return an error if the GitHub token is invalid")`.
- **Async Tests**: For asynchronous operations, use `async/await`. Bun's test runner natively supports async functions.

```typescript
import { describe, expect, test } from "bun:test";

describe("Math Operations", () => {
	test("should add two numbers correctly", () => {
		expect(2 + 2).toBe(4);
	});

	test("should handle async operations", async () => {
		const result = await Promise.resolve(10);
		expect(result).toBe(10);
	});
});
```

### 2. Mocking [P0]

- **Built-in Mocks**: Use `mock` from `bun:test` to mock functions or entire modules. This is essential for isolating tests from external dependencies like APIs or the file system.
- **Lifecycle Hooks for Cleanup**: Use `beforeEach` or `afterEach` to set up and tear down mocks, ensuring tests are isolated and do not interfere with one another.

```typescript
import { beforeEach, expect, mock, test } from "bun:test";

// Mock a function
const mockFn = mock(() => "hello world");

// Mock a module
mock.module("@/utils/some-util", () => ({
	someFunction: () => "mocked value",
}));

beforeEach(() => {
	// Resets mocks before each test
	mock.restore();
});
```

### 3. Test Coverage [P1]

- **Running Coverage**: Generate a coverage report to identify untested code paths by running `bun test --coverage`.
- **Critical Path Coverage**: MUST test all critical business logic paths, including success cases, error handling, and edge cases.
- **Coverage Thresholds**: Strive to maintain a high level of code coverage (e.g., >80%) for core services and utilities.

### 4. Advanced Features [P1]

- **`test.each`**: Use `test.each` for parameterized tests to run the same test logic with multiple data sets. This reduces boilerplate and keeps tests DRY (Don't Repeat Yourself).
- **Conditional Tests**: Use `test.if()` to run tests only under specific conditions (e.g., on a particular operating system).
- **Controlling Test Execution**:
  - `test.skip()`: Temporarily disables a test.
  - `test.todo()`: Marks a test as not yet implemented.
  - `test.only()`: Runs only a specific test or suite, which is useful for debugging.

```typescript
// Example of test.each
const cases = [
	[2, 2, 4],
	[10, 5, 15],
];

test.each(cases)("should add %d and %d to get %d", (a, b, expected) => {
	expect(a + b).toBe(expected);
});
```

## Core Testing Requirements [P0]

### Test File Organization [P0]

MUST organize test files in a structure that mirrors the `src` directory. For example, a service at `src/services/database.service.ts` should have its test at `tests/services/database.service.spec.ts`.

### AAA Pattern Implementation [P0]

- **WHEN**: Writing any unit or integration test.
- **WHAT**: MUST structure tests using the **Arrange-Act-Assert** pattern with clear separation.
- **WHY**: Provides a consistent, readable test structure that is easily understood by AI and developers.

### `@ts-expect-error` usage [P1]

When a private property override is needed, for example, `service["privateProp"] = mockValue;`, MUST use `@ts-expect-error` to suppress TypeScript errors, ensuring the intention is clear and avoiding unintended type issues (instead of using `as any` or `@ts-ignore`).

## Error Handling Testing [P0]

### Exception Testing Patterns [P0]

- **WHEN**: Testing functions that are expected to throw errors.
- **WHAT**: MUST test both success and failure scenarios comprehensively.
- **WHY**: Ensures robust error handling and prevents unexpected runtime failures.
- **HOW**: Use `expect().toThrow()` for synchronous code and `expect().rejects.toThrow()` for asynchronous code.

## AI-Generated Test Code Guidelines [P0]

### Test Code Review [P0]

- **WHEN**: Using AI assistance to generate test code.
- **WHAT**: MUST review AI-generated tests for accuracy, completeness, and adherence to these standards.
- **WHY**: AI can generate tests that don't match the actual implementation or may miss critical edge cases.
- **HOW**: Verify that mocks are accurate, assertions properly test the intended behavior, and that the AAA pattern is followed.

### Test Maintenance [P1]

MUST update tests simultaneously when modifying application code to prevent test failures and maintain coverage.

### Top-level Test Suite Descriptor [P1]

MUST include a top-level `@fileoverview` comment in each test file to describe the purpose and scope of the tests contained within. This aids in understanding the context of the tests at a glance, without the need to read through all the code.

```typescript
/**
 * @fileoverview Tests for the {@link DatabaseService}.
 *
 * This suite covers all CRUD operations and error handling for the service.
 */
import { describe, expect, test } from "bun:test";

import { DatabaseService } from "@/services/database.service";

// ...test cases...
```

## Quick Reference Checklist

- [ ] Tests follow the AAA (Arrange-Act-Assert) pattern.
- [ ] All external dependencies are properly mocked using `bun:test`.
- [ ] Test names clearly describe the expected behavior and conditions.
- [ ] Both success and error scenarios are tested.
- [ ] Mocks are restored between tests using `beforeEach` or `afterEach`.
- [ ] `test.each` is used for parameterized testing to avoid duplication.
- [ ] Critical business logic has comprehensive test coverage.
