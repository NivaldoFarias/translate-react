import { describe, expect, test } from "bun:test";

import { ptBrLocale } from "@/app/locales/pt-br.locale";
import {
	buildRunnerNewIssueChooserUrl,
	detectRateLimit,
	filterMarkdownFiles,
	formatElapsedTime,
	nftsCompatibleDateString,
	resolveRunnerNewIssueChooserUrl,
	WORKFLOW_RUNNER_REPOSITORY_HTML_BASE,
} from "@/app/utils/";
import { resolveGitHubActionsRunContext } from "@/app/utils/common.util";

import { createRepositoryTreeItemFixture } from "@tests/fixtures";

const sampleCiEnv = {
	GITHUB_ACTIONS: true,
	GITHUB_SERVER_URL: "https://github.com",
	GITHUB_REPOSITORY: "reactjs/ru.react.dev",
	GITHUB_RUN_ID: "25802803407",
	GITHUB_WORKFLOW: "Run Translation Workflow",
	GITHUB_REF: "refs/heads/main",
	GITHUB_REF_NAME: "main",
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
					GITHUB_REF: "refs/heads/main",
					GITHUB_REF_NAME: "main",
				}),
			).toBeUndefined();
		});

		test("returns undefined without ref", () => {
			expect(
				resolveGitHubActionsRunContext({
					...sampleCiEnv,
					GITHUB_REF: "",
					GITHUB_REF_NAME: "",
				}),
			).toBeUndefined();
		});

		test("builds URL, labels, and ref from GITHUB_REF_NAME", () => {
			const context = resolveGitHubActionsRunContext(sampleCiEnv);

			expect(context?.url).toBe("https://github.com/reactjs/ru.react.dev/actions/runs/25802803407");
			expect(context?.workflowName).toBe("Run Translation Workflow");
			expect(context?.runId).toBe("25802803407");
			expect(context?.refLabel).toBe("main");
		});

		test("parses tag from GITHUB_REF when ref name is missing", () => {
			const context = resolveGitHubActionsRunContext({
				...sampleCiEnv,
				GITHUB_REF: "refs/tags/v0.1.28",
				GITHUB_REF_NAME: "",
			});

			expect(context?.refLabel).toBe("v0.1.28");
		});

		test("pt-br progress comment prefix includes ref and linked workflow run in CI", () => {
			const context = resolveGitHubActionsRunContext(sampleCiEnv);
			const prefix = ptBrLocale.comment.prefix(context);

			expect(prefix).toContain("A última execução do `translate-react`");
			expect(prefix).toContain("**main**");
			expect(prefix).toContain(
				"[`Run Translation Workflow` · #25802803407](https://github.com/reactjs/ru.react.dev/actions/runs/25802803407)",
			);
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
