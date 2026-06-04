import { beforeEach, describe, expect, test } from "bun:test";

import { TranslationFile } from "@/app/services/translator/translation-file";
import { PostTranslationValidationService } from "@/app/services/translator/validation/post-translation-validation.service";
import { ApplicationError } from "@/shared/errors";

describe("PostTranslationValidationService", () => {
	let validation: PostTranslationValidationService;

	beforeEach(() => {
		validation = new PostTranslationValidationService();
	});

	function makeFile(content: string) {
		return new TranslationFile(content, "test.md", "path/test.md", "sha123");
	}

	describe("validateTranslation", () => {
		test("throws ApplicationError with empty translated content", () => {
			const file = makeFile("# Title\n\nSome content");

			expect(() => {
				validation.validateTranslation(file, "");
			}).toThrow(ApplicationError);
			expect(() => {
				validation.validateTranslation(file, "");
			}).toThrow("empty content");
		});

		test("throws for whitespace-only translated content", () => {
			const file = makeFile("# Title\n\nSome content");

			expect(() => {
				validation.validateTranslation(file, "   \n  \t  ");
			}).toThrow("empty content");
		});

		test("throws when all headings are lost", () => {
			const file = makeFile("# Title\n\n## Section\n\nContent");

			expect(() => {
				validation.validateTranslation(file, "Just plain text");
			}).toThrow("All markdown headings lost");
		});

		test("throws when markdown links are broken", () => {
			const file = makeFile("[docs](/learn)");
			const translated = "\\`docs\\`](/learn)";

			expect(() => {
				validation.validateTranslation(file, translated);
			}).toThrow("Markdown links");
		});

		test("throws when fenced function identifiers change", () => {
			const file = makeFile("```js\nfunction OptimizedList() {}\n```");

			expect(() => {
				validation.validateTranslation(file, "```js\nfunction ListaOtimizada() {}\n```");
			}).toThrow("Function identifiers changed");
		});

		test("throws when static JSX demo text inside fences is translated", () => {
			const file = makeFile("```js\nreturn <div>Count: {renderCount}</div>;\n```");

			expect(() => {
				validation.validateTranslation(
					file,
					"```js\nreturn <div>Contagem: {renderCount}</div>;\n```",
				);
			}).toThrow("JSX demo text changed");
		});

		test("throws when frontmatter is removed", () => {
			const file = makeFile(`---
title: Example
---

# Title
`);

			expect(() => {
				validation.validateTranslation(file, "# Título\n");
			}).toThrow("Frontmatter lost");
		});

		test("passes for a well-formed translation", () => {
			const file = makeFile("# Title\n\n## Section\n\n[link](/path)\n");
			const translated = "# Título\n\n## Seção\n\n[link](/path)\n";

			expect(() => {
				validation.validateTranslation(file, translated);
			}).not.toThrow();
		});

		test("warns but does not throw when extra fenced blocks appear without source fences", () => {
			const file = makeFile("Just a paragraph with no headings.");

			expect(() => {
				validation.validateTranslation(file, "Texto\n\n```\nunexpected\n```");
			}).not.toThrow();
		});
	});

	describe("collectRetryableValidationIssues", () => {
		test("returns multiple issues with distinct guardIds", () => {
			const file = makeFile(`
# Title

\`\`\`js
function OptimizedList() {}
\`\`\`

[docs](/learn)
`);

			const issues = validation.collectRetryableValidationIssues(
				file,
				`
Plain text only

\`\`\`js
function ListaOtimizada() {}
\`\`\`

/learn
`,
			);

			const guardIds = issues.map((issue) => issue.guardId);

			expect(guardIds).toContain("headingsPreserved");
			expect(guardIds).toContain("fenceFunctionIdentifiers");
			expect(guardIds).toContain("markdownLinksPreserved");
		});

		test("createValidationFailedError aggregates every issue message", () => {
			const file = makeFile("[one](/a) [two](/b)");
			const translated = "/a";

			const issues = validation.collectRetryableValidationIssues(file, translated);
			const error = validation.createValidationFailedError(file, translated, issues);

			expect(error.message).toContain(";");
			expect(
				issues.every((issue) => error.message.includes(issue.message.split(":")[0] ?? "")),
			).toBe(true);
		});
	});
});
