/**
 * @fileoverview
 * Test suite for Base GitHub Service
 *
 * Tests core GitHub API functionality
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

	public getToken() {
		return this.githubToken;
	}

	public testFormatError(error: unknown, context: string) {
		return this.formatError(error, context);
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
		token: "test-token",
	};

	beforeEach(() => {
		service = new TestGitHubService(mockConfig.upstream, mockConfig.fork, mockConfig.token);
	});

	test("should initialize with correct configuration", () => {
		expect(service.getOctokit()).toBeDefined();
		expect(service.getUpstream()).toEqual(mockConfig.upstream);
		expect(service.getFork()).toEqual(mockConfig.fork);
		expect(service.getToken()).toBe(mockConfig.token);
	});

	test("should format errors correctly", () => {
		const testError = new Error("Test error");
		const formattedError = service.testFormatError(testError, "Test context");
		expect(formattedError).toBe("Test context: Test error");
	});

	test("should format unknown errors", () => {
		const formattedError = service.testFormatError(null, "Test context");
		expect(formattedError).toBe("Test context: Unknown error");
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
		// @ts-ignore - Mocking private property
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

		// @ts-ignore - Mocking private property
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
