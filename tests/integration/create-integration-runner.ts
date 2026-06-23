import fs from "node:fs/promises";
import path from "node:path";

import { spyOn } from "bun:test";

import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { Mock } from "bun:test";
import type OpenAI from "openai";
import type PQueue from "p-queue";

import type { CacheService } from "@/app/services/cache/";
import type { LanguageCacheEntry } from "@/app/services/cache/types";
import type { GitHubService } from "@/app/services/github/";
import type {
	CommitTranslationOptions,
	PullRequestOptions,
} from "@/app/services/github/github.content";
import type {
	PatchedRepositoryTreeItem,
	ProcessedFileResult,
	PullRequestStatus,
	RepositoryMarkdownBlob,
} from "@/app/services/github/types";
import type { LanguageDetectorService } from "@/app/services/language-detector/";
import type { LanguageAnalysisResult } from "@/app/services/language-detector/language-detector.service";

import type { WorkflowFixtureFile } from "@tests/fixtures/workflow-fixture.util";
import type {
	MockGitHubGetForkFileContentAtBranchFn,
	MockGitHubGetLatestTranslationCommitFn,
	MockGitHubGetLatestTranslationCommitTimestampFn,
	MockGitHubListPullRequestReviewsFn,
	MockLanguageDetectorService,
} from "@tests/mocks";

import {
	commentBuilderService,
	localeService,
	openRouterModelLimitsService,
} from "@/app/composition";
import {
	hasReportableProgressComment,
	selectProgressCommentPayload,
} from "@/app/services/comment-builder/progress-comment.util";
import { RunnerService } from "@/app/services/runner/runner.service";
import { TranslationFile, TranslatorService } from "@/app/services/translator/";
import { getTranslationBranchNameFromPath } from "@/app/utils/";

import { createMockPullRequestListItem } from "@tests/fixtures";
import { WORKFLOW_FIXTURE_MANIFEST } from "@tests/fixtures/md/workflow.manifest";
import {
	buildWorkflowFixtureFile,
	defaultWorkflowFixtureForkContent,
	defaultWorkflowFixtureMaintainerReviewAt,
	defaultWorkflowFixtureMaintainerReviews,
	defaultWorkflowFixtureManifestEntry,
	defaultWorkflowFixtureRunnerCommitAt,
	WorkflowFixturePrScenario,
} from "@tests/fixtures/workflow-fixture.util";
import {
	createMockGitHubService,
	createMockLanguageCacheService,
	createMockLanguageDetectorService,
	createMockOpenAI,
	createMockQueue,
	createPassthroughChatCompletionsMock,
} from "@tests/mocks";

type GitTree = RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

type GetFileMockFn = (file: PatchedRepositoryTreeItem) => Promise<RepositoryMarkdownBlob>;

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

type FindPullRequestByBranchMockFn = (
	branch: string,
) => Promise<RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number] | undefined>;

type CheckPullRequestStatusMockFn = (prNumber: number) => Promise<PullRequestStatus>;

type ListPullRequestReviewsMockFn = MockGitHubListPullRequestReviewsFn;

const CLEAN_PULL_REQUEST_STATUS = {
	hasConflicts: false,
	mergeable: true,
	needsUpdate: false,
	mergeableState: "clean",
	createdBy: "translate-react-bot",
} as const;

/**
 * Configures per-fixture open-PR behavior from {@link WorkflowFixtureSmoke}.
 *
 * @param github Mock GitHub service from {@link createMockGitHubService}
 * @param files Loaded workflow fixtures with smoke scenario metadata
 */
