import { homepage, name, version } from "../../package.json";

/**
 * Available runtime environments for the application.
 *
 * Maps to `NODE_ENV` environment variables
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
} as const;

/** Maximum number of tokens that can be translated in a single request */
export const MAX_CHUNK_TOKENS = 4000;

/**
 * Batch size for concurrent file fetching operations.
 *
 * Balances network efficiency with memory usage during repository tree traversal.
 */
export const FILE_FETCH_BATCH_SIZE = 10;

/**
 * Maximum number of consecutive file processing failures before stopping the workflow.
 *
 * Circuit breaker mechanism to prevent wasting resources on systemic failures.
 * When this threshold is exceeded, the workflow terminates early with a clear error message.
 * Default: 5 consecutive failures.
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

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
	LOG_LEVEL: LogLevel.Info,
	LLM_API_BASE_URL: "https://openrouter.ai/api/v1",
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

	/** Maximum tokens to generate in a single LLM response */
	MAX_TOKENS: 8192,

	/** Whether to enable console logging in addition to file logging */
	LOG_TO_CONSOLE: true,

	/** Timeout for GitHub API requests in milliseconds */
	GH_REQUEST_TIMEOUT: 30_000,

	/** Minimum success rate (0-1) required for workflow to pass */
	MIN_SUCCESS_RATE: 0.75,

	LLM_API_MAX_RETRIES: 5,
	LLM_REQUEST_TIMEOUT: 20_000,
} as const;
