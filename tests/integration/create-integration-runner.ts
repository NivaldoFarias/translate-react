import fs from "node:fs/promises";
import path from "node:path";

import { spyOn } from "bun:test";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { Mock } from "bun:test";
import type OpenAI from "openai";
import type PQueue from "p-queue";

import type {
	LanguageCacheEntry,
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
} from "@/app/domain/workflow/";
import type { CacheService } from "@/app/services/cache/";
import type { GitHubService } from "@/app/services/github/";
import type {
	CommitTranslationOptions,
	PullRequestOptions,
} from "@/app/services/github/github.content";
import type { LanguageDetectorService } from "@/app/services/language-detector/";
import type { RunnerServiceDependencies } from "@/app/services/runner/runner.types";

import {
	commentBuilderService,
	localeService,
	openRouterModelLimitsService,
} from "@/app/composition";
import { PullRequestProgressAction } from "@/app/domain/workflow/";
import { RunnerService } from "@/app/services/runner/runner.service";
import { TranslationFile, TranslatorService } from "@/app/services/translator/";

import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockOpenAI,
	createMockQueue,
	createPassthroughChatCompletionsMock,
} from "@tests/mocks";

type GitTree = RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

type CommitTranslationMockFn = (
	opts: CommitTranslationOptions,
) => Promise<RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"]>;

type CreatePullRequestMockFn = (
	opts: PullRequestOptions,
) => Promise<RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]>;

type CommentCompiledResultsMockFn = (
	results: ProcessedFileResult[],
	filesToTranslate: TranslationFile[],
) => Promise<RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"] | undefined>;

/** Repo-relative directory of docs-style markdown used by smoke and integration workflow tests */
export const INTEGRATION_MD_FIXTURE_DIR_RELATIVE = "tests/fixtures/md" as const;

/** Describes the single upstream markdown file exercised by a workflow integration run */
export type IntegrationWorkflowFile = Readonly<{
	repoPath: string;
	filename: string;
	content: string;
	sha: string;
}>;

/**
 * When {@link createWorkflowGitHubServiceFromFiles} receives this object, mocked GitHub writes
 * persist translated blobs, pull request copy, and the translation-progress issue comment body
 * under {@link WorkflowGitHubArtifactOptions.captureArtifactsDir}. Each processed file gets a
 * subdirectory named from its path under `src/content/` (e.g. `hydrateRoot.md` → `hydrateRoot/`)
 * containing `translated.md` and `pull-request.md`. The issue comment is
 * `translation-progress-issue-comment.md` at the capture root.
 */
export type WorkflowGitHubArtifactOptions = Readonly<{
	/** Directory (resolved under `cwd`) where artifact files are written */
	captureArtifactsDir: string;

	/** Repository root used to resolve `captureArtifactsDir` (defaults to `process.cwd()`) */
	cwd?: string;
}>;

let openRouterLimitsSpy: { mockRestore: () => void } | undefined;

/** Avoids real HTTP to OpenRouter during `TranslatorService.testConnectivity` in tests */
export function installOpenRouterModelLimitsStub() {
	openRouterLimitsSpy = spyOn(
		openRouterModelLimitsService,
		"fetchLimitsForModel",
	).mockResolvedValue(null) as { mockRestore: () => void };
}

/** Restores the OpenRouter limits spy installed by {@link installOpenRouterModelLimitsStub} */
export function restoreOpenRouterModelLimitsStub() {
	openRouterLimitsSpy?.mockRestore();
	openRouterLimitsSpy = undefined;
}

/**
 * Lists every `*.md` basename under the integration markdown fixture directory.
 *
 * @param cwd Repository root for resolving `INTEGRATION_MD_FIXTURE_DIR_RELATIVE`
 */
async function listMdFixtureBasenames(cwd: string) {
	const absoluteDir = path.resolve(cwd, INTEGRATION_MD_FIXTURE_DIR_RELATIVE);
	const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();
}

