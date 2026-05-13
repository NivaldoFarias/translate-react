import { describe, expect, test } from "bun:test";

import {
	formatGithubActionsRunIssueLine,
	resolveGitHubActionsRunContext,
} from "@/utils/github-actions-run.util";

const sampleCiEnv = {
	GITHUB_ACTIONS: true,
	GITHUB_SERVER_URL: "https://github.com",
	GITHUB_REPOSITORY: "reactjs/ru.react.dev",
	GITHUB_RUN_ID: "25802803407",
	GITHUB_WORKFLOW: "Sync & Translate",
} as const;

describe("github-actions-run.util", () => {
	test("resolveGitHubActionsRunContext returns undefined when Actions is off", () => {
		expect(
			resolveGitHubActionsRunContext({
				...sampleCiEnv,
				GITHUB_ACTIONS: false,
			}),
		).toBeUndefined();
	});

	test("resolveGitHubActionsRunContext returns undefined without repository or run id", () => {
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

	test("resolveGitHubActionsRunContext builds URL and labels", () => {
		const context = resolveGitHubActionsRunContext(sampleCiEnv);

		expect(context?.url).toBe("https://github.com/reactjs/ru.react.dev/actions/runs/25802803407");
		expect(context?.workflowName).toBe("Sync & Translate");
		expect(context?.runId).toBe("25802803407");
	});

	test("formatGithubActionsRunIssueLine produces Markdown link", () => {
		const line = formatGithubActionsRunIssueLine(sampleCiEnv);

		expect(line).toContain("**CI run:**");
		expect(line).toContain("[`Sync & Translate` · #25802803407]");
		expect(line).toContain("(https://github.com/reactjs/ru.react.dev/actions/runs/25802803407)");
	});
});
