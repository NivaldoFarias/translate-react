import { Octokit } from "@octokit/rest";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";

import Logger from "../utils/logger";

import { BranchManager } from "./branch-manager";

export class GitHubService {
	private readonly octokit = new Octokit({ auth: import.meta.env.GITHUB_TOKEN });
	private readonly branchManager = new BranchManager(
		import.meta.env.REPO_OWNER!,
		import.meta.env.REPO_NAME!,
		import.meta.env.GITHUB_TOKEN!,
	);
	private branch: {
		fork: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;
		upstream: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;
	} = {
		fork: null,
		upstream: null,
	};

	constructor(private readonly logger: Logger | undefined = undefined) {}

	public async getUntranslatedFiles(maxFiles?: number) {
		try {
			const { data } = await this.octokit.git.getTree({
				owner: import.meta.env.REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
				tree_sha: "main",
				recursive: "1",
			});

			if (!data.tree) {
				throw new Error("Repository tree is empty");
			}

			// Filter out ignored paths
			const markdownFiles = this.filterRepositoryTree(data.tree);

			// Apply maxFiles limit after filtering but before content fetching
			const filesToProcess = maxFiles ? markdownFiles.slice(0, maxFiles) : markdownFiles;
			this.logger?.info(`Found ${filesToProcess.length} markdown files to process`);

			const files: TranslationFile[] = [];
			for (const file of filesToProcess) {
				if (!file.path) {
					this.logger?.error("Skipping file with undefined path");
					continue;
				}

				try {
					const { data } = await this.octokit.repos.getContent({
						owner: import.meta.env.REPO_OWNER!,
						repo: import.meta.env.REPO_NAME!,
						path: file.path!,
					});

					if (!("content" in data)) {
						this.logger?.error(`No content found for ${file.path}`);
						continue;
					}

					const decodedContent = Buffer.from(data.content, "base64").toString();
					files.push({
						path: file.path,
						content: decodedContent,
						sha: data.sha,
					});
				} catch (error) {
					const message = error instanceof Error ? error.message : "Unknown error";
					this.logger?.error(`Failed to fetch content for ${file.path}: ${message}`);

					// Continue with other files instead of failing completely
					continue;
				}
			}

			if (files.length === 0) {
				this.logger?.error("No valid files were found to process");
			} else {
				this.logger?.info(`Successfully processed ${files.length} files`);
			}

			return files;
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger?.error(`Failed to fetch untranslated files: ${message}`);
			throw error;
		}
	}

	private filterRepositoryTree(
		tree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"],
	) {
		return tree.filter((item) => {
			if (!item.path) return false;
			if (!item.path.endsWith(".md")) return false;
			if (!item.path.includes("/") && item.path !== "GLOSSARY.md") return false;
			if (!item.path.includes("src/")) return false;

			return true;
		});
	}

	public async createTranslationBranch(fileName: string, baseBranch = "main") {
		const branchName = `translate/${fileName}`;

		const alreadyCreatedBranch = await this.branchManager.getBranch(branchName);
		if (alreadyCreatedBranch) {
			this.branch.fork = alreadyCreatedBranch.data;
			return alreadyCreatedBranch.data;
		}

		const branchRef = await this.branchManager.createBranch(branchName, baseBranch);

		this.branch.fork = branchRef.data;
		return branchRef.data;
	}

	public async checkIfCommitExistsOnFork() {
		const listCommitsResponse = await this.octokit.repos.listCommits({
			owner: import.meta.env.REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
			sha: this.branch.fork?.ref,
		});

		return listCommitsResponse.data.some(
			(commit) => commit?.author?.login === import.meta.env.REPO_OWNER!,
		);
	}

