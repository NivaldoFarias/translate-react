import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { components } from "@octokit/openapi-types";
import type { Octokit } from "@octokit/rest";
import type { SetRequired } from "type-fest";

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
 * Only {@link PullRequestProgressAction.Created} belongs in the translation-progress issue comment.
 */
export enum PullRequestProgressAction {
	/** A new pull request was opened after committing the translation */
	Created = "created",

	/** An open translation pull request was already valid; this run did not translate or commit */
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
