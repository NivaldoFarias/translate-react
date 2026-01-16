import { mock } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import type { PartialDeep } from "type-fest";

/** Factory for creating Git API mocks */
export function createGitMocks() {
	return {
		getRef: mock(() =>
			Promise.resolve({ data: { object: { sha: "abc123def456" } } } as PartialDeep<
				RestEndpointMethodTypes["git"]["getRef"]["response"]
			>),
		),
		createRef: mock(() =>
			Promise.resolve({
				data: { ref: "refs/heads/test-branch", object: { sha: "abc123def456" } },
			} as PartialDeep<RestEndpointMethodTypes["git"]["createRef"]["response"]>),
		),
		deleteRef: mock(() =>
			Promise.resolve({ status: StatusCodes.NO_CONTENT } as PartialDeep<
				RestEndpointMethodTypes["git"]["deleteRef"]["response"]
			>),
		),
		getTree: mock(() =>
			Promise.resolve({
				data: {
					tree: [
						{
							path: "src/test/file.md",
							type: "blob",
							sha: "abc123",
							url: "https://api.github.com/repos/test/test/git/blobs/abc123",
						},
					],
				},
			} as PartialDeep<RestEndpointMethodTypes["git"]["getTree"]["response"]>),
		),
		getBlob: mock(() =>
			Promise.resolve({
				data: { content: Buffer.from("# Test Content").toString("base64"), encoding: "base64" },
			} as PartialDeep<RestEndpointMethodTypes["git"]["getBlob"]["response"]>),
		),
	};
}

/** Factory for creating Repos API mocks */
export function createReposMocks() {
	return {
		get: mock(() =>
			Promise.resolve({ data: { default_branch: "main" } } as PartialDeep<
				RestEndpointMethodTypes["repos"]["get"]["response"]
			>),
		),
		listCommits: mock(() =>
			Promise.resolve({
				data: [{ author: { login: "test-fork-owner" }, sha: "commit123" }],
			} as PartialDeep<RestEndpointMethodTypes["repos"]["listCommits"]["response"]>),
		),
		getContent: mock(() =>
			Promise.resolve({
				data: {
					type: "file",
					encoding: "base64",
					content: Buffer.from("# Test Content").toString("base64"),
					sha: "abc123",
				},
			} as PartialDeep<RestEndpointMethodTypes["repos"]["getContent"]["response"]>),
		),
		createOrUpdateFileContents: mock(() =>
			Promise.resolve({
				data: { content: { sha: "new-sha" }, commit: { sha: "commit-sha" } },
			} as PartialDeep<RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]>),
		),
		mergeUpstream: mock(() =>
			Promise.resolve({
				data: { message: "Successfully synced", merge_type: "fast-forward" },
			} as PartialDeep<RestEndpointMethodTypes["repos"]["mergeUpstream"]["response"]>),
		),
		compareCommits: mock(() =>
			Promise.resolve({
				data: { ahead_by: 0, behind_by: 0 },
			} as PartialDeep<RestEndpointMethodTypes["repos"]["compareCommits"]["response"]>),
		),
	};
}

/** Factory for creating Pulls API mocks */
export function createPullsMocks() {
	return {
		list: mock(() =>
			Promise.resolve({ data: [] } as PartialDeep<
				RestEndpointMethodTypes["pulls"]["list"]["response"]
			>),
		),
		create: mock(() =>
			Promise.resolve({
				data: {
					number: 1,
					title: "test: new translation",
					html_url: "https://github.com/test/test/pull/1",
				},
			} as PartialDeep<RestEndpointMethodTypes["pulls"]["create"]["response"]>),
		),
		get: mock(() =>
			Promise.resolve({
				data: {
					number: 1,
					title: "test: existing PR",
					mergeable: true,
					mergeable_state: "clean",
				},
			} as PartialDeep<RestEndpointMethodTypes["pulls"]["get"]["response"]>),
		),
		update: mock(() =>
			Promise.resolve({ data: { number: 1, state: "closed" } } as PartialDeep<
				RestEndpointMethodTypes["pulls"]["update"]["response"]
			>),
		),
		listFiles: mock(() =>
			Promise.resolve({ data: [{ filename: "src/test/file.md" }] } as PartialDeep<
				RestEndpointMethodTypes["pulls"]["listFiles"]["response"]
			>),
		),
	};
}

