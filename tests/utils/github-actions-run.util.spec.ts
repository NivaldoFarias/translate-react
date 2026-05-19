import { describe, expect, test } from "bun:test";

import { ptBrLocale } from "@/locales/pt-br.locale";
import { resolveGitHubActionsRunContext } from "@/utils/github-actions-run.util";

const sampleCiEnv = {
	GITHUB_ACTIONS: true,
	GITHUB_SERVER_URL: "https://github.com",
	GITHUB_REPOSITORY: "reactjs/ru.react.dev",
	GITHUB_RUN_ID: "25802803407",
	GITHUB_WORKFLOW: "Run Translation Workflow",
	GITHUB_REF: "refs/heads/main",
	GITHUB_REF_NAME: "main",
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
				GITHUB_REF: "refs/heads/main",
				GITHUB_REF_NAME: "main",
			}),
		).toBeUndefined();
	});

	test("resolveGitHubActionsRunContext returns undefined without ref", () => {
		expect(
			resolveGitHubActionsRunContext({
				...sampleCiEnv,
				GITHUB_REF: "",
				GITHUB_REF_NAME: "",
			}),
		).toBeUndefined();
	});

	test("resolveGitHubActionsRunContext builds URL, labels, and ref from GITHUB_REF_NAME", () => {
		const context = resolveGitHubActionsRunContext(sampleCiEnv);

		expect(context?.url).toBe("https://github.com/reactjs/ru.react.dev/actions/runs/25802803407");
		expect(context?.workflowName).toBe("Run Translation Workflow");
		expect(context?.runId).toBe("25802803407");
		expect(context?.refLabel).toBe("main");
	});

	test("resolveGitHubActionsRunContext parses tag from GITHUB_REF when ref name is missing", () => {
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
		expect(prefix).toContain("[`Run Translation Workflow` · #25802803407](https://github.com/reactjs/ru.react.dev/actions/runs/25802803407)");
	});
});
