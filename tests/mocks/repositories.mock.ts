import type { BaseRepositories } from "@/services/";

/**
 * Standard test repositories configuration.
 *
 * Use this for consistent repository metadata across all tests.
 */
export const testRepositories: BaseRepositories = {
	upstream: {
		owner: "test-upstream-owner",
		repo: "test-upstream-repo",
	},
	fork: {
		owner: "test-fork-owner",
		repo: "test-fork-repo",
	},
};

/**
 * Creates custom test repositories with optional overrides.
 *
 * @param overrides Partial repository configuration to merge
 *
 * @returns Complete BaseRepositories configuration
 */
export function createTestRepositories(
	overrides?: Partial<{
		upstream: Partial<BaseRepositories["upstream"]>;
		fork: Partial<BaseRepositories["fork"]>;
	}>,
): BaseRepositories {
	return {
		upstream: {
			...testRepositories.upstream,
			...overrides?.upstream,
		},
		fork: {
			...testRepositories.fork,
			...overrides?.fork,
		},
	};
}
