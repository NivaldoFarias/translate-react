import type { RestEndpointMethodTypes } from "@octokit/rest";

import type {
	PatchedRepositoryTreeItem,
	RepositoryMarkdownBlob,
} from "@/app/services/github/types";

import type { SharedGitHubDependencies } from "./types";

import { isSafeTranslatablePath, logger } from "@/app/utils/";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

import {
	decodeRepositoryFileContent,
	fetchRepositoryContent,
	fetchRepositoryDefaultBranch,
	isRepositoryContentNotFound,
	readRepositoryFileSha,
} from "./github-api.util";

/** Options for committing translation changes */
export interface CommitTranslationOptions {
	/** Target branch reference */
	branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"];

	/** File path being committed on the fork */
	file: Pick<RepositoryMarkdownBlob, "path">;

	/** Translated content */
	content: string;

	/** Commit message */
	message: string;
}

/**
 * Upstream and fork repository file content operations for the translation workflow.
 */
export class GitHubRepositoryContent {
	private readonly logger = logger.child({ component: GitHubRepositoryContent.name });

	/** Cached upstream default branch ref for repeated `getFile` calls in one run */
	private upstreamDefaultBranchRef: string | undefined;

	/**
	 * @param deps Shared Octokit client and repository coordinates
	 */
	constructor(private readonly deps: SharedGitHubDependencies) {}

	/**
	 * Rejects repository paths that could escape the translatable `src/` tree.
	 *
	 * @param path Repository-relative file path
	 * @param operation Caller operation name for error attribution
	 */
	private assertSafeTranslatablePath(path: string, operation: string): void {
		if (isSafeTranslatablePath(path)) return;

		throw new ApplicationError(
			`Unsafe translatable path rejected: ${path}`,
			ErrorCode.ResourceLoadError,
			operation,
			{ path },
		);
	}

	/**
	 * Commits translated content to a branch.
	 *
	 * Updates an existing file or creates a new one. Resolves the blob `sha` on the
	 * target branch immediately before the commit so reused topic branches do not
	 * send a stale tree `sha` (GitHub returns HTTP 409 when the `sha` does not match).
	 *
	 * @param options Commit options
	 * @param options.branch Target branch ref for the commit
	 * @param options.file File metadata including path and optional stale `sha`
	 * @param options.content UTF-8 translated file body
	 * @param options.message Commit message for the translation
	 *
	 * @returns Octokit `createOrUpdateFileContents` response
	 */
	public async commitTranslation({
		branch,
		file,
		content,
		message,
	}: CommitTranslationOptions): Promise<
		RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]
	> {
		this.assertSafeTranslatablePath(
			file.path,
			`${GitHubRepositoryContent.name}.${this.commitTranslation.name}`,
		);

		const blobShaOnBranch = await this.resolveBlobShaOnBranchForPath(branch.ref, file.path);

		const response = await this.deps.octokit.repos.createOrUpdateFileContents({
			...this.deps.repositories.fork,
			path: file.path,
			message,
			content: Buffer.from(content).toString("base64"),
			branch: branch.ref,
			...(blobShaOnBranch !== undefined ? { sha: blobShaOnBranch } : {}),
		});

		this.logger.info(
			{
				filePath: file.path,
				branch: branch.ref,
				commitSha: response.data.commit.sha,
			},
			"Translation committed successfully",
		);

		return response;
	}

	/**
	 * Fetches source markdown from the upstream default branch at `file.path`.
	 *
	 * Uses `repos.getContent` on the upstream repository so discovery always reads
	 * source from `main` (or the upstream default), not bytes from a fork
	 * `translate/...` branch that may already contain a translation.
	 *
	 * @param file File reference from the upstream repository tree
	 *
	 * @returns Upstream markdown blob content and `sha`
	 */
	public async getFile(file: PatchedRepositoryTreeItem): Promise<RepositoryMarkdownBlob> {
		this.assertSafeTranslatablePath(
			file.path,
			`${GitHubRepositoryContent.name}.${this.getFile.name}`,
		);

		const ref = await this.resolveUpstreamDefaultBranchRef();

		const response = await fetchRepositoryContent(
			this.deps.octokit,
			this.deps.repositories.upstream,
			file.path,
			ref,
		);

		if (Array.isArray(response.data)) {
			throw new ApplicationError(
				`Expected file at path but received directory listing: ${file.path}`,
				ErrorCode.ResourceLoadError,
				`${GitHubRepositoryContent.name}.${this.getFile.name}`,
				{ path: file.path, ref },
			);
		}

		const content = decodeRepositoryFileContent(response.data);

		if (!content) {
			throw new ApplicationError(
				`Upstream file has no content: ${file.path}`,
				ErrorCode.ResourceLoadError,
				`${GitHubRepositoryContent.name}.${this.getFile.name}`,
				{ path: file.path, ref },
			);
		}

		return {
			content,
			filename: file.filename,
			path: file.path,
			sha: response.data.sha || file.sha,
		};
	}

	/**
	 * Reads file content from the fork at a translation branch tip.
	 *
	 * @param path Repository path of the markdown file
	 * @param branchName Translation branch name without `refs/heads/` prefix
	 *
	 * @returns File body as UTF-8 text, or `undefined` when the path is missing on that branch
	 */
	public async getForkFileContentAtBranch(path: string, branchName: string) {
		const branchRef = `refs/heads/${branchName}`;

		try {
			const response = await fetchRepositoryContent(
				this.deps.octokit,
				this.deps.repositories.fork,
				path,
				branchRef,
			);

			if (Array.isArray(response.data)) {
				this.logger.warn(
					{ path, branchRef },
					"GitHub returned a directory listing for fork branch content lookup",
				);

				return undefined;
			}

			return decodeRepositoryFileContent(response.data);
		} catch (error) {
			if (isRepositoryContentNotFound(error)) {
				return undefined;
			}

			throw error;
		}
	}

	/**
	 * Looks up the current file blob `sha` on the fork at `branchRef`, or `undefined`
	 * when the path is absent on that branch (create instead of update).
	 *
	 * @param branchRef Full ref such as `refs/heads/translate/foo`
	 * @param path Repository path of the file
	 *
	 * @returns Blob `sha` on the branch, or `undefined` when the path is absent (create)
	 */
	private async resolveBlobShaOnBranchForPath(branchRef: string, path: string) {
		try {
			const existing = await fetchRepositoryContent(
				this.deps.octokit,
				this.deps.repositories.fork,
				path,
				branchRef,
			);

			if (Array.isArray(existing.data)) {
				this.logger.warn(
					{ path, branchRef },
					"GitHub returned a directory listing for getContent; omitting sha for file update",
				);

				return undefined;
			}

			return readRepositoryFileSha(existing.data);
		} catch (error) {
			if (isRepositoryContentNotFound(error)) {
				return undefined;
			}

			throw error;
		}
	}

	/**
	 * Resolves and caches the upstream repository default branch name.
	 *
	 * @returns Default branch name (for example `main`)
	 */
	private async resolveUpstreamDefaultBranchRef() {
		if (this.upstreamDefaultBranchRef) {
			return this.upstreamDefaultBranchRef;
		}

		const response = await fetchRepositoryDefaultBranch(
			this.deps.octokit,
			this.deps.repositories.upstream,
		);
		this.upstreamDefaultBranchRef = response;

		return this.upstreamDefaultBranchRef;
	}
}
