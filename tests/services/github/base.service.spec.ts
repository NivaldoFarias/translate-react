import { beforeEach, describe, expect, mock, test } from "bun:test";

import { BaseGitHubService } from "@/services/github/base.service";

void mock.module("@/utils/env.util", () => ({
	env: {
		GITHUB_TOKEN: "gho_test_token_with_40_characters_exactly",
		REPO_UPSTREAM_OWNER: "test-owner",
		REPO_UPSTREAM_NAME: "test-repo",
		REPO_FORK_OWNER: "fork-owner",
		REPO_FORK_NAME: "fork-repo",
	},
}));

/**
 * Concrete implementation of BaseGitHubService for testing
 */
class TestGitHubService extends BaseGitHubService {
	public getOctokit() {
		return this.octokit;
	}

	public getUpstream() {
		return this.repositories.upstream;
	}

	public getFork() {
		return this.repositories.fork;
	}

	public getRateLimit() {
		return this.octokit.rateLimit.get();
	}
}

describe("Base GitHub Service", () => {
	let service: TestGitHubService;

	beforeEach(() => {
		service = new TestGitHubService();
	});

	test("should initialize with configuration from environment", () => {
		expect(service.getOctokit()).toBeDefined();
		expect(service.getUpstream()).toBeDefined();
		expect(service.getFork()).toBeDefined();
	});

	test("should have valid Octokit instance", () => {
		const octokit = service.getOctokit();
		expect(octokit).toBeDefined();
		expect(octokit.rest).toBeDefined();
		expect(typeof octokit.request).toBe("function");
	});

	test("should store configuration correctly", () => {
		expect(service.getUpstream()).toEqual({ owner: "test-owner", repo: "test-repo" });
		expect(service.getFork()).toEqual({ owner: "fork-owner", repo: "fork-repo" });
	});

	test("should handle API rate limits", async () => {
		const mockRateLimit = {
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
		};

		// @ts-expect-error - Mocking private property
		service.octokit = {
			rateLimit: {
				get: mock(() => Promise.resolve(mockRateLimit)),
			},
		};

		const rateLimit = await service.getRateLimit();
		expect(rateLimit.data.resources.core.limit).toBe(5000);
		expect(rateLimit.data.resources.core.remaining).toBe(5000);
	});

	test("should handle API errors", () => {
		// @ts-expect-error - Mocking private property
		service.octokit = {
			rateLimit: {
				get: mock(() => Promise.reject(new Error("API Error"))),
			},
		};

		expect(service.getRateLimit()).rejects.toThrow("API Error");
	});

	test("should handle rate limit exceeded", async () => {
		const mockRateLimit = {
			data: {
				resources: {
					core: {
						limit: 5000,
						used: 5000,
						remaining: 0,
						reset: Date.now() / 1000 + 3600,
					},
				},
			},
		};

		// @ts-expect-error - Mocking private property for testing
		service.octokit = {
			rateLimit: {
				get: mock(() => Promise.resolve(mockRateLimit)),
			},
		};

		const rateLimit = await service.getRateLimit();
		expect(rateLimit.data.resources.core.remaining).toBe(0);
	});

	test("should use correct repository details from environment", () => {
		const upstream = service.getUpstream();
		const fork = service.getFork();

		expect(upstream).toBeDefined();
		expect(upstream.owner).toBeDefined();
		expect(upstream.repo).toBeDefined();

		expect(fork).toBeDefined();
		expect(fork.owner).toBeDefined();
		expect(fork.repo).toBeDefined();
	});
});
