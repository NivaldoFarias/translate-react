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
	/**
	 * Retrieves markdown files that need translation.
	 * Filters and processes files based on content type.
	 *
	 * @param maxFiles - Optional limit on number of files to retrieve
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
	 * @param branch - Target branch reference
	 * @param file - File being translated
	 * @param content - Translated content
	 * @param message - Commit message
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
	 * @param branch - Source branch name
	 * @param title - Pull request title
	 * @param body - Pull request description
	 * @param baseBranch - Target branch for PR
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
	 * @param tree - Repository tree from GitHub API
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
	 * @param issueNumber Target issue number
	 * @param results Translation results to report
	 */
	public async commentCompiledResultsOnIssue(issueNumber: number, results: ProcessedFileResult[]) {
		const issueExistsResponse = await this.octokit.issues.get({
			...this.upstream,
			issue_number: issueNumber,
		});

		if (!issueExistsResponse.data) {
			throw new Error(`Issue ${issueNumber} not found`);
		}

		const listCommentsResponse = await this.octokit.issues.listComments({
			...this.upstream,
			issue_number: issueNumber,
			since: "2025-01-20",
		});

		const userComment = listCommentsResponse.data.find((comment) => {
			return (
				comment.user?.login === import.meta.env.REPO_FORK_OWNER! &&
				comment.body?.includes("###### Observações")
			);
		});

		if (userComment) {
			const listResults = userComment.body
				?.split("\n")
				.filter((line) => line.includes("- ["))
				.map((line) => {
					const match = line.match(/-\s*\[(?<filename>.*?)\]\((?<html_url>.*?)\)/);
					const data = match ? match.groups : null;

					return data ? { filename: data["filename"], html_url: data["html_url"] } : null;
				})
				.filter((result) => result !== null) as { filename: string; html_url: string }[];

			const newResults = results
				.filter((result) => !listResults.find((compare) => compare.filename === result.filename))
				.map((result) => ({
					filename: result.filename,
					html_url: result.pullRequest?.html_url,
				}));

			if (!newResults.length) {
				return userComment;
			}

			const newResultsComment = newResults
				.concat(listResults)
				.map((result) => `- [${result.filename}](${result.html_url})`)
				.join("\n");

			const newComment = `${this.commentPrefix}\n\n${newResultsComment}\n\n${this.commentSufix}`;

			const updateCommentResponse = await this.octokit.issues.updateComment({
				...this.upstream,
				issue_number: issueNumber,
				body: newComment,
				comment_id: userComment.id,
			});

			return updateCommentResponse.data;
		}

		const listResults = results
			.map((result) => `- [${result.filename}](${result.pullRequest?.html_url})`)
			.join("\n");

		const createCommentResponse = await this.octokit.issues.createComment({
			...this.upstream,
			issue_number: issueNumber,
			body: `${this.commentPrefix}\n\n${listResults}\n\n${this.commentSufix}`,
		});

		return createCommentResponse.data;
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
