import { describe, expect, test } from "bun:test";

import { TranslationFile } from "@/app/services/translator/";
import { TranslationPipelineManager } from "@/app/services/translator/pipeline/translation-pipeline.manager";

describe("TranslationPipelineManager", () => {
	test("retries translateBody with accumulated guard hints before succeeding", async () => {
		const file = new TranslationFile("# Title\n\nBody", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager(2);
		let callCount = 0;
		let lastHints: readonly string[] = [];

		const result = await pipeline.translateWithValidationRetries({
			file,
			translateBody: (context) => {
				lastHints = context.validationRetryHints;
				callCount++;
				return Promise.resolve(callCount === 1 ? "bad" : "good");
			},
			finalizeTranslation: (body) => Promise.resolve(body),
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

		expect(result.content).toBe("good");
		expect(result.retries).toEqual([
			{ guardId: "fenceFunctionIdentifiers", message: "identifiers changed" },
		]);
		expect(callCount).toBe(2);
		expect(lastHints).toEqual(["keep `Foo` unchanged"]);
	});

	test("throws after final failed attempt", () => {
		const file = new TranslationFile("# Title", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager(2);

		expect(
			pipeline.translateWithValidationRetries({
				file,
				translateBody: () => Promise.resolve("bad"),
				finalizeTranslation: (body) => Promise.resolve(body),
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
