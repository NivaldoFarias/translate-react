import type { LanguageCacheEntry } from "@/app/services/cache/types";

import { openai, queue } from "@/app/clients/";
import { LocaleService } from "@/app/locales/";
import { CacheService } from "@/app/services/cache/";
import { CommentBuilderService } from "@/app/services/comment-builder/";
import { GitHubService } from "@/app/services/github/";
import { LanguageDetectorService } from "@/app/services/language-detector/";
import { OpenRouterModelLimitsService } from "@/app/services/openrouter/";
import { RunnerService } from "@/app/services/runner/";
import { TranslatorService } from "@/app/services/translator/";
import { env } from "@/app/utils/";

/** Locale strings and PR templates for the configured target language */
export const localeService = new LocaleService();

/** CLD-backed language detection */
export const languageDetectorService = new LanguageDetectorService();

/** Markdown for translation-progress issues and PR comments */
export const commentBuilderService = new CommentBuilderService(localeService.definitions);

/** OpenRouter model catalog limits for chunk and completion caps */
export const openRouterModelLimitsService = new OpenRouterModelLimitsService();

/** GitHub API facade (fork, upstream, PRs, commits) */
export const githubService = new GitHubService({ commentBuilderService });

/** LLM translation pipeline */
export const translatorService = new TranslatorService({
	openai,
	model: env.LLM_MODEL,
	queue,
	localeService,
	languageDetectorService,
	openRouterModelLimitsService,
	retryConfig: {
		retries: env.MAX_RETRY_ATTEMPTS,
	},
});

/** End-to-end translation workflow orchestrator */
export const runnerService = new RunnerService({
	github: githubService,
	translator: translatorService,
	languageCache: new CacheService<LanguageCacheEntry>(),
	locale: localeService,
	languageDetector: languageDetectorService,
});
