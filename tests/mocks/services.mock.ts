import { mock } from "bun:test";

import type { ContentService } from "@/services/";

/**
 * Creates a mock CommentBuilderService for testing.
 *
 * @returns Mock CommentBuilderService instance
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
 * @returns Mock ContentService instance
 */
export function createMockContentService() {
	return {
		findPullRequestByBranch: mock(
			() => Promise.resolve(undefined) as ReturnType<ContentService["findPullRequestByBranch"]>,
		),
		checkPullRequestStatus: mock(
			() =>
				Promise.resolve({ needsUpdate: false, mergeableState: "clean" }) as ReturnType<
					ContentService["checkPullRequestStatus"]
				>,
		),
		getFileContent: mock(() => Promise.resolve("# Test Content")),
		getUntranslatedFiles: mock(
			() =>
				Promise.resolve([
					{
						path: "src/test/file.md",
						content: "# Test Content",
						sha: "abc123",
						filename: "file.md",
					},
				]) as ReturnType<ContentService["getUntranslatedFiles"]>,
		),
		commitTranslation: mock(
			() =>
				Promise.resolve({
					data: { content: { sha: "new-sha" }, commit: { sha: "commit-sha" } },
				}) as ReturnType<ContentService["commitTranslation"]>,
		),
		createPullRequest: mock(
			() =>
				Promise.resolve({
					number: 1,
					title: "test: translation",
					html_url: "https://github.com/test/test/pull/1",
				}) as ReturnType<ContentService["createPullRequest"]>,
		),
		listOpenPullRequests: mock(
			() => Promise.resolve([]) as ReturnType<ContentService["listOpenPullRequests"]>,
		),
		getPullRequestFiles: mock(() => Promise.resolve(["src/test/file.md"])),
		commentCompiledResultsOnIssue: mock(
			() =>
				Promise.resolve({ id: 1 }) as ReturnType<ContentService["commentCompiledResultsOnIssue"]>,
		),
	};
}

/**
 * Creates a mock BranchService for testing.
 *
 * @returns Mock BranchService instance
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
 * @returns Mock RepositoryService instance
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
	};
}

/**
 * Creates a mock TranslatorService for testing.
 *
 * @returns Mock TranslatorService instance
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
		},
		glossary: null,
	};
}

/**
 * Creates a mock LanguageCacheService for testing.
 *
 * @returns Mock LanguageCacheService instance
 */
export function createMockLanguageCacheService() {
	const cache = new Map<string, { isTranslated: boolean; confidence: number }>();

	return mock(() => ({
		get: mock((path: string) => cache.get(path)),
		set: mock((path: string, value: { isTranslated: boolean; confidence: number }) => {
			cache.set(path, value);
		}),
		has: mock((path: string) => cache.has(path)),
		clear: mock(() => {
			cache.clear();
		}),
		size: () => cache.size,
	}));
}

export type MockCommentBuilderService = ReturnType<typeof createMockCommentBuilderService>;
export type MockContentService = ReturnType<typeof createMockContentService>;
export type MockRepositoryService = ReturnType<typeof createMockRepositoryService>;
export type MockTranslatorService = ReturnType<typeof createMockTranslatorService>;
export type MockLanguageCacheService = ReturnType<typeof createMockLanguageCacheService>;
