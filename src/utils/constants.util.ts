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
