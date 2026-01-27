import { mock } from "bun:test";

import type { RestEndpointMethodTypes } from "@octokit/rest";

import type { LanguageAnalysisResult, PullRequestStatus } from "@/services/";
import type { ReactLanguageCode } from "@/utils/constants.util";

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
 * Creates a mock ContentService for testing.
 *
 * @returns Mocked ContentService instance
 */
export function createMockContentService() {
	return {
		findPullRequestByBranch: mock(() =>
			Promise.resolve(
				undefined as
					| RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
					| undefined,
			),
		),
		checkPullRequestStatus: mock(() =>
			Promise.resolve({ needsUpdate: false, mergeableState: "clean" } as PullRequestStatus),
		),
		getFileContent: mock(() => Promise.resolve("# Test Content")),
		getUntranslatedFiles: mock(() =>
			Promise.resolve([
				{
					path: "src/test/file.md",
					content: "# Test Content",
					sha: "abc123",
					filename: "file.md",
				},
			]),
		),
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
		listOpenPullRequests: mock(() => Promise.resolve([])),
		getPullRequestFiles: mock(() => Promise.resolve(["src/test/file.md"])),
		commentCompiledResultsOnIssue: mock(() => Promise.resolve({ id: 1 })),
	};
}

/**
 * Creates a mock BranchService for testing.
 *
 * @returns Mocked BranchService instance
 */
export function createMockBranchService() {
	return {
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
		deleteBranch: mock(() => Promise.resolve({ data: {} })),
		checkIfCommitExistsOnFork: mock(() => Promise.resolve(false)),
		activeBranches: new Set<string>(),
	};
}

/**
 * Creates a mock RepositoryService for testing.
 *
 * @returns Mocked RepositoryService instance
 */
export function createMockRepositoryService() {
	return {
		getDefaultBranch: mock(() => Promise.resolve("main")),
		getRepositoryTree: mock(() =>
			Promise.resolve([
				{
					path: "src/test/file.md",
					type: "blob",
					sha: "abc123",
				},
			]),
		),
		verifyTokenPermissions: mock(() => Promise.resolve(true)),
		forkExists: mock(() => Promise.resolve()),
		isForkSynced: mock(() => Promise.resolve(true)),
		syncFork: mock(() => Promise.resolve(true)),
		fetchGlossary: mock(() => Promise.resolve("React - React\ncomponent - componente")),
		isBranchBehind: mock(() => Promise.resolve(false)),
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
		glossary: null,
	};
}

/**
 * Creates a mock LanguageCacheService for testing.
 *
 * @returns Mocked LanguageCacheService instance
 */
export function createMockLanguageCacheService() {
	const cache = new Map<string, { isTranslated: boolean; confidence: number }>();

	return {
		get: mock((path: string) => cache.get(path)),
		set: mock((path: string, value: { isTranslated: boolean; confidence: number }) => {
			cache.set(path, value);
		}),
		has: mock((path: string) => cache.has(path)),
		clear: mock(() => {
			cache.clear();
		}),
		size: () => cache.size,
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
export type MockContentService = ReturnType<typeof createMockContentService>;
export type MockRepositoryService = ReturnType<typeof createMockRepositoryService>;
export type MockTranslatorService = ReturnType<typeof createMockTranslatorService>;
export type MockLanguageCacheService = ReturnType<typeof createMockLanguageCacheService>;
export type MockBranchService = ReturnType<typeof createMockBranchService>;
export type MockLanguageDetectorService = ReturnType<typeof createMockLanguageDetectorService>;
