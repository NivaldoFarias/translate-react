import { Octokit } from "@octokit/rest";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { ProcessedFileResult } from "../runner";
import type { TranslationFile } from "../types";

import Logger from "../utils/logger";
import { RateLimiter } from "../utils/rateLimiter";
import { RetryableOperation } from "../utils/retryableOperation";

import { BranchManager } from "./branch-manager";

export class GitHubService {
	private readonly rateLimiter = new RateLimiter(60, "GitHub API");
	private readonly retryOperation: RetryableOperation | undefined;
	private readonly octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
	private readonly branchManager = new BranchManager(
		process.env.REPO_OWNER!,
		process.env.REPO_NAME!,
		process.env.GITHUB_TOKEN!,
	);

	constructor(private readonly logger: Logger | undefined = undefined) {
		if (this.logger) this.retryOperation = new RetryableOperation(3, 1000, 5000, this.logger);
	}

	private async callGitHubAPI<T>(operation: () => Promise<T>, context: string): Promise<T> {
		return this.rateLimiter.schedule(() => operation(), context);
	}

	private async withRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
		if (!this.retryOperation) {
			throw new Error("Retry operation is not initialized");
		}

		return this.retryOperation.withRetry(
			async () => this.callGitHubAPI(operation, context),
			context,
		);
	}

	public async getUntranslatedFiles(maxFiles?: number) {
		try {
			const { data } = await this.withRetry(
				() =>
					this.octokit.git.getTree({
						owner: process.env.REPO_OWNER!,
						repo: process.env.REPO_NAME!,
						tree_sha: "main",
						recursive: "1",
					}),
				"Fetching repository tree",
			);

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
					const { data: content } = await this.withRetry(
						() =>
							this.octokit.repos.getContent({
								owner: process.env.REPO_OWNER!,
								repo: process.env.REPO_NAME!,
								path: file.path!,
							}),
						`Fetching ${file.path}`,
					);

					if (!("content" in content)) {
						this.logger?.error(`No content found for ${file.path}`);
						continue;
					}

					const decodedContent = Buffer.from(content.content, "base64").toString();
					files.push({
						path: file.path,
						content: decodedContent,
						sha: content.sha,
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
		const branchName =
			process.env.NODE_ENV === "development" ?
				`translate/${fileName}-${Date.now()}`
			:	`translate/${fileName}`;

		const alreadyCreatedBranch = await this.branchManager.getBranch(branchName);
		if (alreadyCreatedBranch) return alreadyCreatedBranch.data;

		const branchRef = await this.branchManager.createBranch(branchName, baseBranch);

		return branchRef.data;
	}

	public async commitTranslation(
		branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"],
		filePath: string,
		content: string,
		message: string,
	): Promise<void> {
		try {
			// Get the current file (if it exists)
			const currentFile = await this.withRetry(
				() =>
					this.octokit.repos.getContent({
						owner: process.env.REPO_OWNER!,
						repo: process.env.REPO_NAME!,
						path: filePath,
						ref: branch.object.sha,
					}),
				`Checking existing file: ${filePath}`,
			);

			const fileSha = "sha" in currentFile.data ? currentFile.data.sha : undefined;

			await this.octokit.repos.createOrUpdateFileContents({
				owner: process.env.REPO_OWNER!,
				repo: process.env.REPO_NAME!,
				path: filePath,
				message,
				content: Buffer.from(content).toString("base64"),
				branch: branch.ref,
				sha: fileSha,
			});

			this.logger?.info(`Committed translation to ${filePath} on branch ${branch}`);
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
			const { data } = await this.withRetry(
				() =>
					this.octokit.pulls.create({
						// The original repository owner (reactjs)
						owner: process.env.ORIGINAL_REPO_OWNER!,
						repo: process.env.REPO_NAME!,
						title,
						body,
						// Format: username:branch-name
						head: `${process.env.REPO_OWNER!}:${branch}`,
						base: baseBranch,
						maintainer_can_modify: true,
					}),
				"Creating pull request",
			);

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
		file: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"][number],
	) {
		try {
			// The file object already contains the url property
			const blobSha = file.url?.split("/").pop();

			if (!blobSha) {
				throw new Error("Invalid blob URL");
			}

			const { data } = await this.withRetry(
				() =>
					this.octokit.git.getBlob({
						owner: process.env.REPO_OWNER!,
						repo: process.env.REPO_NAME!,
						file_sha: blobSha,
					}),
				`Fetching blob: ${blobSha}`,
			);

			return Buffer.from(data.content, "base64").toString();
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			this.logger?.error(`Failed to fetch file content: ${message}`);
			throw error;
		}
	}

	public async getRepositoryTree(baseBranch = "main", filterIgnored = true) {
		const { data } = await this.withRetry(
			() =>
				this.octokit.git.getTree({
					owner: process.env.REPO_OWNER!,
					repo: process.env.REPO_NAME!,
					tree_sha: baseBranch,
					recursive: "1",
				}),
			"Fetching repository tree",
		);

		return filterIgnored ? this.filterRepositoryTree(data.tree) : data.tree;
	}

	public async commentCompiledResultsOnIssue(issueNumber: number, results: ProcessedFileResult[]) {
		const comment = `As seguintes páginas foram traduzidas e PRs foram criados:

	${results.map((result) => `- [${result.filename}](${result.pullRequest?.html_url})`).join("\n")}

	###### Observações
	
	- As traduções foram geradas por IA e precisam de revisão.
	- Talvez algumas traduções já tenham PRs criados, mas ainda não foram fechados.
	- O fluxo que escrevi para gerar as traduções está disponível no repositório [\`translate-react\`](https://github.com/${process.env["REPO_OWNER"]}/translate-react).
	- A implementação não é perfeita e pode conter erros.`;

		return await this.withRetry(
			() =>
				this.octokit.issues.createComment({
					owner: process.env.REPO_OWNER!,
					repo: process.env.REPO_NAME!,
					issue_number: issueNumber,
					body: comment,
				}),
			"Creating comment on translation progress issue",
		);
	}

	public async verifyTokenPermissions() {
		try {
			const { data } = await this.octokit.rest.users.getAuthenticated();

			this.logger?.info(`Authenticated as ${data.login}`);

			// Check access to original repo
			await this.octokit.rest.repos.get({
				owner: process.env.ORIGINAL_REPO_OWNER!,
				repo: process.env.REPO_NAME!,
			});

			this.logger?.info(`Access to original repo verified`);

			return true;
		} catch (error) {
			this.logger?.error(`Token permission verification failed: ${error}`);
			return false;
		}
	}
}
