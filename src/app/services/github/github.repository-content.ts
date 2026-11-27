import type { RestEndpointMethodTypes } from "@octokit/rest";

import type {
	PatchedRepositoryTreeItem,
	RepositoryMarkdownBlob,
} from "@/app/services/github/types";

import type { SharedGitHubDependencies } from "./types";

import { baseLogger, isSafeTranslatablePath } from "@/app/utils/";
import { ApplicationError, ErrorCode } from "@/shared/errors/";

import {
	decodeRepositoryFileContent,
	fetchRepositoryContent,
	fetchRepositoryDefaultBranch,
	isRepositoryContentNotFound,
} from "./github-api.util";

/** Options for committing translation changes */
export interface CommitTranslationOptions {
	/** Translation branch to point at the new commit, without the `refs/heads/` prefix */
	branchName: string;

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
	private readonly logger = baseLogger.child({ component: GitHubRepositoryContent.name });

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
	 * Creates a translation commit on top of the fork default branch tip.
	 *
	 * Builds the tree and commit through the Git Data API without touching any branch, so
	 * the caller can move the translation branch to the finished commit in one ref update.
	 * The commit's only parent is the fork default tip, which keeps the translation as the
	 * single commit on its topic branch.
	 *
	 * @param options Commit options; `branchName` is not used here
	 * @param options.file Repository path on the fork
	 * @param options.content UTF-8 translated file body
	 * @param options.message Commit message for the translation
	 *
	 * @returns Octokit `git.createCommit` data for the new commit
	 */
	public async createTranslationCommit({
		file,
		content,
		message,
	}: CommitTranslationOptions): Promise<
		RestEndpointMethodTypes["git"]["createCommit"]["response"]["data"]
	> {
		this.assertSafeTranslatablePath(
			file.path,
			`${GitHubRepositoryContent.name}.${this.createTranslationCommit.name}`,
		);

		const fork = this.deps.repositories.fork;
		const forkDefaultBranch = await fetchRepositoryDefaultBranch(this.deps.octokit, fork);
		const { data: forkTip } = await this.deps.octokit.git.getRef({
			...fork,
			ref: `heads/${forkDefaultBranch}`,
		});
		const { data: parentCommit } = await this.deps.octokit.git.getCommit({
			...fork,
			commit_sha: forkTip.object.sha,
		});
		const { data: tree } = await this.deps.octokit.git.createTree({
			...fork,
			base_tree: parentCommit.tree.sha,
			tree: [{ path: file.path, mode: "100644", type: "blob", content }],
		});
		const { data: commit } = await this.deps.octokit.git.createCommit({
			...fork,
			message,
			tree: tree.sha,
			parents: [forkTip.object.sha],
		});

		this.logger.info(
			{ filePath: file.path, parentSha: forkTip.object.sha, commitSha: commit.sha },
			"Translation commit created",
		);

		return commit;
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