	public async commitTranslation(
		branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"],
		file: TranslationFile,
		content: string,
		message: string,
	) {
		try {
			// Get the current file (if it exists)
			const currentFile = await this.octokit.repos.getContent({
				owner: import.meta.env.REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
				path: file.path!,
				ref: branch.object.sha,
			});

			const fileSha = "sha" in currentFile.data ? currentFile.data.sha : undefined;

			await this.octokit.repos.createOrUpdateFileContents({
				owner: import.meta.env.REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
				path: file.path!,
				message,
				content: Buffer.from(content).toString("base64"),
				branch: branch.ref,
				sha: fileSha,
			});

			this.logger?.info(`Committed translation to ${file.filename} on branch ${branch.ref}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.logger?.error(`Failed to commit translation: ${errorMessage}`);

			// Clean up the branch on failure
			await this.branchManager.deleteBranch(branch.ref);
			throw error;
		}
	}

	public async createPullRequest(
		branch: string,
		title: string,
		body: string,
		baseBranch: string = "main",
	) {
		try {
			// Check for existing PRs from this branch
			const existingPRsResponse = await this.octokit.pulls.list({
				owner: import.meta.env.ORIGINAL_REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
				head: `${import.meta.env.REPO_OWNER!}:${branch}`,
				state: "open",
			});

			const pr = existingPRsResponse.data.find((pr) => pr.title === title);

			if (pr) {
				this.logger?.info(`Pull request already exists for branch ${branch}`);

				return pr;
			}

			const { data } = await this.octokit.pulls.create({
				owner: import.meta.env.ORIGINAL_REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
				title,
				body,
				head: `${import.meta.env.REPO_OWNER!}:${branch}`,
				base: baseBranch,
				maintainer_can_modify: true,
			});

			this.logger?.info(`Created pull request #${data.number}: ${title}`);

			return data;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			this.logger?.error(`Failed to create pull request: ${errorMessage}`);

			// Clean up the branch on failure
			await this.branchManager.deleteBranch(branch);
			throw error;
		}
	}

	public async cleanupBranch(branch: string) {
		await this.branchManager.deleteBranch(branch);
	}

	public getActiveBranches(): string[] {
		return this.branchManager.getActiveBranches();
	}

	public async getFileContent(
		file:
			| TranslationFile
			| RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number],
	) {
		try {
			const blobSha = file.sha;

			if (!blobSha) {
				throw new Error("Invalid blob URL");
			}

			const { data } = await this.octokit.git.getBlob({
				owner: import.meta.env.REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
				file_sha: blobSha,
			});

			return Buffer.from(data.content, "base64").toString();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger?.error(`Failed to fetch file content: ${message}`);
			throw error;
		}
	}

	public async getRepositoryTree(baseBranch = "main", filterIgnored = true) {
		const { data } = await this.octokit.git.getTree({
			owner: import.meta.env.REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
			tree_sha: baseBranch,
			recursive: "1",
		});

		return filterIgnored ? this.filterRepositoryTree(data.tree) : data.tree;
	}

	public async commentCompiledResultsOnIssue(issueNumber: number, results: ProcessedFileResult[]) {
		// check if the issue exists
		const issue = await this.octokit.issues.get({
			owner: import.meta.env.ORIGINAL_REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
			issue_number: issueNumber,
		});

		if (!issue.data) {
			throw new Error(`Issue ${issueNumber} not found`);
		}

		// check if the issue contains the comment
		const listCommentsResponse = await this.octokit.issues.listComments({
			owner: import.meta.env.ORIGINAL_REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
			issue_number: issueNumber,
			since: import.meta.env.GITHUB_SINCE,
		});

		const userComment = listCommentsResponse.data.find((comment) => {
			return (
				comment.user?.login === import.meta.env.REPO_OWNER! &&
				comment.body?.includes("###### Observações")
			);
		});

		if (userComment) {
			this.logger?.info(`Comment already exists on issue ${issueNumber}`);

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
				this.logger?.info(`No new results to add to comment on issue ${issueNumber}`);
				return userComment;
			}

			const newResultsComment = newResults
				.concat(listResults)
				.map((result) => `- [${result.filename}](${result.html_url})`)
				.join("\n");

			const newComment = `${this.commentPrefix}\n\n${newResultsComment}\n\n${this.commentSufix}`;

			const updateCommentResponse = await this.octokit.issues.updateComment({
				owner: import.meta.env.ORIGINAL_REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
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
			owner: import.meta.env.ORIGINAL_REPO_OWNER!,
			repo: import.meta.env.REPO_NAME!,
			issue_number: issueNumber,
			body: `${this.commentPrefix}\n\n${listResults}\n\n${this.commentSufix}`,
		});

		return createCommentResponse.data;
	}

	private get commentPrefix() {
		return `As seguintes páginas foram traduzidas e PRs foram criados:`;
	}

	private get commentSufix() {
		return `###### Observações

- As traduções foram geradas por IA e precisam de revisão.
- Talvez algumas traduções já tenham PRs criados, mas ainda não foram fechados.
- O fluxo que escrevi para gerar as traduções está disponível no repositório [\`translate-react\`](https://github.com/${import.meta.env.REPO_OWNER}/translate-react).
- A implementação não é perfeita e pode conter erros.`;
	}

	public async verifyTokenPermissions() {
		try {
			const authResponse = await this.octokit.rest.users.getAuthenticated();

			this.logger?.success(`Authenticated as ${authResponse.data.login}`);

			// Check access to original repo
			await this.octokit.rest.repos.get({
				owner: import.meta.env.ORIGINAL_REPO_OWNER!,
				repo: import.meta.env.REPO_NAME!,
			});

			this.logger?.success(`Access to original repo verified`);

			return true;
		} catch (error) {
			this.logger?.error(`Token permission verification failed: ${error}`);
			return false;
		}
	}
}
