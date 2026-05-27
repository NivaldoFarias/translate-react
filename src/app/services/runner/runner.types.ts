import type { CacheService } from "@/app/services/cache/";
import type { LanguageCacheEntry } from "@/app/services/cache/types";
import type { GitHubService } from "@/app/services/github/";
import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestStatus,
} from "@/app/services/github/types";
import type { LanguageDetectorService } from "@/app/services/language-detector/";
import type { LocaleService } from "@/app/services/locale/";
import type { TranslationFile, TranslatorService } from "@/app/services/translator/";

/**
 * Configuration options for the runner service.
 *
 * Controls batch processing and workflow behavior.
 */
export interface RunnerOptions {
	/** The number of files to process in each batch */
	batchSize: number;
}

/** Dependency injection interface for RunnerService */
export interface RunnerServiceDependencies {
	/** GitHub API services */
	github: GitHubService;

	/** Translation service for LLM operations */
	translator: TranslatorService;

	/** Language detection cache */
	languageCache: CacheService<LanguageCacheEntry>;

	/** Locale service */
	locale: LocaleService;

	/** Language detector service */
	languageDetector: LanguageDetectorService;
}

export interface RunnerState {
	repositoryTree: PatchedRepositoryTreeItem[];
	filesToTranslate: TranslationFile[];
	processedResults: ProcessedFileResult[];
	timestamp: number;

	/**
	 * Map of file paths to invalid PR information.
	 *
	 * Tracks files that have existing PRs with conflicts or unmergeable status.
	 * Used to add informational notes when creating new PRs for these files.
	 */
	invalidPRsByFile?: Map<string, { prNumber: number; status: PullRequestStatus }>;
}