function applyWorkflowSmokePullRequestMocks(
	github: ReturnType<typeof createMockGitHubService>,
	files: readonly WorkflowFixtureFile[],
) {
	const fileByBranch = new Map(
		files.map((file) => [getTranslationBranchNameFromPath(file.treeItem.path), file] as const),
	);
	const fileByPullRequestNumber = new Map(
		files.map((file) => [file.smoke.pullRequestNumber, file] as const),
	);
	const fileByRepoPath = new Map(files.map((file) => [file.treeItem.path, file] as const));

	(
		github.findPullRequestByBranch as unknown as Mock<FindPullRequestByBranchMockFn>
	).mockImplementation((branch) => {
		const file = fileByBranch.get(branch);
		if (!file || file.smoke.pullRequestScenario === WorkflowFixturePrScenario.New) {
			return Promise.resolve(undefined);
		}

		return Promise.resolve(createMockPullRequestListItem(file.smoke.pullRequestNumber));
	});

	(
		github.checkPullRequestStatus as unknown as Mock<CheckPullRequestStatusMockFn>
	).mockImplementation((prNumber) => {
		const file = fileByPullRequestNumber.get(prNumber);
		if (!file || file.smoke.pullRequestScenario === WorkflowFixturePrScenario.New) {
			return Promise.resolve({ ...CLEAN_PULL_REQUEST_STATUS });
		}

		if (file.smoke.pullRequestScenario === WorkflowFixturePrScenario.OutOfSync) {
			return Promise.resolve({
				hasConflicts: true,
				mergeable: false,
				needsUpdate: true,
				mergeableState: "dirty",
				createdBy: "translate-react-bot",
			});
		}

		return Promise.resolve({ ...CLEAN_PULL_REQUEST_STATUS });
	});

	(
		github.getForkFileContentAtBranch as unknown as Mock<MockGitHubGetForkFileContentAtBranchFn>
	).mockImplementation((path) => {
		const file = fileByRepoPath.get(path);
		if (!file || file.smoke.pullRequestScenario === WorkflowFixturePrScenario.New) {
			return Promise.resolve(undefined);
		}

		return Promise.resolve(
			file.smoke.forkContent ?? defaultWorkflowFixtureForkContent(file.treeItem.filename),
		);
	});

	const runnerCommitAt = defaultWorkflowFixtureRunnerCommitAt();

	(
		github.getLatestTranslationCommit as unknown as Mock<MockGitHubGetLatestTranslationCommitFn>
	).mockImplementation((branch) => {
		const file = fileByBranch.get(branch);
		if (file?.smoke.pullRequestScenario !== WorkflowFixturePrScenario.MaintainerFix) {
			return Promise.resolve(undefined);
		}

		return Promise.resolve({
			timestamp: runnerCommitAt,
			message: `docs: translate \`${file.treeItem.filename}\` to Brazilian Portuguese`,
		});
	});

	(
		github.getLatestTranslationCommitTimestamp as unknown as Mock<MockGitHubGetLatestTranslationCommitTimestampFn>
	).mockImplementation((branch) => {
		const file = fileByBranch.get(branch);
		if (file?.smoke.pullRequestScenario !== WorkflowFixturePrScenario.MaintainerFix) {
			return Promise.resolve(undefined);
		}

		return Promise.resolve(runnerCommitAt);
	});

	(
		github.listPullRequestReviews as unknown as Mock<ListPullRequestReviewsMockFn>
	).mockImplementation((prNumber) => {
		const file = fileByPullRequestNumber.get(prNumber);
		if (file?.smoke.pullRequestScenario !== WorkflowFixturePrScenario.MaintainerFix) {
			return Promise.resolve([]);
		}

		const bodies =
			file.smoke.maintainerReviewBodies ??
			defaultWorkflowFixtureMaintainerReviews(file.treeItem.filename);
		const logins = file.smoke.maintainerReviewerLogins ?? ["maintainer"];

		return Promise.resolve(
			bodies.map((body, index) => ({
				id: 100 + index,
				login: logins[index] ?? logins[0] ?? "maintainer",
				authorAssociation: "MEMBER",
				userType: "User",
				state: "CHANGES_REQUESTED",
				submittedAt: defaultWorkflowFixtureMaintainerReviewAt(),
				body,
			})),
		);
	});
}

/**
 * Returns whether fixture fork markdown should read as already translated for CLD mocks.
 *
 * @param content Fork branch markdown body
 *
 * @returns `true` when the content matches default Portuguese fixture copy
 */
function isWorkflowFixtureForkPortugueseContent(content: string) {
	return /(português|Seção de exemplo|Título de exemplo|Conteúdo em português)/i.test(content);
}

