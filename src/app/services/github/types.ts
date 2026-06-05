import type { components } from "@octokit/openapi-types";
import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";
import type { SetRequired } from "type-fest";

import type { TranslationLlmUsageTotals } from "@/app/services/translator/llm/translation-llm.usage";

/** Post-translation validation retry surfaced on processed file results and PR metadata */
export interface TranslationRetryInfo {
	/** Stable guard id for logs and error context */
	guardId: string;

	/** Short description for operators and error messages */
	message: string;
}

/** Maintainer-facing validation hint surfaced on the translation pull request */
export interface ReviewerValidationNotice {
	/** Stable guard id matching the post-translation guard */
	guardId: string;

	/** Actionable fix text from the guard's `retryHint` */
	hint: string;
}

/** Markdown blob fetched from a repository default branch or fork ref */
export interface RepositoryMarkdownBlob {
	/** File body as UTF-8 text */
	content: string;

	/** Display filename extracted from the repository path */
	filename: string;

	/** Repository path of the blob */
	path: string;

	/** Git object id for the blob */
	sha: string;
}

/** Minimal file identity for progress-issue comment pairing */
export interface TranslationProgressFileRef {
	/** Display filename used to match {@link ProcessedFileResult.filename} */
	filename: string;

	/** Repository path used to build hierarchical progress comments */
	path: string;
}

/** GitHub repository metadata for fork and upstream repositories */
export interface RepositoryMetadata {
	owner: components["parameters"]["owner"];
	repo: components["parameters"]["repo"];
	[key: string]: unknown;
}

export interface BaseRepositories {
	upstream: RepositoryMetadata;
	fork: RepositoryMetadata;
}

export interface SharedGitHubDependencies {
	octokit: Octokit;
	repositories: BaseRepositories;
}

/**
 * How this workflow run affected the pull request for a translated file.
 *
 * Only {@link PullRequestProgressAction.Created} and {@link PullRequestProgressAction.Reused}
 * belong in the translation-progress issue comment (in separate sections).
 */
export enum PullRequestProgressAction {
	/** A new pull request was opened after committing the translation */
	Created = "created",

	/** An existing open translation pull request received a new commit in this run */
	Reused = "reused",
}

/**
 * Result metadata for a single processed file.
 *
 * Captures all artifacts and outcomes from the translation workflow,
 * including branch references, translations, pull requests, and errors.
 */
export interface ProcessedFileResult {
	/** Git reference for the translation branch created for this file */
	branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;

	/** Name of the file being processed */
	filename: string;

	/** Translated content (null if translation failed) */
	translation: string | null;

	/** Advisory post-translation guard hints for maintainers (empty if clean) */
	reviewerNotices: readonly ReviewerValidationNotice[];

	/** Aggregated LLM token and cost usage when translation succeeded */
	llmUsage?: TranslationLlmUsageTotals;

	/** Pull request created or updated for this translation */
	pullRequest:
		| RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
		| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
		| null;

	/**
	 * Whether this run opened a pull request or reused an existing valid one.
	 *
	 * `null` when no pull request applies (failure, no-op translation, etc.).
	 */
	pullRequestProgress: PullRequestProgressAction | null;

	/** Error encountered during processing (null if successful) */
	error: Error | null;
}

/** Repository tree item from GitHub's Git Tree API */
export type RepositoryTreeItem =
	RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number];

export interface PatchedRepositoryTreeItem extends SetRequired<RepositoryTreeItem, "path" | "sha"> {
	/** Filename extracted from the file path */
	filename: string;
}

/** Normalized pull request issue comment for maintainer-feedback detection */
export interface PullRequestIssueCommentSnapshot {
	/** GitHub login of the comment author */
	readonly login: string;

	/** GitHub `author_association` for the comment */
	readonly authorAssociation: string;

	/** GitHub user `type` (`User`, `Bot`, etc.) */
	readonly userType: string;

	/** When the comment was created */
	readonly createdAt: Date;

	/** Issue comment body markdown */
	readonly body: string;
}

/** Pull request mergeability and conflict status */
export interface PullRequestStatus {
	/** Whether the PR has actual merge conflicts (dirty state) */
	hasConflicts: boolean;

	/** GitHub's raw mergeable flag (can be null during calculation) */
	mergeable: boolean | null;

	/** GitHub's mergeable state string (clean, behind, dirty, etc.) */
	mergeableState: string;

	/** Whether the PR needs to be closed and recreated due to conflicts */
	needsUpdate: boolean;

	/** GitHub username of the PR creator */
	createdBy: string;
}
