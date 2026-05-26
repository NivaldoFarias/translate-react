import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { TranslationFile } from "@/services/translator/";

import { createTranslationFileFixture } from "@tests/fixtures";

describe("TranslationFile", () => {
	describe("logger", () => {
		test("should create logger with file context when no parent logger provided", () => {
			const file = createTranslationFileFixture({
				filename: "test.md",
				path: "src/test.md",
			});

			expect(file.logger).toBeDefined();
			expect(file.correlationId).toBeDefined();
			expect(typeof file.correlationId).toBe("string");
			expect(file.correlationId.length).toBeGreaterThan(0);
		});

		test("should create logger with file context properties", () => {
			const file = createTranslationFileFixture({
				filename: "example.md",
				path: "docs/example.md",
			});

			expect(file.logger).toBeDefined();
			expect(file.correlationId).toBeDefined();
			expect(typeof file.correlationId).toBe("string");
			expect(file.correlationId.length).toBeGreaterThan(0);

			const logSpy = spyOn(file.logger, "debug");
			file.logger.debug({ additional: "data" }, "test message");

			expect(logSpy).toHaveBeenCalled();
		});

		test("should generate unique correlation ID for each file instance", () => {
			const file1 = createTranslationFileFixture({ filename: "file1.md" });
			const file2 = createTranslationFileFixture({ filename: "file2.md" });

			expect(file1.correlationId).not.toBe(file2.correlationId);
		});

		test("should maintain same correlation ID across file lifecycle", () => {
			const file = createTranslationFileFixture({ filename: "test.md" });

			const correlationId1 = file.correlationId;
			const correlationId2 = file.correlationId;

			expect(correlationId1).toBe(correlationId2);
			expect(correlationId1).toBe(file.correlationId);
		});

		test("should use parent logger when provided", () => {
			const parentLogger = createTranslationFileFixture({ filename: "parent.md" }).logger;

			const file = new TranslationFile(
				"# Content",
				"child.md",
				"src/child.md",
				"sha123",
				parentLogger,
			);

			expect(file.logger).toBeDefined();
			expect(file.correlationId).toBeDefined();
		});
	});

	describe("extractDocTitleFromContent", () => {
		test("should extract title from frontmatter when title is present", () => {
			const content = `---\ntitle: 'Hello'\n---\n# Hello\nWelcome to React!`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBe("Hello");
		});

		test("should extract title from frontmatter when title is present with double quotes", () => {
			const content = `---\ntitle: "Hello"\n---\n# Hello\nWelcome to React!`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBe("Hello");
		});

		test("should extract title when value contains a colon inside double quotes", () => {
			const content = `---\ntitle: "https://react.dev"\n---\n# Hi`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBe("https://react.dev");
		});

		test("should not extract title from frontmatter when title is not present", () => {
			const content = `# Hello\nWelcome to React!`;
			const file = createTranslationFileFixture({ content });
			expect(file.title).toBeUndefined();
		});
	});
});