/**
 * Loads markdown fixtures from `tests/fixtures/md/` the same way as `ci:smoke-llm`.
 *
 * When `basenames` is omitted or empty, loads every `*.md` in that directory (sorted). When set,
 * loads only those files in the given order; each name must exist.
 *
 * @param basenames Optional subset of fixture filenames (e.g. `["integration-workflow-small.md"]`)
 * @param cwd Repository root (defaults to `process.cwd()`)
 */
export async function loadIntegrationWorkflowFilesFromMdFixtureDir(
	basenames?: readonly string[],
	cwd: string = process.cwd(),
) {
	const allNames = await listMdFixtureBasenames(cwd);
	const orderedNames = basenames !== undefined && basenames.length > 0 ? [...basenames] : allNames;

	if (orderedNames.length === 0) {
		throw new Error(`No .md files found under ${INTEGRATION_MD_FIXTURE_DIR_RELATIVE}`);
	}

	if (basenames !== undefined && basenames.length > 0) {
		for (const name of basenames) {
			if (!allNames.includes(name)) {
				throw new Error(
					`Fixture ${name} not found under ${INTEGRATION_MD_FIXTURE_DIR_RELATIVE} (have: ${allNames.join(", ")})`,
				);
			}
		}
	}

	const absoluteDir = path.resolve(cwd, INTEGRATION_MD_FIXTURE_DIR_RELATIVE);
	const files: IntegrationWorkflowFile[] = [];

	for (const name of orderedNames) {
		const absoluteFile = path.join(absoluteDir, name);
		const content = await fs.readFile(absoluteFile, "utf8");
		const filename = name;
		const repoPath = `src/content/${filename}`;

		files.push({
			repoPath,
			filename,
			content,
			sha: `sha-fixture-${filename}`,
		});
	}

	return files;
}

/**
 * Builds a GitHub mock whose tree and `getFile` results match the given markdown documents.
 *
 * @param files One or more synthetic upstream files (paths under `src/content/` as in the real repo)
 * @param artifactOptions When set, writes mocked GitHub outputs under `captureArtifactsDir` (per-file
 * subfolders plus `translation-progress-issue-comment.md` at the root)
 */