/**
 * Configures language-detector mocks for workflow fixture PR scenarios.
 *
 * @param languageDetector Mock language detector from {@link createMockLanguageDetectorService}
 * @param files Loaded workflow fixtures with smoke scenario metadata
 */
function applyWorkflowSmokeLanguageDetectorMocks(
	languageDetector: MockLanguageDetectorService,
	files: readonly WorkflowFixtureFile[],
) {
	const forkContentByPath = new Map(
		files
			.filter((file) => file.smoke.pullRequestScenario !== WorkflowFixturePrScenario.New)
			.map(
				(file) =>
					[
						file.treeItem.path,
						file.smoke.forkContent ?? defaultWorkflowFixtureForkContent(file.treeItem.filename),
					] as const,
			),
	);

	(
		languageDetector.analyzeLanguage as Mock<
			(filename: string, content: string) => Promise<LanguageAnalysisResult>
		>
	).mockImplementation((_filename, content) => {
		const trimmed = content.trim();
		const isTranslated =
			isWorkflowFixtureForkPortugueseContent(trimmed) ||
			[...forkContentByPath.values()].some((forkContent) => forkContent === content);

		const analysis = {
			languageScore: isTranslated ? { target: 0.9, source: 0.1 } : { target: 0.1, source: 0.9 },
			ratio: isTranslated ? 0.9 : 0.1,
			isTranslated,
			detectedLanguage: isTranslated ? "pt" : "en",
			rawResult: {
				reliable: true,
				languages: [],
				textBytes: trimmed.length,
				chunks: [],
			},
		} satisfies LanguageAnalysisResult;

		return Promise.resolve(analysis);
	});
}

/** Repo-relative directory of docs-style markdown used by smoke and integration workflow tests */
export const MD_FIXTURE_DIR = "tests/fixtures/md" as const;

export type { WorkflowFixtureFile } from "@tests/fixtures/workflow-fixture.util";

/**
 * When {@link createWorkflowGitHubServiceFromFiles} receives this object, mocked GitHub writes
 * persist translated blobs, pull request copy, and the translation-progress issue comment body
 * under {@link WorkflowGitHubArtifactOptions.captureArtifactsDir}. Each processed file gets a
 * subdirectory named from its path under `src/content/` (e.g. `hydrateRoot.md` → `hydrateRoot/`)
 * containing `translated.md` and `pull-request.md`. The issue comment is
 * `translation-progress-issue-comment.md` at the capture root. `ci:smoke` defaults
 * `captureArtifactsDir` to `.out/`; CI packaging is documented in
 * [CONTRIBUTING.md](../../CONTRIBUTING.md#workflow-smoke).
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
	).mockResolvedValue(null);
}

/** Restores the OpenRouter limits spy installed by {@link installOpenRouterModelLimitsStub} */
export function restoreOpenRouterModelLimitsStub() {
	openRouterLimitsSpy?.mockRestore();
	openRouterLimitsSpy = undefined;
}

/**
 * Lists every `*.md` basename under the integration markdown fixture directory.
 *
 * @param cwd Repository root for resolving {@link MD_FIXTURE_DIR}
 */
