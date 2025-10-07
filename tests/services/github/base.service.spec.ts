/**
 * @fileoverview Tests for the {@link BaseGitHubService}.
 *
 * This suite covers GitHub API client initialization, configuration management,
 * and core functionality for all GitHub-based services.
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { BaseGitHubService } from "@/services/github/base.service";

/**
 * Concrete implementation of BaseGitHubService for testing
 */
class TestGitHubService extends BaseGitHubService {
	public getOctokit() {
		return this.octokit;
	}

	public getUpstream() {
		return this.upstream;
	}

	public getFork() {
		return this.fork;
	}

	public getRateLimit() {
		return this.octokit.rateLimit.get();
	}
}

describe("Base GitHub Service", () => {
	let service: TestGitHubService;
	const mockConfig = {
		upstream: { owner: "test-owner", repo: "test-repo" },
		fork: { owner: "fork-owner", repo: "fork-repo" },
	};

	beforeEach(() => {
		service = new TestGitHubService(mockConfig.upstream, mockConfig.fork);
	});

	test("should initialize with correct configuration", () => {
		expect(service.getOctokit()).toBeDefined();
		expect(service.getUpstream()).toEqual(mockConfig.upstream);
		expect(service.getFork()).toEqual(mockConfig.fork);
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

	test("should handle API errors", async () => {
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

		// @ts-expect-error - Mocking private property
		service.octokit = {
			rateLimit: {
				get: mock(() => Promise.resolve(mockRateLimit)),
			},
		};

		const rateLimit = await service.getRateLimit();
		expect(rateLimit.data.resources.core.remaining).toBe(0);
	});

	test("should use correct repository details", () => {
		expect(service.getUpstream()).toBe(mockConfig.upstream);
		expect(service.getFork()).toBe(mockConfig.fork);
	});
});