/** Factory for creating Issues API mocks */
export function createIssuesMocks() {
	return {
		createComment: mock(() =>
			Promise.resolve({ data: { id: 1, body: "Test comment" } } as PartialDeep<
				RestEndpointMethodTypes["issues"]["createComment"]["response"]
			>),
		),
		get: mock(() =>
			Promise.resolve({
				data: { number: 555, state: "open", title: "Progress Issue" },
			} as PartialDeep<RestEndpointMethodTypes["issues"]["get"]["response"]>),
		),
		listComments: mock(() =>
			Promise.resolve({ data: [] } as PartialDeep<
				RestEndpointMethodTypes["issues"]["listComments"]["response"]
			>),
		),
		updateComment: mock(() =>
			Promise.resolve({ data: { id: 1, body: "Updated comment" } } as PartialDeep<
				RestEndpointMethodTypes["issues"]["updateComment"]["response"]
			>),
		),
	};
}

/** Factory for creating Rate Limit API mocks */
export function createRateLimitMocks() {
	return {
		get: mock(() =>
			Promise.resolve({
				data: {
					resources: {
						core: {
							limit: 5000,
							used: 0,
							remaining: 5000,
							reset: Date.now() / 1000 + 3600,
						},
					},
				},
			} as PartialDeep<RestEndpointMethodTypes["rateLimit"]["get"]["response"]>),
		),
	};
}

/**
 * Creates a fully-configured mock Octokit instance for testing.
 *
 * @param options Override specific API mocks
 *
 * @returns Properly-typed mock Octokit instance ready for service injection
 *
 * @example
 * ```typescript
 * const octokit = createMockOctokit();
 * const service = new BranchService({ octokit, repositories });
 *
 * // With custom mocks for specific test scenarios
 * const octokit = createMockOctokit({
 *   git: { getRef: mock(() => Promise.reject(new Error("Not found"))) },
 * });
 * ```
 */
export function createMockOctokit(options?: {
	git?: Partial<ReturnType<typeof createGitMocks>>;
	repos?: Partial<ReturnType<typeof createReposMocks>>;
	pulls?: Partial<ReturnType<typeof createPullsMocks>>;
	issues?: Partial<ReturnType<typeof createIssuesMocks>>;
	rateLimit?: Partial<ReturnType<typeof createRateLimitMocks>>;
}) {
	return {
		git: { ...createGitMocks(), ...options?.git },
		repos: { ...createReposMocks(), ...options?.repos },
		pulls: { ...createPullsMocks(), ...options?.pulls },
		issues: { ...createIssuesMocks(), ...options?.issues },
		rateLimit: { ...createRateLimitMocks(), ...options?.rateLimit },
		rest: {
			users: {
				getAuthenticated: mock(() =>
					Promise.resolve({ data: { login: "test-user" } } as PartialDeep<
						RestEndpointMethodTypes["users"]["getAuthenticated"]["response"]
					>),
				),
			},
			repos: { ...createReposMocks(), ...options?.repos },
		},
		request: mock(() => Promise.resolve({})),
	};
}

export type MockOctokitGit = ReturnType<typeof createGitMocks>;
export type MockOctokitRepos = ReturnType<typeof createReposMocks>;
export type MockOctokitPulls = ReturnType<typeof createPullsMocks>;
export type MockOctokitIssues = ReturnType<typeof createIssuesMocks>;

/**
 * Helper to create properly-shaped tree items with all required properties.
 */
export function createMockTreeItem(overrides?: {
	path?: string;
	type?: string;
	sha?: string;
	url?: string;
}) {
	return {
		path: overrides?.path ?? "src/test/file.md",
		type: overrides?.type ?? "blob",
		sha: overrides?.sha ?? "abc123",
		url: overrides?.url ?? "https://api.github.com/repos/test/test/git/blobs/abc123",
	};
}

/**
 * Helper to create properly-shaped commit objects with all required properties.
 */
export function createMockCommit(overrides?: { author?: { login: string }; sha?: string }) {
	return {
		author: overrides?.author ?? { login: "test-fork-owner" },
		sha: overrides?.sha ?? "commit123",
	};
}
