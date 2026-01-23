import { Octokit } from "@octokit/rest";
import OpenAI from "openai";

import type { BaseRepositories } from "./github/base.service";

import { env, logger } from "@/utils/";

import { LanguageCacheService } from "./cache/language-cache.service";
import { CommentBuilderService } from "./comment-builder.service";
import { BranchService } from "./github/branch.service";
import { ContentService } from "./github/content.service";
import { RepositoryService } from "./github/repository.service";
import { LanguageDetectorService } from "./language-detector.service";
import { LocaleService } from "./locale";
import { RunnerService } from "./runner/runner.service";
import { TranslatorService } from "./translator.service";

/** Configuration interface for service instantiation */
export interface ServiceConfig {
	/** GitHub Personal Access Token */
	githubToken?: string;

	/** Request timeout in milliseconds */
	requestTimeout: number;

	/** Repository metadata for fork and upstream */
	repositories: BaseRepositories;

	/** LLM API configuration */
	llm: {
		/** LLM API key */
		apiKey?: string;

		/** LLM model to use */
		model: string;

		/** LLM API base URL */
		baseUrl: string;

		/** Optional OpenAI project ID for organization */
		projectId?: string;

		/** Application title for OpenRouter request headers */
		headerAppTitle: string;

		/** Application URL for OpenRouter request headers */
		headerAppUrl: string;
	};
}

/** Creates service configuration from environment variables */
export function createServiceConfigFromEnv(): ServiceConfig {
	return {
		githubToken: env.GH_TOKEN,
		requestTimeout: env.GH_REQUEST_TIMEOUT,
		repositories: {
			upstream: {
				owner: env.REPO_UPSTREAM_OWNER,
				repo: env.REPO_UPSTREAM_NAME,
			},
			fork: {
				owner: env.REPO_FORK_OWNER,
				repo: env.REPO_FORK_NAME,
			},
		},
		llm: {
			apiKey: env.LLM_API_KEY,
			model: env.LLM_MODEL,
			baseUrl: env.LLM_API_BASE_URL,
			projectId: env.OPENAI_PROJECT_ID,
			headerAppTitle: env.HEADER_APP_TITLE,
			headerAppUrl: env.HEADER_APP_URL,
		},
	};
}

/**
 * Lightweight service factory for dependency injection.
 *
 * Creates and manages service instances with proper dependency injection.
 * Uses lazy instantiation and singleton pattern for shared services.
 *
 * ### Usage
 *
 * ```typescript
 * const factory = new ServiceFactory(createServiceConfigFromEnv());
 * const branchService = factory.createBranchService();
 * ```
 *
 * @see {@link createServiceConfigFromEnv} for environment-based configuration
 */
export class ServiceFactory {
	private readonly instances = new Map<string>();
	private readonly config: ServiceConfig;

	constructor(config: ServiceConfig) {
		this.config = config;
	}

	/** Creates or retrieves singleton Octokit instance with logging */
	public getOctokit(): Octokit {
		return this.getOrCreate("octokit", () => this.createOctokit());
	}

	/** Creates RepositoryService with injected dependencies */
	public createRepositoryService(): RepositoryService {
		return this.getOrCreate(
			"repositoryService",
			() =>
				new RepositoryService({
					octokit: this.getOctokit(),
					repositories: this.config.repositories,
				}),
		);
	}

	/** Creates ContentService with injected dependencies */
	public createContentService(): ContentService {
		return this.getOrCreate(
			"contentService",
			() =>
				new ContentService({
					octokit: this.getOctokit(),
					repositories: this.config.repositories,
					commentBuilderService: this.createCommentBuilderService(),
				}),
		);
	}

	/** Creates BranchService with injected dependencies */
	public createBranchService(): BranchService {
		return this.getOrCreate(
			"branchService",
			() =>
				new BranchService({
					octokit: this.getOctokit(),
					repositories: this.config.repositories,
					contentService: this.createContentService(),
				}),
		);
	}

	/** Creates CommentBuilderService instance */
	public createCommentBuilderService(): CommentBuilderService {
		return this.getOrCreate("commentBuilderService", () => new CommentBuilderService());
	}

	/** Creates or retrieves singleton OpenAI client instance */
	public getOpenAI(): OpenAI {
		return this.getOrCreate("openai", () => this.createOpenAI());
	}

	/** Creates TranslatorService with injected dependencies */
	public createTranslatorService(): TranslatorService {
		return this.getOrCreate(
			"translatorService",
			() =>
				new TranslatorService({
					openai: this.getOpenAI(),
					model: this.config.llm.model,
				}),
		);
	}

	/** Creates LanguageCacheService instance */
	public createLanguageCacheService(): LanguageCacheService {
		return this.getOrCreate("languageCacheService", () => new LanguageCacheService());
	}

	/** Creates RunnerService with all dependencies wired up */
	public createRunnerService(): RunnerService {
		return new RunnerService({
			github: {
				branch: this.createBranchService(),
				repository: this.createRepositoryService(),
				content: this.createContentService(),
			},
			translator: this.createTranslatorService(),
			languageCache: this.createLanguageCacheService(),
			locale: LocaleService.get(),
			languageDetector: this.createLanguageDetectorService(),
		});
	}

	/** Creates configured OpenAI client instance */
	private createOpenAI(): OpenAI {
		return new OpenAI({
			baseURL: this.config.llm.baseUrl,
			apiKey: this.config.llm.apiKey,
			project: this.config.llm.projectId,
			defaultHeaders: {
				"X-Title": this.config.llm.headerAppTitle,
				"HTTP-Referer": this.config.llm.headerAppUrl,
			},
		});
	}

	private createLanguageDetectorService(): LanguageDetectorService {
		return this.getOrCreate("languageDetectorService", () => new LanguageDetectorService());
	}
	/** Creates configured Octokit instance with integrated logging */
	private createOctokit(): Octokit {
		/** Octokit-specific logger for GitHub API debugging */
		const octokitLogger = logger.child({ component: "octokit" });

		return new Octokit({
			auth: this.config.githubToken,
			request: { timeout: this.config.requestTimeout },
			log: {
				debug: (message: string) => {
					octokitLogger.debug(message);
				},
				info: (message: string) => {
					octokitLogger.info(message);
				},
				warn: (message: string) => {
					octokitLogger.warn(message);
				},
				error: (message: string) => {
					octokitLogger.error(message);
				},
			},
		});
	}

	private getOrCreate<T>(key: string, factory: () => T): T {
		if (!this.instances.has(key)) {
			this.instances.set(key, factory());
		}

		return this.instances.get(key) as T;
	}
}
