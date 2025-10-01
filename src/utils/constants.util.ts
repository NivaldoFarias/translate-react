import { homepage, name, version } from "../../package.json";

/**
 * Available runtime environments for the application.
 *
 * @remarks Maps to `NODE_ENV` and `BUN_ENV` environment variables
 */
export enum RuntimeEnvironment {
	DEVELOPMENT = "development",
	TEST = "test",
	STAGING = "staging",
	PRODUCTION = "production",
}

/** Process signal constants used for event handling */
export const PROCESS_SIGNALS = {
	INTERRUPT: "SIGINT",
	TERMINATE: "SIGTERM",
	UNCAUGHT_EXCEPTION: "uncaughtException",
	UNHANDLED_REJECTION: "unhandledRejection",
} satisfies Record<string, NodeJS.Signals | NodeJS.UncaughtExceptionOrigin>;

/** Standard error messages used throughout the application */
export const ERROR_MESSAGE = {
	INVALID_KEY: (key: string) => `Invalid key: ${key}`,
	SNAPSHOT_SAVE_FAILED: "Failed to save snapshot",
	SNAPSHOT_APPEND_FAILED: (key: string) => `Failed to append ${key}`,
	SNAPSHOT_LOAD_FAILED: "Failed to load snapshot",
	SNAPSHOT_CLEAR_FAILED: "Failed to clear snapshots",
	SNAPSHOT_CLEANUP_FAILED: "Failed to cleanup snapshots",
	SNAPSHOT_FORCE_CLEAR: "Forcefully cleared all snapshots as requested by FORCE_SNAPSHOT_CLEAR",
} as const;

/** Keys used in snapshot data structure */
export const SNAPSHOT_KEYS = {
	REPOSITORY_TREE: "repositoryTree",
	FILES_TO_TRANSLATE: "filesToTranslate",
	PROCESSED_RESULTS: "processedResults",
	TIMESTAMP: "timestamp",
} as const;

/** Maximum number of tokens that can be translated in a single request */
export const MAX_CHUNK_TOKENS = 4000;

export const ENV_DEFAULTS = {
	NODE_ENV: RuntimeEnvironment.DEVELOPMENT,
	BUN_ENV: RuntimeEnvironment.DEVELOPMENT,
	FORCE_SNAPSHOT_CLEAR: false,
	OPENAI_BASE_URL: "https://openrouter.ai/api/v1",
	HEADER_APP_TITLE: `${name} v${version}`,
	HEADER_APP_URL: homepage,
	REPO_FORK_OWNER: "nivaldofarias",
	REPO_FORK_NAME: "pt-br.react.dev",
	REPO_UPSTREAM_OWNER: "reactjs",
	REPO_UPSTREAM_NAME: "pt-br.react.dev",
	PROGRESS_ISSUE_NUMBER: 555, // https://github.com/reactjs/pt-br.react.dev/issues/555
	LLM_MODEL: "google/gemini-2.0-flash-exp:free",
};
