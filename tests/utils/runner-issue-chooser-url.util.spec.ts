import { describe, expect, test } from "bun:test";

import {
	buildRunnerNewIssueChooserUrl,
	resolveRunnerNewIssueChooserUrl,
	WORKFLOW_RUNNER_REPOSITORY_HTML_BASE,
} from "@/utils/";

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
