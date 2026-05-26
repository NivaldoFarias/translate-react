import { beforeEach, describe, expect, test } from "bun:test";

import { TranslationFile } from "@/services/";
import { PostTranslationValidationService } from "@/services/translator/validation/post-translation-validation.service";

describe("PostTranslationValidationService", () => {
	let validation: PostTranslationValidationService;

	beforeEach(() => {
		validation = new PostTranslationValidationService();
	});

	function makeFile(content: string) {
		return new TranslationFile(content, "test.md", "path/test.md", "sha123");
	}

	test("should throw when translated content is empty", () => {
		const file = makeFile("# Title\n\nSome content");

		expect(() => {
			validation.validateTranslation(file, "");
		}).toThrow("empty content");
	});

	test("should throw when translated content is whitespace-only", () => {
		const file = makeFile("# Title\n\nSome content");

		expect(() => {
			validation.validateTranslation(file, "   \n  \t  ");
		}).toThrow("empty content");
	});

	test("collectRetryableValidationIssues returns fenceFunctionIdentifiers issue", () => {
		const file = makeFile(`
# Title

\`\`\`js
function OptimizedList() {}
\`\`\`
`);

		const issues = validation.collectRetryableValidationIssues(
			file,
			`
# Título

\`\`\`js
function ListaOtimizada() {}
\`\`\`
`,
		);

		expect(issues.some((issue) => issue.guardId === "fenceFunctionIdentifiers")).toBe(true);
	});

	test("should throw when all headings are lost", () => {
		const file = makeFile("# Title\n\n## Section\n\nContent");

		expect(() => {
			validation.validateTranslation(file, "Just plain text");
		}).toThrow("All markdown headings lost during translation");
	});

	test("should pass when heading counts match", () => {
		const file = makeFile("# Title\n\n## Section\n\nContent");
		const translated = "# Título\n\n## Seção\n\nConteúdo";

		expect(() => {
			validation.validateTranslation(file, translated);
		}).not.toThrow();
	});

	test("should pass when original has no headings", () => {
		const file = makeFile("Just a paragraph with no headings.");

		expect(() => {
			validation.validateTranslation(file, "Apenas um parágrafo sem cabeçalhos.");
		}).not.toThrow();
	});

	test("should warn but not throw when fenced blocks remain without a source fence", () => {
		const file = makeFile("Just a paragraph with no headings.");

		expect(() => {
			validation.validateTranslation(file, "Texto\n\n```\nunexpected\n```");
		}).not.toThrow();
	});
});
