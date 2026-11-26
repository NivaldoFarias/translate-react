---
paths:
  - "tests/**"
  - "**/*.spec.ts"
---

# Tests (Bun)

The suite exists to prove workflow behaviour: expected outcomes, error outcomes and edge cases. Type-safety in tests comes second and never blocks coverage.

## Structure

- Mirror `src/` under `tests/` with `.spec.ts` files. Group by method or feature in nested `describe` blocks.
- Name tests by behaviour: `"returns default branch when fork exists"`, `"throws when ..."`.
- Arrange, Act, Assert, separated by blank lines, not comments. Use one Act per test, and keep loops and conditionals out of test bodies: split the test or use `test.each`.
- Reset mocks and build fresh instances in `beforeEach`. Tests must pass alone and in any order, with no real clock, randomness or network.
- Assert behaviour (return values, thrown errors) over call arguments to internal collaborators.
- Never commit `test.only`.

## Rejections

Assert promise rejections without `await`. The suite uses this style consistently:

```typescript
test("throws RequestError when repository does not exist", () => {
	const { service, mocks } = createTestRepositoryService();
	mocks.repos.get.mockRejectedValue(new Error("Not Found"));

	expect(service.getDefaultBranch()).rejects.toThrow(RequestError);
});
```

## Mocking

- Mock at service boundaries (GitHub, LLM, file system, network) and test the logic in between.
- Prefer constructor injection. Use `mock.module()` only for what can't be injected.
- Type reusable mocks at the factory using production return types, and export a shared `Mock*Fn` type. Shape per-test overrides with `satisfies` or fixture helpers. If a DI boundary needs a cast, keep that one cast in the test harness.
- `mock.module` leaks across files, so inject native dependencies instead (`LanguageDetectorService` takes its CLD `detect`).

## Coverage of cases

- Cover diverse, realistic failure modes (partial translations, mixed-language content, malformed markdown) instead of near-duplicate happy paths.
- Before shipping a remediation, expand the fixture matrix so it mirrors production processing.
- React docs fixtures live in `tests/fixtures/md/`, imported as text and registered in `workflow.manifest.ts`. Fetch new ones from `reactjs/react.dev` (not `en.react.dev`):

```bash
gh api repos/reactjs/react.dev/contents/<path> | jq -r '.content' | base64 -d > tests/fixtures/md/<basename>.md
```
