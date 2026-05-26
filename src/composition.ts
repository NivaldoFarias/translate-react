import type { LanguageCacheEntry } from "@/domain/workflow/";

import { openai, queue } from "@/clients/";
import { CacheService } from "@/services/cache/";
import { CommentBuilderService } from "@/services/comment-builder/comment-builder.service";
import { GitHubService } from "@/services/github/github.service";
import { LanguageDetectorService } from "@/services/language-detector/language-detector.service";
import { LocaleService } from "@/services/locale/locale.service";
import { OpenRouterModelLimitsService } from "@/services/openrouter/openrouter-model-limits.service";
import { RunnerService } from "@/services/runner/runner.service";
import { TranslatorService } from "@/services/translator/translator.service";
import { env } from "@/utils/";

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