async function listMdFixtureBasenames(cwd: string) {
	const absoluteDir = path.resolve(cwd, MD_FIXTURE_DIR);
	const entries = await fs.readdir(absoluteDir, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort();
}

/**
 * Loads markdown fixtures from `tests/fixtures/md/` for integration workflow tests.
 *
 * When `basenames` is omitted or empty, loads every `*.md` in that directory (sorted). When set,
 * loads only those files in the given order; each name must exist.
 *
 * @param basenames Optional subset of fixture filenames (e.g. `["use-memo.md"]`)
 * @param cwd Repository root (defaults to `process.cwd()`)
 */
export async function loadWorkflowFilesFromMdFixtureDir(
	basenames?: readonly string[],
	cwd: string = process.cwd(),
) {
	const allNames = await listMdFixtureBasenames(cwd);
	const orderedNames = basenames !== undefined && basenames.length > 0 ? [...basenames] : allNames;

	if (orderedNames.length === 0) {
		throw new Error(`No .md files found under ${MD_FIXTURE_DIR}`);
	}

	if (basenames !== undefined && basenames.length > 0) {
		for (const name of basenames) {
			if (!allNames.includes(name)) {
				throw new Error(
					`Fixture ${name} not found under ${MD_FIXTURE_DIR} (have: ${allNames.join(", ")})`,
				);
			}
		}
	}

	const absoluteDir = path.resolve(cwd, MD_FIXTURE_DIR);
	const files: WorkflowFixtureFile[] = [];

	for (const name of orderedNames) {
		const absoluteFile = path.join(absoluteDir, name);
		const content = await fs.readFile(absoluteFile, "utf8");
		const manifestEntry =
			name in WORKFLOW_FIXTURE_MANIFEST ?
				WORKFLOW_FIXTURE_MANIFEST[name as keyof typeof WORKFLOW_FIXTURE_MANIFEST]
			:	defaultWorkflowFixtureManifestEntry(name);

		files.push(buildWorkflowFixtureFile(manifestEntry.tree, content, manifestEntry.smoke));
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
	files: readonly WorkflowFixtureFile[],
	artifactOptions?: WorkflowGitHubArtifactOptions,
) {
	if (files.length === 0) {
		throw new Error("createWorkflowGitHubServiceFromFiles requires at least one file");
	}

	const github = createMockGitHubService();
	const byRepoPath = new Map(files.map((file) => [file.treeItem.path, file] as const));
	const pullRequestNumberByBranch = new Map(
		files.map(
			(file) =>
				[
					getTranslationBranchNameFromPath(file.treeItem.path),
					file.smoke.pullRequestNumber,
				] as const,
		),
	);

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

				const pullRequestNumber = pullRequestNumberByBranch.get(opts.branch) ?? 1;

				return {
					number: pullRequestNumber,
					title: opts.title,
					html_url: `https://github.com/test/test/pull/${pullRequestNumber}`,
				} as RestEndpointMethodTypes["pulls"]["create"]["response"]["data"];
			},
		);

		(
			github.commentCompiledResultsOnIssue as unknown as Mock<CommentCompiledResultsMockFn>
		).mockImplementation(async (results, filesToTranslate) => {
			if (results.length === 0 || filesToTranslate.length === 0) {
				return undefined;
			}

			const payload = selectProgressCommentPayload(results, filesToTranslate);

			if (!hasReportableProgressComment(payload)) {
				return undefined;
			}

			await fs.mkdir(captureRoot, { recursive: true });
			const body = commentBuilderService.buildProgressComment(payload);
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
			path: file.treeItem.path,
			type: file.treeItem.type,
			sha: file.treeItem.sha,
			mode: file.treeItem.mode,
			url: file.treeItem.url,
		})) satisfies GitTree,
	);

	(github.getFile as unknown as Mock<GetFileMockFn>).mockImplementation((item) => {
		const source = byRepoPath.get(item.path);
		if (!source) {
			return Promise.reject(new Error(`getFile: unmocked path ${item.path}`));
		}

		return Promise.resolve(source.blob);
	});

	github.getPullRequestFiles.mockResolvedValue(files.map((file) => file.treeItem.path));

	applyWorkflowSmokePullRequestMocks(github, files);

	return github;
}

/**
 * Builds a GitHub mock whose tree and `getFile` results match one markdown document.
 *
 * @param file Repository path, display filename, raw content, and blob sha for the scenario
 */
export function createWorkflowGitHubService(file: WorkflowFixtureFile) {
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

export function createIntegrationRunner(file: WorkflowFixtureFile) {
	const github = createWorkflowGitHubService(file);
	const { translator, chatMock } = createIntegrationTranslator();
	const languageDetector = createMockLanguageDetectorService();
	applyWorkflowSmokeLanguageDetectorMocks(languageDetector, [file]);

	const runner = new RunnerService(
		{
			github: github as unknown as GitHubService,
			translator,
			languageCache:
				createMockLanguageCacheService() as unknown as CacheService<LanguageCacheEntry>,
			locale: localeService,
			languageDetector: languageDetector as unknown as LanguageDetectorService,
		},
		{ batchSize: 1 },
	);

	return { runner, github, translator, chatMock, languageDetector };
}