export function createWorkflowGitHubServiceFromFiles(
	files: readonly IntegrationWorkflowFile[],
	artifactOptions?: WorkflowGitHubArtifactOptions,
) {
	if (files.length === 0) {
		throw new Error("createWorkflowGitHubServiceFromFiles requires at least one file");
	}

	const github = createMockGitHubService();
	const byRepoPath = new Map(files.map((file) => [file.repoPath, file] as const));

	const captureRoot =
		artifactOptions !== undefined ?
			path.resolve(artifactOptions.cwd ?? process.cwd(), artifactOptions.captureArtifactsDir)
		:	undefined;

	if (captureRoot !== undefined) {
		const artifactOutputSubdirFromContentRelative = (relativeUnderContent: string) => {
			const withoutMd = relativeUnderContent.replace(/\.md$/i, "");
			return withoutMd.replaceAll("/", "__") || "file";
		};

		const artifactDirForFilePath = (repoPath: string) => {
			const relative = repoPath.replace(/^src\/content\//, "");
			return path.join(captureRoot, artifactOutputSubdirFromContentRelative(relative));
		};

		const artifactDirForTranslateBranch = (branch: string) => {
			const tail = branch.replace(/^translate\//, "");
			return path.join(captureRoot, artifactOutputSubdirFromContentRelative(tail));
		};

		(github.commitTranslation as unknown as Mock<CommitTranslationMockFn>).mockImplementation(
			async (opts) => {
				const fileDir = artifactDirForFilePath(opts.file.path);
				await fs.mkdir(fileDir, { recursive: true });
				await fs.writeFile(path.join(fileDir, "translated.md"), opts.content, "utf8");

				return {
					data: { content: { sha: "new-sha" }, commit: { sha: "commit-sha" } },
				} as RestEndpointMethodTypes["repos"]["createOrUpdateFileContents"]["response"];
			},
		);

		(github.createPullRequest as unknown as Mock<CreatePullRequestMockFn>).mockImplementation(
			async (opts) => {
				const fileDir = artifactDirForTranslateBranch(opts.branch);
				await fs.mkdir(fileDir, { recursive: true });
				const prMarkdown = `# ${opts.title}\n\n${opts.body}`;
				await fs.writeFile(path.join(fileDir, "pull-request.md"), prMarkdown, "utf8");

				return {
					number: 1,
					title: opts.title,
					html_url: "https://github.com/test/test/pull/1",
				} as RestEndpointMethodTypes["pulls"]["create"]["response"]["data"];
			},
		);

		(
			github.commentCompiledResultsOnIssue as unknown as Mock<CommentCompiledResultsMockFn>
		).mockImplementation(async (results, filesToTranslate) => {
			if (results.length === 0 || filesToTranslate.length === 0) {
				return undefined;
			}

			const hasReportablePullRequest = results.some(
				(result) =>
					result.pullRequest !== null &&
					result.pullRequestProgress === PullRequestProgressAction.Created,
			);

			if (!hasReportablePullRequest) {
				return undefined;
			}

			await fs.mkdir(captureRoot, { recursive: true });
			const body = commentBuilderService.buildComment(results, filesToTranslate);
			await fs.writeFile(
				path.join(captureRoot, "translation-progress-issue-comment.md"),
				body,
				"utf8",
			);

			return {
				id: 1,
				html_url: "https://github.com/test/mock-issue-comment/1",
				body,
			} as RestEndpointMethodTypes["issues"]["createComment"]["response"]["data"];
		});
	}

	github.getRepositoryTree.mockResolvedValue(
		files.map((file) => ({
			path: file.repoPath,
			type: "blob",
			sha: file.sha,
			mode: "100644",
		})) satisfies GitTree,
	);

	github.getFile.mockImplementation((item: unknown) => {
		const { path: repoPath } = item as PatchedRepositoryTreeItem;
		const source = byRepoPath.get(repoPath);
		if (!source) {
			return Promise.reject(new Error(`getFile: unmocked path ${repoPath}`));
		}

		return Promise.resolve(
			new TranslationFile(source.content, source.filename, source.repoPath, source.sha),
		);
	});

	github.getPullRequestFiles.mockResolvedValue(files.map((file) => file.repoPath));

	return github;
}

/**
 * Builds a GitHub mock whose tree and `getFile` results match one markdown document.
 *
 * @param file Repository path, display filename, raw content, and blob sha for the scenario
 */
export function createWorkflowGitHubService(file: IntegrationWorkflowFile) {
	return createWorkflowGitHubServiceFromFiles([file]);
}

/**
 * Creates a mock TranslatorService for testing.
 *
 * Uses a passthrough chat-completions mock that echoes the last user message as assistant content.
 *
 * @returns Mocked TranslatorService instance
 */
export function createIntegrationTranslator() {
	const chatMock = createPassthroughChatCompletionsMock();

	const translator = new TranslatorService({
		openai: createMockOpenAI(chatMock) as unknown as OpenAI,
		model: "gpt-4o",
		localeService,
		languageDetectorService:
			createMockLanguageDetectorService() as unknown as LanguageDetectorService,
		openRouterModelLimitsService,
		queue: createMockQueue() as unknown as PQueue,
		retryConfig: {
			retries: 0,
			factor: 1,
			minTimeout: 1,
			maxTimeout: 10,
			randomize: false,
		},
	});

	return { translator, chatMock };
}

export function createIntegrationRunner(file: IntegrationWorkflowFile) {
	const github = createWorkflowGitHubService(file);
	const { translator, chatMock } = createIntegrationTranslator();

	const runner = new RunnerService(
		{
			github: github as unknown as GitHubService,
			translator,
			languageCache:
				createMockLanguageCacheService() as unknown as CacheService<LanguageCacheEntry>,
			locale: localeService,
			languageDetector: createMockLanguageDetectorService() as unknown as LanguageDetectorService,
		} as RunnerServiceDependencies,
		{ batchSize: 1 },
	);

	return { runner, github, translator, chatMock };
}
