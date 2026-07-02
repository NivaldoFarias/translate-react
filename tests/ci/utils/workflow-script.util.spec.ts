import { beforeEach, describe, expect, mock, test } from "bun:test";
import pino from "pino";

const writeGitHubActionsOutput = mock(() => {
	/* empty */
});

void mock.module("@/ci/utils/github-output.util", () => ({
	writeGitHubActionsOutput,
}));

const { writePollWorkflowOutputs, writeResolveMatrixWorkflowOutputs } =
	await import("@/ci/utils/workflow-script.util");

const testLogger = pino({ level: "silent" });

describe("workflow-script.util", () => {
	beforeEach(() => {
		writeGitHubActionsOutput.mockClear();
	});

	describe("writePollWorkflowOutputs", () => {
		test("writes has_changes and matrix outputs", () => {
			writePollWorkflowOutputs(testLogger, true, [{ lang: "pt-br" }]);

			expect(writeGitHubActionsOutput).toHaveBeenCalledTimes(2);
			expect(writeGitHubActionsOutput).toHaveBeenNthCalledWith(1, "has_changes", "true");
			expect(writeGitHubActionsOutput).toHaveBeenNthCalledWith(
				2,
				"matrix",
				JSON.stringify([{ lang: "pt-br" }]),
			);
		});
	});

	describe("writeResolveMatrixWorkflowOutputs", () => {
		test("writes has_matrix false when the matrix is empty", () => {
			writeResolveMatrixWorkflowOutputs(testLogger, []);

			expect(writeGitHubActionsOutput).toHaveBeenCalledTimes(2);
			expect(writeGitHubActionsOutput).toHaveBeenNthCalledWith(1, "has_matrix", "false");
			expect(writeGitHubActionsOutput).toHaveBeenNthCalledWith(2, "matrix", "[]");
		});

		test("writes has_matrix true when the matrix has rows", () => {
			writeResolveMatrixWorkflowOutputs(testLogger, [{ lang: "ru" }]);

			expect(writeGitHubActionsOutput).toHaveBeenNthCalledWith(1, "has_matrix", "true");
			expect(writeGitHubActionsOutput).toHaveBeenNthCalledWith(
				2,
				"matrix",
				JSON.stringify([{ lang: "ru" }]),
			);
		});
	});
});
