import { homepage, name, version } from "../../package.json";

/**
 * Available runtime environments for the application.
 *
 * Maps to `NODE_ENV` and `BUN_ENV` environment variables
 */
export enum RuntimeEnvironment {
	Development = "development",
	Test = "test",
	Staging = "staging",
	Production = "production",
}

/** Logging levels used throughout the application */
export enum LogLevel {
	Trace = "trace",
	Debug = "debug",
	Info = "info",
	Warn = "warn",
	Error = "error",
	Fatal = "fatal",
}

/** Process signal constants used for event handling */
export const processSignals = {
	interrupt: "SIGINT",
	terminate: "SIGTERM",
	uncaughtException: "uncaughtException",
	unhandledRejection: "unhandledRejection",
} satisfies Record<string, NodeJS.Signals | NodeJS.UncaughtExceptionOrigin>;

/** Standard error messages used throughout the application */
export const errorMessages = {
	invalidKey: (key: string) => `Invalid key: ${key}`,
	snapshotSaveFailed: "Failed to save snapshot",
	snapshotAppendFailed: (key: string) => `Failed to append ${key}`,
	snapshotLoadFailed: "Failed to load snapshot",
	snapshotClearFailed: "Failed to clear snapshots",
	snapshotCleanupFailed: "Failed to cleanup snapshots",
	snapshotForceClear: "Forcefully cleared all snapshots as requested by FORCE_SNAPSHOT_CLEAR",
} as const;

/** Keys used in snapshot data structure */
export const snapshotKeys = {
	repositoryTree: "repositoryTree",
	filesToTranslate: "filesToTranslate",
	processedResults: "processedResults",
	timestamp: "timestamp",
} as const;

/** Maximum number of tokens that can be translated in a single request */
export const MAX_CHUNK_TOKENS = 4000;

/**
 * Maximum file size in bytes that can be processed for translation.
 *
 * Files exceeding this limit are skipped to prevent LLM timeouts and resource exhaustion.
 * Set to 200KB based on observed LLM performance characteristics.
 */
export const MAX_FILE_SIZE = 200_000;

/**
 * Batch size for concurrent file fetching operations.
 *
 * Balances network efficiency with memory usage during repository tree traversal.
 */
export const FILE_FETCH_BATCH_SIZE = 10;

/**
 * Minimum confidence threshold for language cache hits, on a scale from 0 to 1.
 *
 * Cache entries below this confidence level are treated as cache misses,
 * triggering fresh language detection to ensure accuracy. Set to 0.8 (80%)
 * based on observed language detection reliability.
 */
export const MIN_CACHE_CONFIDENCE = 0.8;

/** Minimum length required for a valid API token */
export const MIN_API_TOKEN_LENGTH = 20;

/**
 * Official React documentation translation language codes.
 *
 * These are the 38 languages supported by the React community translation effort.
 *
 * @see {@link https://translations.react.dev/|`react.dev` Translation Repositories Homepage}
 */
export const REACT_TRANSLATION_LANGUAGES = [
	"ar",
	"az",
	"be",
	"bn",
	"cs",
	"de",
	"fa",
	"fi",
	"fr",
	"gu",
	"he",
	"hi",
	"hu",
	"id",
	"is",
	"it",
	"ja",
	"kk",
	"ko",
	"lo",
	"mk",
	"ml",
	"mn",
	"pl",
	"pt-br",
	"ru",
	"si",
	"sr",
	"sw",
	"ta",
	"te",
	"tr",
	"uk",
	"ur",
	"vi",
	"zh-hans",
	"zh-hant",
	"en",
] as const;

/** Type for React translation language codes */
export type ReactLanguageCode = (typeof REACT_TRANSLATION_LANGUAGES)[number];

export const environmentDefaults = {
	NODE_ENV: RuntimeEnvironment.Development,
	BUN_ENV: RuntimeEnvironment.Development,
	LOG_LEVEL: LogLevel.Info,
	FORCE_SNAPSHOT_CLEAR: false,
	OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
	HEADER_APP_TITLE: `${name} v${version}`,
	HEADER_APP_URL: homepage,
	REPO_FORK_OWNER: "nivaldofarias",
	REPO_FORK_NAME: "pt-br.react.dev",
	REPO_UPSTREAM_OWNER: "reactjs",
	REPO_UPSTREAM_NAME: "pt-br.react.dev",
	LLM_MODEL: "google/gemini-2.0-flash-exp:free",
	BATCH_SIZE: 1,
	TARGET_LANGUAGE: "pt-br",
	SOURCE_LANGUAGE: "en",
	DEV_MODE_FORK_PR: false,

	/** @see {@link https://github.com/reactjs/pt-br.react.dev/issues/555|Docs Progress Issue (pt-BR)} */
	PROGRESS_ISSUE_NUMBER: 555,

	/** Maximum tokens to generate in a single LLM response */
	MAX_TOKENS: 8192,

	/** Whether to enable console logging in addition to file logging */
	LOG_TO_CONSOLE: true,

	/** Timeout for GitHub API requests in milliseconds */
	GITHUB_REQUEST_TIMEOUT: 30_000,
} as const;

/** Glossary of terms with exact translations to enforce */
export const LANGUAGE_SPECIFIC_RULES = {
	"Brazilian Portuguese": `\n# PORTUGUESE (BRAZIL) SPECIFIC RULES
- ALWAYS translate 'deprecated' and related terms (deprecation, deprecating, deprecates) to 'descontinuado(a)', 'descontinuada', 'obsoleto(a)' or 'obsoleta' in ALL contexts (documentation text, comments, headings, lists, etc.)
	- Exception: Do NOT translate 'deprecated' in HTML comment IDs like {/*deprecated-something*/} - keep these exactly as-is
	- Exception: Do NOT translate 'deprecated' in URLs, anchor links, or code variable names
- When a MDN document is referenced, update the language slug to the Brazilian Portuguese version ('https://developer.mozilla.org/<slug>/*' => 'https://developer.mozilla.org/pt-BR/*')`,
};
