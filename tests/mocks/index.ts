/**
 * Centralized mock factories for dependency injection in tests.
 *
 * Provides type-safe mock instances that can be injected into services
 * via constructor, eliminating the need for `mock.module()` in most cases.
 *
 * @example
 * ```typescript
 * import { createMockOctokit, testRepositories } from "@tests/mocks";
 *
 * const service = new BranchService({
 *   octokit: createMockOctokit(),
 *   repositories: testRepositories,
 * });
 * ```
 */

export * from "./octokit.mock";
export * from "./openai.mock";
export * from "./services.mock";
export * from "./repositories.mock";
