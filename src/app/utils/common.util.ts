import { version } from "@package";
import { StatusCodes } from "http-status-codes";

import type { ProgressCommentRunContext } from "@/app/locales/types";
import type { Environment } from "@/app/schemas/env.schema";
import type { RepositoryTreeItem } from "@/app/services/github/types";

import {
	MS_PER_SECOND,
	processSignals,
	RATE_LIMIT_PATTERNS,
	WORKFLOW_RUNNER_REPOSITORY_HTML_BASE,
} from "@/app/constants";
import { env } from "@/app/schemas/env.schema";

export * from "@/shared/utils/nfts-date.util";

type ResolveStringTruthy<Value> = Value extends false | null | undefined | 0 | "" ? never : Value;

/**
 * Returns `whenTrue` when `value` is truthy, otherwise `whenFalse`.
 *
 * Pass a function for `whenTrue` to receive the narrowed `value` or to defer
 * building the string until the value is known to be truthy.
 *
 * @param value Truthy check for including `whenTrue`
 * @param whenTrue String to return, or a factory receiving the narrowed `value`
 * @param whenFalse Value when `value` is falsy (default empty string)
 *
 * @returns `whenTrue` or its result when `value` is truthy, else `whenFalse`
 *
 * @example
 * ```typescript
 * resolveString(hasRetries, `[^retries]: ${note}\n`);
 * resolveString(runContext, (ctx) => `[${ctx.runId}](${ctx.url})`);
 * resolveString(workflowRunLine, (line) => `${line}\n`);
 * ```
 */
export function resolveString<Value>(
	value: Value,
	whenTrue: string | ((resolved: ResolveStringTruthy<Value>) => string),
	whenFalse = "",
) {
	if (!value) {
		return whenFalse;
	}

	if (typeof whenTrue === "function") {
		return whenTrue(value as ResolveStringTruthy<Value>);
	}

	return whenTrue;
}

/**
 * Formats a time duration in milliseconds to a human-readable string.
 *
 * Uses the {@link Intl.NumberFormat} API with `style: "unit"` for proper
 * locale-independent duration formatting.
 *
 * @param elapsedTime The elapsed time in milliseconds
 * @param locale The locale to use for formatting (default: "en")
 *
 * @returns A formatted duration string (e.g., "5 seconds", "2 minutes", "1 hour")
 *
 * @example
 * ```typescript
 * formatElapsedTime(5000); // "5 seconds"
 * formatElapsedTime(120000); // "2 minutes"
 * formatElapsedTime(3600000, "pt-BR"); // "1 hora"
 * ```
 */
export function formatElapsedTime(
	elapsedTime: number,
	locale: Intl.LocalesArgument = "en",
): string {
	const seconds = Math.floor(elapsedTime / MS_PER_SECOND);

	const formatUnit = (value: number, unit: "second" | "minute" | "hour") =>
		new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "long" }).format(value);

	if (seconds < 60) {
		return formatUnit(seconds, "second");
	} else if (seconds < 3600) {
		return formatUnit(Math.floor(seconds / 60), "minute");
	} else {
		return formatUnit(Math.floor(seconds / 3600), "hour");
	}
}

/** Registry for cleanup functions to be executed on process termination */
const cleanupRegistry = new Set<(...args: unknown[]) => void | Promise<void>>();

/** Tracks whether signal handlers have been registered */
let signalHandlersRegistered = false;

/**
 * Registers a cleanup function to be executed on process termination.
 *
 * @param cleanUpFn The cleanup function to register
 */
export function registerCleanup(cleanUpFn: (...args: unknown[]) => void | Promise<void>): void {
	cleanupRegistry.add(cleanUpFn);
}

/**
 * Sets up process signal handlers with proper error management.
 *
 * Registers handlers once at application startup. All registered cleanup functions
 * will be executed when a termination signal is received.
 *
 * @param errorReporter Optional error reporter for cleanup failures
 */
export function setupSignalHandlers(
	errorReporter?: (message: string, error: unknown) => void,
): void {
	if (signalHandlersRegistered) {
		return;
	}

	signalHandlersRegistered = true;

	const executeCleanups = async (...args: unknown[]) => {
		for (const cleanUpFn of cleanupRegistry) {
			try {
				await cleanUpFn(...args);
			} catch (error) {
				if (errorReporter) {
					errorReporter("Cleanup failed:", error);
				}
			}
		}
	};

	for (const signal of Object.values(processSignals)) {
		process.on(signal, (...args: unknown[]) => {
			void executeCleanups(...args);
		});
	}
}

/**
 * Filters repository tree for markdown files.
 *
 * @param tree Repository tree from GitHub API
 */
export function filterMarkdownFiles(tree: RepositoryTreeItem[]): RepositoryTreeItem[] {
	return tree.filter((item) => {
		if (!item.path) return false;
		if (!item.path.endsWith(".md")) return false;
		if (!item.path.includes("/")) return false;
		if (!item.path.startsWith("src/")) return false;

		return true;
	});
}

