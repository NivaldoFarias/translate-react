import type { ProcessedFileResult } from "@/types";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import { extractErrorMessage } from "@/errors/error.handler";
import { BaseGitHubService } from "@/services/github/base.service";
import TranslationFile from "@/utils/translation-file.util";

/**
 * Service responsible for managing repository content and translations.
 * Handles file content operations, commits, and pull requests.
 *
 * ## Responsibilities
 * - File content retrieval and modification
 * - Translation content management
 * - Pull request creation and management
 * - Content filtering and validation
 */
export class ContentService extends BaseGitHubService {
	private readonly issueNumber = Number(import.meta.env.PROGRESS_ISSUE_NUMBER);

	/**
	 * Retrieves markdown files that need translation.
	 * Filters and processes files based on content type.
	 *
	 * @param maxFiles Optional limit on number of files to retrieve
	 * @throws {Error} If repository tree is empty or retrieval fails
	 *
	 * @example
	 * ```typescript
	 * const files = await contentService.getUntranslatedFiles(5);
	 * ```
	 */
	public async getUntranslatedFiles(maxFiles?: number) {
		try {
			const repoTreeResponse = await this.octokit.git.getTree({
				...this.fork,
				tree_sha: "main",
				recursive: "true",
			});

			if (!repoTreeResponse.data.tree) {
				throw new Error("Repository tree is empty");
			}

			const markdownFiles = this.filterMarkdownFiles(repoTreeResponse.data.tree);
			const filesToProcess = maxFiles ? markdownFiles.slice(0, maxFiles) : markdownFiles;

			const files: TranslationFile[] = [];

			for (const file of filesToProcess) {
				if (!file.path) continue;

				try {
					const response = await this.octokit.repos.getContent({
						...this.fork,
						path: file.path,
					});

					if (!("content" in response.data)) continue;

					files.push({
						path: file.path,
						content: Buffer.from(response.data.content, "base64").toString(),
						sha: response.data.sha,
						filename: file.path.split("/").pop()!,
					});
				} catch (error) {
					console.error(`Failed to fetch content for ${file.path}: ${extractErrorMessage(error)}`);
					continue;
				}
			}

			return files;
		} catch (error) {
			console.error(`Failed to fetch untranslated files: ${extractErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Commits translated content to a branch.
	 * Updates existing file or creates new one.
	 *
	 * @param branch Target branch reference
	 * @param file File being translated
	 * @param content Translated content
	 * @param message Commit message
	 * @throws {Error} If commit operation fails
	 *
	 * @example
	 * ```typescript
	 * await contentService.commitTranslation(
	 *   branch,
	 *   file,
	 *   translatedContent,
	 *   'feat(i18n): translate homepage'
	 * );
	 * ```
	 */
	public async commitTranslation(
		branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"],
		file: TranslationFile,
		content: string,
		message: string,
	) {
		try {
			const currentFile = await this.octokit.repos.getContent({
				...this.fork,
				path: file.path,
				ref: branch.object.sha,
			});

			const fileSha = "sha" in currentFile.data ? currentFile.data.sha : undefined;

			await this.octokit.repos.createOrUpdateFileContents({
				...this.fork,
				path: file.path,
				message,
				content: Buffer.from(content).toString("base64"),
				branch: branch.ref,
				sha: fileSha,
			});
		} catch (error) {
			console.error(`Failed to commit translation: ${extractErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Creates or finds an existing pull request.
	 *
	 * @param branch Source branch name
	 * @param title Pull request title
	 * @param body Pull request description
	 * @param baseBranch Target branch for PR
	 * @throws {Error} If pull request creation fails
	 *
	 * @example
	 * ```typescript
	 * const pr = await contentService.createPullRequest(
	 *   'translate/homepage',
	 *   'feat(i18n): translate homepage',
	 *   'Translates homepage content to Portuguese'
	 * );
	 * ```
	 */
	public async createPullRequest(branch: string, title: string, body: string, baseBranch = "main") {
		try {
			const prExistsResponse = await this.octokit.pulls.list({
				...this.upstream,
				head: `${this.fork.owner}:${branch}`,
				state: "open",
			});

			const existingPullRequest = prExistsResponse.data.find((pr) => pr.title === title);

			if (existingPullRequest) return existingPullRequest;

			const createPullRequestResponse = await this.octokit.pulls.create({
				...this.upstream,
				title,
				body,
				head: `${this.fork.owner}:${branch}`,
				base: baseBranch,
				maintainer_can_modify: true,
			});

			return createPullRequestResponse.data;
		} catch (error) {
			console.error(`Failed to create pull request: ${extractErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Filters repository tree for markdown files.
	 *
	 * @param tree Repository tree from GitHub API
	 */
	protected filterMarkdownFiles(
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	) {
		return tree.filter((item) => {
			if (!item.path?.endsWith(".md")) return false;
			if (!item.path.includes("src/")) return false;
			return true;
		});
	}

	/**
	 * Fetches raw content of a file from GitHub.
	 *
	 * @param file File reference to fetch
	 */
	public async getFileContent(
		file:
			| TranslationFile
			| RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number],
	) {
		try {
			const blobSha = file.sha;

			if (!blobSha) throw new Error("Invalid blob URL");

			const response = await this.octokit.git.getBlob({
				...this.fork,
				file_sha: blobSha,
			});

			return Buffer.from(response.data.content, "base64").toString();
		} catch (error) {
			console.error(`Failed to fetch file content: ${extractErrorMessage(error)}`);
			throw error;
		}
	}

	/**
	 * Posts translation results as comments on GitHub issues.
	 *
	 * ## Workflow
	 * 1. Checks if the issue exists
	 * 2. Lists comments on the issue
	 * 3. Finds the user's comment with the correct prefix
	 * 4. Updates the comment with new results
	 * 5. Creates a new comment if the user's comment is not found
	 *
	 * @param results Translation results to report
	 * @param filesToTranslate Files that were translated
	 *
	 * @throws {Error} If the issue is not found
	 *
	 * @returns The comment created on the issue
	 *
	 * @example
	 * ```typescript
	 * const comment = await contentService.commentCompiledResultsOnIssue(results, filesToTranslate);
	 * ```
	 */
	public async commentCompiledResultsOnIssue(
		results: ProcessedFileResult[],
		filesToTranslate: TranslationFile[],
	) {
		const issueExistsResponse = await this.octokit.issues.get({
			...this.upstream,
			issue_number: this.issueNumber,
		});

		if (!issueExistsResponse.data) {
			throw new Error(`Issue ${this.issueNumber} not found`);
		}

		const listCommentsResponse = await this.octokit.issues.listComments({
			...this.upstream,
			issue_number: this.issueNumber,
			since: "2025-01-20",
		});

		const userComment = listCommentsResponse.data.find((comment) => {
			return (
				comment.user?.login === import.meta.env.REPO_FORK_OWNER &&
				comment.body?.includes(this.commentSufix)
			);
		});

		if (userComment) {
			const updateCommentResponse = await this.octokit.issues.updateComment({
				...this.upstream,
				issue_number: this.issueNumber,
				body: this.concatComment(this.buildComment(results, filesToTranslate)),
				comment_id: userComment.id,
			});

			return updateCommentResponse.data;
		}

		const createCommentResponse = await this.octokit.issues.createComment({
			...this.upstream,
			issue_number: this.issueNumber,
			body: this.concatComment(this.buildComment(results, filesToTranslate)),
		});

		return createCommentResponse.data;
	}

	/**
	 * Concatenates the comment prefix and suffix to the main content.
	 *
	 * @param content The content to concatenate
	 *
	 * @returns The concatenated comment
	 */
	private concatComment(content: string) {
		return `${this.commentPrefix}\n\n${content}\n\n${this.commentSufix}`;
	}

	/**
	 * Builds a comment for the issue based on the translation results and files that were translated.
	 *
	 * @param results Translation results
	 * @param filesToTranslate Files that were translated
	 *
	 * @returns The comment to be posted on the issue
	 */
	private buildComment(results: ProcessedFileResult[], filesToTranslate: TranslationFile[]) {
		const concattedData = results
			.map((result) => {
				const translationFile = filesToTranslate.find((file) => file.filename === result.filename);

				if (!translationFile) return null;

				const directory = translationFile.path.split("/").slice(0, -1).join("/");
				const strippedDirectory = directory.replace(/\/\d+(?:\/\d+)*\/$/, "");

				return {
					directory: strippedDirectory,
					filename: translationFile.filename,
					pr_number: result.pullRequest?.number || 0,
				};
			})
			.filter(Boolean);

		const filesByDirectory = concattedData.reduce<Map<string, typeof concattedData>>(
			(acc, file) => {
				if (!acc.has(file.directory)) acc.set(file.directory, []);

				acc.get(file.directory)?.push(file);

				return acc;
			},
			new Map(),
		);

		const commonPrefix = findCommonPrefix(Array.from(filesByDirectory.keys()));

		if (!commonPrefix) return mapToComment(filesByDirectory);

		const filesByDirStrippedPrefix = new Map<string, typeof concattedData>();

		for (const [dir, files] of filesByDirectory.entries()) {
			filesByDirStrippedPrefix.set(dir.replace(commonPrefix, ""), files);
		}

		return mapToComment(filesByDirStrippedPrefix);

		/**
		 * Finds the common prefix of an array of paths.
		 *
		 * @param paths Array of paths
		 *
		 * @returns Common prefix or null if no common prefix is found
		 */
		function findCommonPrefix(paths: string[]) {
			if (!paths.length) return null;

			const firstPath = paths[0];

			if (!firstPath) return null;

			let prefixLength = firstPath.length;

			for (const path of paths) {
				let j = 0;

				while (j < prefixLength && j < path.length && firstPath[j] === path[j]) {
					j++;
				}

				prefixLength = j;

				if (prefixLength === 0) return null;
			}

			return firstPath.substring(0, prefixLength);
		}

		/**
		 * Maps the data to a comment.
		 *
		 * @param data Data to map
		 *
		 * @returns Comment
		 */
		function mapToComment(data: Map<string, typeof concattedData>) {
			const filesByDirStrippedPrefixArraySorted = Array.from(data.entries()).sort(
				([current], [next]) => current.localeCompare(next),
			);

			const comment = filesByDirStrippedPrefixArraySorted
				.map(([dir, files]) => {
					return `- ${dir}\n${files.map((file) => `	- \`${file.filename}\`: #${file.pr_number}`).join("\n")}`;
				})
				.join("\n");

			return comment;
		}
	}

	/**
	 * Retrieves a pull request by branch name.
	 *
	 * @param branchName Source branch name
	 */
	public async findPullRequestByBranch(branchName: string) {
		const response = await this.octokit.pulls.list({
			...this.upstream,
			head: `${this.fork.owner}:${branchName}`,
		});

		return response.data[0];
	}

	/**
	 * Closes a pull request by number.
	 *
	 * @param prNumber Pull request number
	 * @throws {Error} If pull request closure fails
	 */
	public async closePullRequest(prNumber: number) {
		const response = await this.octokit.pulls.update({
			...this.upstream,
			pull_number: prNumber,
			state: "closed",
		});

		if (response.status !== 200) throw new Error(`Failed to close pull request ${prNumber}`);
	}

	/** Comment header template for issue comments */
	private get commentPrefix() {
		return `As seguintes páginas foram traduzidas e PRs foram criados:`;
	}

	/** Comment footer template for issue comments */
	private get commentSufix() {
		return `###### Observações
	
	- As traduções foram geradas por uma LLM e requerem revisão humana para garantir precisão técnica e fluência.
	- Alguns arquivos podem ter PRs de tradução existentes em análise. Verifiquei duplicações, mas recomendo conferir.
	- O fluxo de trabalho de automação completo está disponível no repositório [\`translate-react\`](https://github.com/${import.meta.env.REPO_FORK_OWNER}/translate-react) para referência e contribuições.
	- Esta implementação é um trabalho em progresso e pode apresentar inconsistências em conteúdos técnicos complexos ou formatação específica.`;
	}
}
