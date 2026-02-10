import { mock } from "bun:test";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { LanguageAnalysisResult, PullRequestStatus } from "@/services/";
import type { ReactLanguageCode } from "@/utils/constants.util";

import { createTranslationFileFixture } from "@tests/fixtures";

/**
 * Creates a mock CommentBuilderService for testing.
 *
 * @returns Mocked CommentBuilderService instance
 */
export function createMockCommentBuilderService() {
	return {
		build: mock(() => "Mock comment"),
		buildComment: mock(() => "Mock comment"),
		concatComment: mock((content: string) => `prefix\n\n${content}\n\nsuffix`),
		comment: {
			suffix: "suffix",
			prefix: "prefix",
		},
	};
}

/**
 * Creates a mock GitHubService for testing.
 *
 * Mocks the unified GitHub API surface (repository, branch, content/PR operations).
 * Use when testing consumers that depend on GitHubService (e.g. RunnerService).
 *
 * @returns Mocked GitHubService instance
 */
export function createMockGitHubService() {
	return {
		getDefaultBranch: mock(() => Promise.resolve("main")),
		getForkOwner: mock(() => Promise.resolve("test-fork-owner")),
		getCurrentUser: mock(() => Promise.resolve("test-user")),
		getRepositoryTree: mock(() =>
			Promise.resolve([
				{
					path: "src/test/file.md",
					type: "blob",
					sha: "abc123",
					mode: "",
				},
			] satisfies RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"]),
		),
		verifyTokenPermissions: mock(() => Promise.resolve(true)),
		isBranchBehind: mock(() => Promise.resolve(false)),
		forkExists: mock(() => Promise.resolve()),
		isForkSynced: mock(() => Promise.resolve(true)),
		syncFork: mock(() => Promise.resolve(true)),
		fetchTranslationGuidelinesFile: mock(
			() => Promise.resolve("React - React\ncomponent - componente") as Promise<string | null>,
		),
		createBranch: mock(() =>
			Promise.resolve({
				data: {
					ref: "refs/heads/translate/test",
					object: { sha: "abc123" },
				},
			}),
		),
		getBranch: mock(() =>
			Promise.resolve({
				data: { object: { sha: "abc123" } },
			}),
		),
		deleteBranch: mock(() => Promise.resolve({ data: {}, status: 204 })),
		createCommentOnPullRequest: mock(() =>
			Promise.resolve({ data: { id: 1, body: "Mock comment" } }),
		),
		listOpenPullRequests: mock(() => Promise.resolve([])),
		getPullRequestFiles: mock(() => Promise.resolve(["src/test/file.md"])),
		commitTranslation: mock(() =>
			Promise.resolve({
				data: { content: { sha: "new-sha" }, commit: { sha: "commit-sha" } },
			}),
		),
		createPullRequest: mock(() =>
			Promise.resolve({
				number: 1,
				title: "test: translation",
				html_url: "https://github.com/test/test/pull/1",
			}),
		),
		getFile: mock(() => Promise.resolve(createTranslationFileFixture())),
		findPullRequestByBranch: mock(() =>
			Promise.resolve(
				undefined as
					| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
					| undefined,
			),
		),
		checkPullRequestStatus: mock(() =>
			Promise.resolve({
				needsUpdate: false,
				mergeableState: "clean",
				createdBy: "test-fork-owner",
			} as PullRequestStatus),
		),
		closePullRequest: mock(() =>
			Promise.resolve({
				number: 1,
				state: "closed",
			} as RestEndpointMethodTypes["pulls"]["update"]["response"]["data"]),
		),
		commentCompiledResultsOnIssue: mock(() => Promise.resolve({ id: 1 })),
	};
}

/**
 * Creates a mock TranslatorService for testing.
 *
 * @returns Mocked TranslatorService instance
 */
export function createMockTranslatorService() {
	return {
		translateContent: mock(() => Promise.resolve("Conteúdo traduzido")),
		isContentTranslated: mock(() => Promise.resolve(false)),
		testConnectivity: mock(() => Promise.resolve()),
		getLanguageAnalysis: mock(() =>
			Promise.resolve({
				languageScore: { target: 0.1, source: 0.9 },
				ratio: 0.1,
				isTranslated: false,
				detectedLanguage: "en",
			}),
		),
		languageDetector: {
			detectPrimaryLanguage: mock(() => Promise.resolve("en")),
			analyzeLanguage: mock(() =>
				Promise.resolve({
					languageScore: { target: 0.1, source: 0.9 },
					ratio: 0.1,
					isTranslated: false,
					detectedLanguage: "en",
				}),
			),
			getLanguageName: mock((code: string) => {
				if (code === "en") return "English";
				if (code === "pt-br") return "Brazilian Portuguese";
				return undefined;
			}),
			languages: {
				source: "en",
				target: "pt-br",
			},
		},
		translationGuidelines: null,
	};
}

/**
 * Creates a mock CacheService for language cache testing.
 *
 * Matches the CacheService<LanguageCacheEntry> interface.
 *
 * @returns Mocked CacheService instance
 */
export function createMockLanguageCacheService() {
	return {
		get: mock((_key: string) => null),
		getMany: mock((_keys: string[]) => new Map()),
		set: mock(
			(
				_key: string,
				_value: { detectedLanguage: string; confidence: number; timestamp: number },
				_ttlMs: number,
			) => {
				/* empty */
			},
		),
		has: mock((_key: string) => false),
		delete: mock((_key: string) => {
			/* empty */
		}),
		clear: mock(() => {
			/* empty */
		}),
		size: 0,
		cleanupExpired: mock(() => 0),
	};
}

/**
 * Creates a mock LanguageDetectorService for testing.
 *
 * @returns Mocked LanguageDetectorService instance
 */
export function createMockLanguageDetectorService() {
	return {
		detectPrimaryLanguage: mock(() => Promise.resolve("en" satisfies ReactLanguageCode)),
		analyzeLanguage: mock(() =>
			Promise.resolve({
				languageScore: { target: 0.1, source: 0.9 },
				ratio: 0.1,
				isTranslated: false,
				detectedLanguage: "en",
				rawResult: {
					reliable: true,
					textBytes: 1234,
					languages: [],
					chunks: [],
				},
			} satisfies LanguageAnalysisResult),
		),
		getLanguageName: mock((code: string): string => {
			if (code === "en") return "English";
			if (code === "pt-br") return "Brazilian Portuguese";
			return "Unknown";
		}),
		languages: {
			source: "en",
			target: "pt-br",
		},
	};
}

export type MockCommentBuilderService = ReturnType<typeof createMockCommentBuilderService>;
export type MockGitHubService = ReturnType<typeof createMockGitHubService>;
export type MockTranslatorService = ReturnType<typeof createMockTranslatorService>;
export type MockLanguageCacheService = ReturnType<typeof createMockLanguageCacheService>;
export type MockLanguageDetectorService = ReturnType<typeof createMockLanguageDetectorService>;
