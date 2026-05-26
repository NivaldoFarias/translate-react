import { describe, expect, test } from "bun:test";

import { TranslationFile } from "@/services/translator/";
import { TranslationPipelineManager } from "@/services/translator/pipeline/translation-pipeline.manager";

describe("TranslationPipelineManager", () => {
	test("retries translateBody with accumulated guard hints before succeeding", async () => {
		const file = new TranslationFile("# Title\n\nBody", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager(2);
		let callCount = 0;
		let lastHints: readonly string[] = [];

		const result = await pipeline.translateWithValidationRetries({
			file,
			translateBody: async (context) => {
				lastHints = context.validationRetryHints;
				callCount++;
				return callCount === 1 ? "bad" : "good";
			},
			finalizeTranslation: async (body) => body,
			collectIssues: (content) =>
				content === "bad" ?
					[
						{
							guardId: "fenceFunctionIdentifiers",
							message: "identifiers changed",
							retryHint: "keep `Foo` unchanged",
						},
					]
				:	[],
			createFailedError: () => {
				throw new Error("should not fail");
			},
		});

		expect(result).toBe("good");
		expect(callCount).toBe(2);
		expect(lastHints).toEqual(["keep `Foo` unchanged"]);
	});

	test("throws after final failed attempt", async () => {
		const file = new TranslationFile("# Title", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager(2);

		expect(
			pipeline.translateWithValidationRetries({
				file,
				translateBody: async () => "bad",
				finalizeTranslation: async (body) => body,
				collectIssues: () => [
					{
						guardId: "nonEmptyContent",
						message: "empty",
						retryHint: "return full document",
					},
				],
				createFailedError: () => {
					const error = new Error("validation failed");
					return error as never;
				},
			}),
		).rejects.toThrow("validation failed");
	});
});