/**
 * Detects if an error message indicates a rate limit has been exceeded.
 *
 * @param errorMessage The error message to analyze
 * @param statusCode Optional HTTP status code to check
 *
 * @returns `true` if the error indicates a rate limit has been exceeded
 *
 * @example
 * ```typescript
 * import { detectRateLimit } from "@/app/utils/";
 *
 * const error = new Error("Rate limit exceeded");
 * const isRateLimit = detectRateLimit(error.message);
 * console.log(isRateLimit); // true
 *
 * const apiError = { message: "429 Too Many Requests", status: 429 };
 * const isRateLimit2 = detectRateLimit(apiError.message, apiError.status);
 * console.log(isRateLimit2); // true
 * ```
 */
export function detectRateLimit(errorMessage: string, statusCode?: number): boolean {
	if (statusCode === StatusCodes.TOO_MANY_REQUESTS) {
		return true;
	}

	return RATE_LIMIT_PATTERNS.some((pattern) => errorMessage.toLowerCase().includes(pattern));
}

/** Path segment GitHub uses for the issue template picker */
const ISSUE_CHOOSER_PATH = "/issues/new/choose" as const;

export interface RunnerIssueChooserUrlParams {
	/** Value of `GITHUB_SERVER_URL` when present */
	readonly githubServerUrl: string | undefined;

	/** Value of `GITHUB_REPOSITORY` (`owner/repo`) when present */
	readonly githubRepository: string | undefined;
}

/**
 * Resolves the fork branch name used for a documentation path translation PR.
 *
 * @param filePath Repository path such as `src/content/reference/react/legacy.md`
 *
 * @returns Branch name such as `translate/reference/react/legacy.md`
 */
export function getTranslationBranchNameFromPath(filePath: string) {
	return `translate/${filePath.split("/").slice(2).join("/")}`;
}

/**
 * Builds the GitHub issue template chooser URL for this workflow runner (not React docs repos).
 *
 * @param params GitHub Actions-style repository coordinates
 *
 * @returns Absolute URL ending with `/issues/new/choose`
 */
export function buildRunnerNewIssueChooserUrl(params: RunnerIssueChooserUrlParams) {
	const serverBase = params.githubServerUrl?.replace(/\/$/, "") ?? "https://github.com";
	const repositorySlug = params.githubRepository?.trim();

	if (isGithubRepositorySlug(repositorySlug)) {
		return `${serverBase}/${repositorySlug}${ISSUE_CHOOSER_PATH}`;
	}

	return `${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}${ISSUE_CHOOSER_PATH}`;
}

/**
 * Resolves the issue chooser URL using validated environment (`GITHUB_SERVER_URL`, `GITHUB_REPOSITORY`).
 *
 * @returns Absolute URL ending with `/issues/new/choose`
 */
export function resolveRunnerNewIssueChooserUrl() {
	return buildRunnerNewIssueChooserUrl({
		githubServerUrl: env.GITHUB_SERVER_URL,
		githubRepository: env.GITHUB_REPOSITORY,
	});
}

type GitHubActionsRunEnvSlice = Pick<
	Environment,
	"GITHUB_ACTIONS" | "GITHUB_SERVER_URL" | "GITHUB_REPOSITORY" | "GITHUB_RUN_ID" | "GITHUB_WORKFLOW"
>;

/**
 * Builds the GitHub release page URL for a `translate-react` version tag.
 *
 * @param runnerVersion Semantic version tag (e.g. `v0.2.2`)
 *
 * @returns Absolute URL to `releases/tag/<runnerVersion>` on the runner repository
 */
export function buildRunnerReleaseUrl(runnerVersion: string) {
	return `${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/releases/tag/${runnerVersion}`;
}

/**
 * Resolves metadata for the current GitHub Actions workflow run when available.
 *
 * @param runtimeEnv Environment slice to read; defaults to the process {@link env}
 *
 * @returns Run metadata for issue comments and PR bodies, or `undefined` if not in CI
 */
export function resolveGitHubActionsRunContext(
	runtimeEnv: GitHubActionsRunEnvSlice = env,
): ProgressCommentRunContext | undefined {
	if (!runtimeEnv.GITHUB_ACTIONS) {
		return;
	}

	const repository = runtimeEnv.GITHUB_REPOSITORY?.trim();
	const runId = runtimeEnv.GITHUB_RUN_ID?.trim();

	if (!repository || !runId) {
		return;
	}

	const serverFromEnv = runtimeEnv.GITHUB_SERVER_URL?.trim();
	const serverBase = (
		serverFromEnv && serverFromEnv.length > 0 ?
			serverFromEnv
		:	"https://github.com").replace(/\/$/, "");
	const url = `${serverBase}/${repository}/actions/runs/${runId}`;
	const namedWorkflow = runtimeEnv.GITHUB_WORKFLOW?.trim();
	const workflowName = namedWorkflow && namedWorkflow.length > 0 ? namedWorkflow : "GitHub Actions";
	const runnerVersion = `v${version}`;

	return {
		version: runnerVersion,
		releaseUrl: buildRunnerReleaseUrl(runnerVersion),
		url,
		workflowName,
		runId,
	};
}

function isGithubRepositorySlug(value: string | undefined): value is string {
	if (!value) {
		return false;
	}

	const slashIndex = value.indexOf("/");

	if (slashIndex <= 0 || slashIndex === value.length - 1) {
		return false;
	}

	const owner = value.slice(0, slashIndex);
	const repo = value.slice(slashIndex + 1);

	return owner.length > 0 && repo.length > 0 && !value.includes("//");
}
