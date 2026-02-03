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

interface EnvironmentSchemaDefaults {
	NODE_ENV: RuntimeEnvironment;
	LOG_LEVEL: LogLevel;
	GH_TOKEN: string;
	LLM_API_KEY: string;
	OPENAI_PROJECT_ID: string;
	LLM_API_BASE_URL: string;
	HEADER_APP_TITLE: string;
	HEADER_APP_URL: string;
	REPO_FORK_OWNER: string;
	REPO_FORK_NAME: string;
	REPO_UPSTREAM_OWNER: string;
	REPO_UPSTREAM_NAME: string;
	LLM_MODEL: string;
	BATCH_SIZE: number;
	TARGET_LANGUAGE: ReactLanguageCode;
	SOURCE_LANGUAGE: ReactLanguageCode;
	MAX_TOKENS: number;
	LOG_TO_CONSOLE: boolean;
	GH_REQUEST_TIMEOUT: number;
	MIN_SUCCESS_RATE: number;
	MAX_LLM_CONCURRENCY: number;
	MAX_RETRY_ATTEMPTS: number;
}

/** Placeholders for the environment schema. */
export const ENV_PLACEHOLDERS = {
	REPO_FORK_OWNER: "nivaldofarias",
	REPO_FORK_NAME: "pt-br.react.dev",
	REPO_UPSTREAM_OWNER: "reactjs",
	REPO_UPSTREAM_NAME: "pt-br.react.dev",
	LLM_MODEL: "google/gemini-2.0-flash-exp:free",
	LLM_API_BASE_URL: "https://openrouter.ai/api/v1",
	HEADER_APP_TITLE: `${name} v${version}`,
	HEADER_APP_URL: homepage,
	TARGET_LANGUAGE: "pt-br",
	SOURCE_LANGUAGE: "en",
	BATCH_SIZE: 1,
	GH_TOKEN: "ghp_1234567890abcdefghijklmnopqrstuvwxyzABCD",
	LLM_API_KEY: "sk-1234567890abcdefghijklmnopqrstuvwxyzABCDEF1234567890",
	OPENAI_PROJECT_ID: "",
	MAX_TOKENS: 8192,
	LOG_TO_CONSOLE: true,
	GH_REQUEST_TIMEOUT: 30_000,
	MIN_SUCCESS_RATE: 0.75,
	MAX_RETRY_ATTEMPTS: 3,
	MAX_LLM_CONCURRENCY: 4,
} satisfies Partial<EnvironmentSchemaDefaults>;

export const environmentDefaults: Record<RuntimeEnvironment, EnvironmentSchemaDefaults> = {
	[RuntimeEnvironment.Development]: {
		NODE_ENV: RuntimeEnvironment.Development,
		LOG_LEVEL: LogLevel.Debug,
		...ENV_PLACEHOLDERS,
	},
	[RuntimeEnvironment.Test]: {
		NODE_ENV: RuntimeEnvironment.Test,
		LOG_LEVEL: LogLevel.Debug,
		...ENV_PLACEHOLDERS,
		// @ts-expect-error - actual zod schema validation expects `stringbool`, but type expects boolean
		LOG_TO_CONSOLE: "false",
	},
	[RuntimeEnvironment.Staging]: {
		NODE_ENV: RuntimeEnvironment.Staging,
		LOG_LEVEL: LogLevel.Info,
		...ENV_PLACEHOLDERS,
		BATCH_SIZE: 10,
	},
	[RuntimeEnvironment.Production]: {
		NODE_ENV: RuntimeEnvironment.Production,
		LOG_LEVEL: LogLevel.Warn,
		...ENV_PLACEHOLDERS,
		BATCH_SIZE: 10,
		LOG_TO_CONSOLE: false,
	},
};
