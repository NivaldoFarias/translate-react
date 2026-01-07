import { Octokit } from "@octokit/rest";
import { createMockOctokit, testRepositories } from "@tests/mocks";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { BaseGitHubServiceDependencies } from "@/services/";

import { BaseGitHubService } from "@/services/";

/** Concrete test implementation of BaseGitHubService */
class TestGitHubService extends BaseGitHubService {
	public getOctokit(): Octokit {
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

/** Creates test service with dependencies */
function createTestService(overrides?: Partial<BaseGitHubServiceDependencies>): TestGitHubService {
	const defaults: BaseGitHubServiceDependencies = {
		octokit: createMockOctokit() as unknown as Octokit,
		repositories: testRepositories,
	};
	return new TestGitHubService({ ...defaults, ...overrides });
}

describe("Base GitHub Service", () => {
	let service: TestGitHubService;

	beforeEach(() => {
		service = createTestService();
	});

	test("should initialize with configuration when service is created", () => {
		expect(service.getOctokit()).toBeDefined();
		expect(service.getUpstream()).toBeDefined();
		expect(service.getFork()).toBeDefined();
	});

	test("should have valid Octokit instance when initialized", () => {
		const octokit = service.getOctokit();
		expect(octokit).toBeDefined();
		expect(octokit.rest).toBeDefined();
		expect(typeof octokit.request).toBe("function");
	});

	test("should store configuration correctly", () => {
		expect(service.getUpstream()).toEqual({
			owner: "test-upstream-owner",
			repo: "test-upstream-repo",
		});
		expect(service.getFork()).toEqual({ owner: "test-fork-owner", repo: "test-fork-repo" });
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

		const mockOctokit = {
			rest: {},
			request: mock(() => Promise.resolve({})),
			rateLimit: { get: mock(() => Promise.resolve(mockRateLimit)) },
		} as unknown as Octokit;

		service = createTestService({ octokit: mockOctokit });

		const rateLimit = await service.getRateLimit();
		expect(rateLimit.data.resources.core.limit).toBe(5000);
		expect(rateLimit.data.resources.core.remaining).toBe(5000);
	});

	test("should handle API errors", () => {
		const mockOctokit = {
			rest: {},
			request: mock(() => Promise.resolve({})),
			rateLimit: { get: mock(() => Promise.reject(new Error("API Error"))) },
		} as unknown as Octokit;

		service = createTestService({ octokit: mockOctokit });

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

		const mockOctokit = {
			rest: {},
			request: mock(() => Promise.resolve({})),
			rateLimit: { get: mock(() => Promise.resolve(mockRateLimit)) },
		} as unknown as Octokit;

		service = createTestService({ octokit: mockOctokit });

		const rateLimit = await service.getRateLimit();
		expect(rateLimit.data.resources.core.remaining).toBe(0);
	});

	test("should use correct repository details from configuration", () => {
		const upstream = service.getUpstream();
		const fork = service.getFork();

		expect(upstream).toBeDefined();
		expect(upstream.owner).toBe("test-upstream-owner");
		expect(upstream.repo).toBe("test-upstream-repo");

		expect(fork).toBeDefined();
		expect(fork.owner).toBe("test-fork-owner");
		expect(fork.repo).toBe("test-fork-repo");
	});
});
