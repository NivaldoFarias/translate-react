import { describe, expect, test } from "bun:test";

import { TranslationFile } from "@/app/services/translator/";
import { TranslationPipelineManager } from "@/app/services/translator/pipeline/translation-pipeline.manager";

describe("TranslationPipelineManager", () => {
	test("returns success with reviewer notices when only advisory guards fail", async () => {
		const file = new TranslationFile("# Title\n\nBody", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager();
		let callCount = 0;

		const result = await pipeline.translateWithValidation({
			file,
			translateBody: () => {
				callCount++;
				return Promise.resolve("translated body");
			},
			finalizeTranslation: (body) => Promise.resolve(body),
			collectIssues: () => [
				{
					guardId: "fenceFunctionIdentifiers",
					message: "identifiers changed",
					retryHint: "keep `Foo` unchanged",
				},
			],
			createFailedError: () => {
				throw new Error("should not fail");
			},
		});

		expect(result.content).toBe("translated body");
		expect(result.reviewerNotices).toEqual([
			{ guardId: "fenceFunctionIdentifiers", hint: "keep `Foo` unchanged" },
		]);
		expect(callCount).toBe(1);
	});

	test("throws when blocking guards fail without calling translateBody again", () => {
		const file = new TranslationFile("# Title", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager();
		let callCount = 0;

		expect(
			pipeline.translateWithValidation({
				file,
				translateBody: () => {
					callCount++;
					return Promise.resolve("bad");
				},
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

		expect(callCount).toBe(1);
	});

	test("returns clean result when no guards fail", async () => {
		const file = new TranslationFile("# Title\n\nBody", "doc.md", "src/doc.md", "sha");
		const pipeline = new TranslationPipelineManager();

		const result = await pipeline.translateWithValidation({
			file,
			translateBody: () => Promise.resolve("good"),
			finalizeTranslation: (body) => Promise.resolve(body),
			collectIssues: () => [],
			createFailedError: () => {
				throw new Error("should not fail");
			},
		});

		expect(result.reviewerNotices).toEqual([]);
	});
});
