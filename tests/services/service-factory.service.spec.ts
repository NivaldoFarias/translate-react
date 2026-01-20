import { Octokit } from "@octokit/rest";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import OpenAI from "openai";

import type { ServiceConfig } from "@/services/service-factory.service";

import {
	BranchService,
	CommentBuilderService,
	ContentService,
	LanguageCacheService,
	RepositoryService,
	RunnerService,
	ServiceFactory,
	TranslatorService,
} from "@/services/";
import { createServiceConfigFromEnv } from "@/services/service-factory.service";

/** Creates a minimal valid service configuration for testing */
function createTestConfig(overrides?: Partial<ServiceConfig>): ServiceConfig {
	return {
		githubToken: "test-github-token-12345678901234567890",
		requestTimeout: 30_000,
		repositories: {
			upstream: { owner: "upstream-owner", repo: "upstream-repo" },
			fork: { owner: "fork-owner", repo: "fork-repo" },
		},
		llm: {
			apiKey: "test-llm-api-key-12345678901234567890",
			model: "gpt-4",
			baseUrl: "https://api.openai.com/v1",
			projectId: "test-project",
			headerAppTitle: "Test App",
			headerAppUrl: "https://test.app",
		},
		...overrides,
	};
}

describe("ServiceFactory", () => {
	let factory: ServiceFactory;
	let config: ServiceConfig;

	beforeEach(() => {
		config = createTestConfig();
		factory = new ServiceFactory(config);
	});

	describe("Constructor", () => {
		test("should initialize with provided configuration when valid config is passed", () => {
			expect(factory).toBeInstanceOf(ServiceFactory);
		});

		test("should accept configuration without optional fields", () => {
			const minimalConfig = createTestConfig({});
			const minimalFactory = new ServiceFactory(minimalConfig);

			expect(minimalFactory).toBeInstanceOf(ServiceFactory);
		});
	});

	describe("getOctokit", () => {
		test("should return Octokit instance when called", () => {
			const octokit = factory.getOctokit();

			expect(octokit).toBeInstanceOf(Octokit);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const octokit1 = factory.getOctokit();
			const octokit2 = factory.getOctokit();

			expect(octokit1).toBe(octokit2);
		});

		test("should configure Octokit with authentication token", () => {
			const octokit = factory.getOctokit();

			expect(octokit).toBeDefined();
			expect(octokit.rest).toBeDefined();
		});
	});

	describe("createRepositoryService", () => {
		test("should return RepositoryService instance when called", () => {
			const service = factory.createRepositoryService();

			expect(service).toBeInstanceOf(RepositoryService);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const service1 = factory.createRepositoryService();
			const service2 = factory.createRepositoryService();

			expect(service1).toBe(service2);
		});
	});

	describe("createContentService", () => {
		test("should create ContentService", () => {
			const service = factory.createContentService();

			expect(service).toBeInstanceOf(ContentService);
		});
	});

	describe("createBranchService", () => {
		test("should return BranchService instance when called", () => {
			const service = factory.createBranchService();

			expect(service).toBeInstanceOf(BranchService);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const service1 = factory.createBranchService();
			const service2 = factory.createBranchService();

			expect(service1).toBe(service2);
		});
	});

	describe("createCommentBuilderService", () => {
		test("should return CommentBuilderService instance when called", () => {
			const service = factory.createCommentBuilderService();

			expect(service).toBeInstanceOf(CommentBuilderService);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const service1 = factory.createCommentBuilderService();
			const service2 = factory.createCommentBuilderService();

			expect(service1).toBe(service2);
		});
	});

	describe("getOpenAI", () => {
		test("should return OpenAI instance when called", () => {
			const openai = factory.getOpenAI();

			expect(openai).toBeInstanceOf(OpenAI);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const openai1 = factory.getOpenAI();
			const openai2 = factory.getOpenAI();

			expect(openai1).toBe(openai2);
		});
	});

	describe("createTranslatorService", () => {
		test("should return TranslatorService instance when called", () => {
			const service = factory.createTranslatorService();

			expect(service).toBeInstanceOf(TranslatorService);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const service1 = factory.createTranslatorService();
			const service2 = factory.createTranslatorService();

			expect(service1).toBe(service2);
		});
	});

	describe("createLanguageCacheService", () => {
		test("should return LanguageCacheService instance when called", () => {
			const service = factory.createLanguageCacheService();

			expect(service).toBeInstanceOf(LanguageCacheService);
		});

		test("should return same instance on subsequent calls (singleton)", () => {
			const service1 = factory.createLanguageCacheService();
			const service2 = factory.createLanguageCacheService();

			expect(service1).toBe(service2);
		});
	});

	describe("createRunnerService", () => {
		test("should return RunnerService instance when called", () => {
			const service = factory.createRunnerService();

			expect(service).toBeInstanceOf(RunnerService);
		});

		test("should create new instance on each call (non-singleton)", () => {
			const service1 = factory.createRunnerService();
			const service2 = factory.createRunnerService();

			expect(service1).not.toBe(service2);
		});
	});

	describe("Dependency Wiring", () => {
		test("should wire same Octokit instance to all GitHub services", () => {
			const octokit = factory.getOctokit();
			factory.createRepositoryService();
			factory.createContentService();
			factory.createBranchService();

			const octokitAgain = factory.getOctokit();
			expect(octokit).toBe(octokitAgain);
		});

		test("should wire same OpenAI instance to TranslatorService", () => {
			const openai = factory.getOpenAI();
			factory.createTranslatorService();

			const openaiAgain = factory.getOpenAI();
			expect(openai).toBe(openaiAgain);
		});
	});

	describe("Configuration Isolation", () => {
		test("should create independent factories with different configs", () => {
			const config2 = createTestConfig({ githubToken: "different-token-9876543210" });
			const factory2 = new ServiceFactory(config2);

			const octokit1 = factory.getOctokit();
			const octokit2 = factory2.getOctokit();

			expect(octokit1).not.toBe(octokit2);
		});
	});
});

describe("createServiceConfigFromEnv", () => {
	test("should create configuration from environment variables", () => {
		const config = createServiceConfigFromEnv();

		expect(config).toHaveProperty("githubToken");
		expect(config).toHaveProperty("requestTimeout");
		expect(config).toHaveProperty("repositories");
		expect(config).toHaveProperty("repositories.upstream");
		expect(config).toHaveProperty("repositories.fork");
		expect(config).toHaveProperty("llm");
		expect(config).toHaveProperty("llm.apiKey");
		expect(config).toHaveProperty("llm.model");
		expect(config).toHaveProperty("llm.baseUrl");
	});

	test("should include all required repository configuration", () => {
		const config = createServiceConfigFromEnv();

		expect(config.repositories.upstream).toHaveProperty("owner");
		expect(config.repositories.upstream).toHaveProperty("repo");
		expect(config.repositories.fork).toHaveProperty("owner");
		expect(config.repositories.fork).toHaveProperty("repo");
	});

	test("should include all required LLM configuration", () => {
		const config = createServiceConfigFromEnv();

		expect(config.llm).toHaveProperty("apiKey");
		expect(config.llm).toHaveProperty("model");
		expect(config.llm).toHaveProperty("baseUrl");
		expect(config.llm).toHaveProperty("headerAppTitle");
		expect(config.llm).toHaveProperty("headerAppUrl");
	});
});
