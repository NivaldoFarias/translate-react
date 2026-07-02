import { describe, expect, test } from "bun:test";

import { ptBrLocale } from "@/app/locales/pt-br.locale";
import {
	buildRunnerNewIssueChooserUrl,
	detectRateLimit,
	filterMarkdownFiles,
	formatElapsedTime,
	isSafeTranslatablePath,
	nftsCompatibleDateString,
	resolveRunnerNewIssueChooserUrl,
	resolveString,
	WORKFLOW_RUNNER_REPOSITORY_HTML_BASE,
} from "@/app/utils/";
import { buildRunnerReleaseUrl, resolveGitHubActionsRunContext } from "@/app/utils/common.util";

import { createRepositoryTreeItemFixture } from "@tests/fixtures";

const sampleCiEnv = {
	GITHUB_ACTIONS: true,
	GITHUB_SERVER_URL: "https://github.com",
	GITHUB_REPOSITORY: "reactjs/ru.react.dev",
	GITHUB_RUN_ID: "25802803407",
	GITHUB_WORKFLOW: "Run Translation Workflow",
} as const;

describe("common.util", () => {
	describe("nftsCompatibleDateString", () => {
		test("replaces colons with hyphens in ISO string", () => {
			const date = new Date("2024-01-01T12:34:56.000Z");
			const result = nftsCompatibleDateString(date);

			expect(result).toBe("2024-01-01T12-34-56.000Z");
		});

		test("includes milliseconds and timezone offset", () => {
			const date = new Date("2024-01-01T00:00:00.123Z");
			const result = nftsCompatibleDateString(date);

			expect(result).toBe("2024-01-01T00-00-00.123Z");
		});
	});

	describe("resolveString", () => {
		test("returns whenTrue for a truthy condition", () => {
			expect(resolveString(true, "included")).toBe("included");
		});

		test("returns whenFalse for a falsy condition", () => {
			expect(resolveString(false, "included", "fallback")).toBe("fallback");
		});

		test("defaults whenFalse to an empty string", () => {
			expect(resolveString(0, "included")).toBe("");
		});

		test("evaluates a lazy factory only when the value is truthy", () => {
			let buildCount = 0;

			expect(
				resolveString(false, () => {
					buildCount += 1;
					return "built";
				}),
			).toBe("");
			expect(buildCount).toBe(0);

			expect(
				resolveString("ctx", (ctx) => {
					buildCount += 1;
					return `built-${ctx}`;
				}),
			).toBe("built-ctx");
			expect(buildCount).toBe(1);
		});
	});

	describe("formatElapsedTime", () => {
		test("formats duration under 60 seconds in seconds", () => {
			const result = formatElapsedTime(30_000);

			expect(result).toContain("30");
			expect(result.toLowerCase()).toContain("second");
		});

		test("formats duration under 3600 seconds in minutes", () => {
			const result = formatElapsedTime(120_000);

			expect(result).toContain("2");
			expect(result.toLowerCase()).toContain("minute");
		});

		test("formats duration over 3600 seconds in hours", () => {
			const result = formatElapsedTime(7200_000);

			expect(result).toContain("2");
			expect(result.toLowerCase()).toContain("hour");
		});

		test("formats duration with locale-specific unit names", () => {
			const result = formatElapsedTime(120_000, "pt-BR");

			expect(result).toContain("2");
			expect(result.toLowerCase()).toContain("minuto");
		});
	});

	describe("filterMarkdownFiles", () => {
		test("includes items with .md path under src/", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/docs/readme.md" }),
				createRepositoryTreeItemFixture({ path: "src/content/page.md" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(2);
			expect(result[0]?.path).toBe("src/docs/readme.md");
			expect(result[1]?.path).toBe("src/content/page.md");
		});

		test("excludes items without .md extension", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/docs/readme.md" }),
				createRepositoryTreeItemFixture({ path: "src/content/index.js" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe("src/docs/readme.md");
		});

		test("excludes items whose path does not include src/", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/docs/readme.md" }),
				createRepositoryTreeItemFixture({ path: "docs/readme.md" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe("src/docs/readme.md");
		});

		test("excludes path traversal and unsafe upstream paths", () => {
			const tree = [
				createRepositoryTreeItemFixture({ path: "src/../secret.md" }),
				createRepositoryTreeItemFixture({ path: "src/foo/../../bar.md" }),
				createRepositoryTreeItemFixture({ path: "src/content/page.md" }),
			];

			const result = filterMarkdownFiles(tree);

			expect(result).toHaveLength(1);
			expect(result[0]?.path).toBe("src/content/page.md");
		});
	});

	describe("isSafeTranslatablePath", () => {
		test("accepts nested markdown paths under src/", () => {
			expect(isSafeTranslatablePath("src/content/page.md")).toBe(true);
			expect(isSafeTranslatablePath("src/content/nested/page.md")).toBe(true);
			expect(isSafeTranslatablePath("src/new.md")).toBe(true);
		});

		test("rejects path traversal, absolute paths, and non-markdown paths", () => {
			expect(isSafeTranslatablePath("src/../secret.md")).toBe(false);
			expect(isSafeTranslatablePath("src/foo/../../bar.md")).toBe(false);
			expect(isSafeTranslatablePath("/src/content/page.md")).toBe(false);
			expect(isSafeTranslatablePath("src\\content\\page.md")).toBe(false);
			expect(isSafeTranslatablePath("docs/readme.md")).toBe(false);
			expect(isSafeTranslatablePath("src/content/page.txt")).toBe(false);
		});
	});

	describe("detectRateLimit", () => {
		test("returns true when statusCode is 429", () => {
			expect(detectRateLimit("any message", 429)).toBe(true);
		});

		test("returns true when message contains rate limit phrase", () => {
			expect(detectRateLimit("Rate limit exceeded")).toBe(true);
		});

		test("returns true when message contains 429", () => {
			expect(detectRateLimit("Error 429 too many requests")).toBe(true);
		});

		test("returns true when message contains quota", () => {
			expect(detectRateLimit("Quota exceeded for this month")).toBe(true);
		});

		test("returns false when message and status are not rate limit", () => {
			expect(detectRateLimit("Not found", 404)).toBe(false);
		});
	});

	describe("resolveGitHubActionsRunContext", () => {
		test("returns undefined when Actions is off", () => {
			expect(
				resolveGitHubActionsRunContext({
					...sampleCiEnv,
					GITHUB_ACTIONS: false,
				}),
			).toBeUndefined();
		});

		test("returns undefined without repository or run id", () => {
			expect(
				resolveGitHubActionsRunContext({
					GITHUB_ACTIONS: true,
					GITHUB_SERVER_URL: "https://github.com",
					GITHUB_REPOSITORY: "",
					GITHUB_RUN_ID: "1",
					GITHUB_WORKFLOW: "CI",
				}),
			).toBeUndefined();
		});

		test("builds URL, version, release URL, and workflow metadata from CI env", () => {
			const context = resolveGitHubActionsRunContext(sampleCiEnv);

			expect(context?.url).toBe("https://github.com/reactjs/ru.react.dev/actions/runs/25802803407");
			expect(context?.workflowName).toBe("Run Translation Workflow");
			expect(context?.runId).toBe("25802803407");
			expect(context?.version).toMatch(/^v\d+\.\d+\.\d+/);
			expect(context?.releaseUrl).toBe(buildRunnerReleaseUrl(context?.version ?? ""));
		});

		test("pt-br progress comment prefix links workflow run and release tag", () => {
			const context = resolveGitHubActionsRunContext(sampleCiEnv);
			const prefix = ptBrLocale.comment.prefix(context);

			expect(prefix).toContain(`[última execução](${context?.url})`);
			expect(prefix).toContain(`[\`translate-react@${context?.version}\`](${context?.releaseUrl})`);
		});
	});

	describe("buildRunnerNewIssueChooserUrl", () => {
		test("uses server and repository slug when slug is valid", () => {
			const url = buildRunnerNewIssueChooserUrl({
				githubServerUrl: "https://github.com",
				githubRepository: "acme/my-runner-fork",
			});

			expect(url).toBe("https://github.com/acme/my-runner-fork/issues/new/choose");
		});

		test("strips trailing slash from server URL", () => {
			const url = buildRunnerNewIssueChooserUrl({
				githubServerUrl: "https://git.example.com/",
				githubRepository: "org/tool",
			});

			expect(url).toBe("https://git.example.com/org/tool/issues/new/choose");
		});

		test("falls back to workflow runner base when repository slug is missing", () => {
			const url = buildRunnerNewIssueChooserUrl({
				githubServerUrl: "https://github.com",
				githubRepository: undefined,
			});

			expect(url).toBe(`${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/issues/new/choose`);
		});

		test("falls back when repository slug has no slash", () => {
			const url = buildRunnerNewIssueChooserUrl({
				githubServerUrl: "https://github.com",
				githubRepository: "invalidslug",
			});

			expect(url).toBe(`${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/issues/new/choose`);
		});

		test("falls back when repository slug is only owner with trailing slash", () => {
			const url = buildRunnerNewIssueChooserUrl({
				githubServerUrl: "https://github.com",
				githubRepository: "owner/",
			});

			expect(url).toBe(`${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/issues/new/choose`);
		});
	});

	describe("resolveRunnerNewIssueChooserUrl", () => {
		test("matches canonical fallback under test env (no GITHUB_REPOSITORY in defaults)", () => {
			const url = resolveRunnerNewIssueChooserUrl();

			expect(url).toBe(`${WORKFLOW_RUNNER_REPOSITORY_HTML_BASE}/issues/new/choose`);
		});
	});
});
