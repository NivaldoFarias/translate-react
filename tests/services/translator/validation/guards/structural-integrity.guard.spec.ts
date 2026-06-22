import { describe, expect, test } from "bun:test";

import { countMarkdownHeadings } from "@/app/services/translator/validation/analyzers/structural-integrity.analyzer";
import {
	headingCountPreservedGuard,
	headingSyntaxGuard,
	mdxSlugPreservedGuard,
} from "@/app/services/translator/validation/guards/structural-integrity.guard";

describe("mdxSlugPreservedGuard", () => {
	test("returns null when slug comments are unchanged", () => {
		const source = "## Step 2 {/*step-2-use-the-context*/}\n\nBody.";
		const translated = "## Passo 2 {/*step-2-use-the-context*/}\n\nCorpo.";

		expect(mdxSlugPreservedGuard(source, translated)).toBeNull();
	});

	test("fails when a slug comment was translated", () => {
		const source = "## Lifecycle {/*the-lifecycle-of-an-effect*/}\n\nBody.";
		const translated = "## Ciclo {/*o-ciclo-de-vida-de-um-efeito*/}\n\nCorpo.";

		expect(mdxSlugPreservedGuard(source, translated)?.guardId).toBe("mdxSlugPreserved");
	});

	test("returns null when multiple slug comments are all preserved", () => {
		const source = "## One {/*one*/}\n\n## Two {/*two*/}\n\n## Three {/*three*/}\n\nBody.";
		const translated = "## Um {/*one*/}\n\n## Dois {/*two*/}\n\n## Três {/*three*/}\n\nCorpo.";

		expect(mdxSlugPreservedGuard(source, translated)).toBeNull();
	});
});

describe("headingCountPreservedGuard", () => {
	test("returns null when heading counts match", () => {
		const source = "## One\n\n## Two\n\nBody.";
		const translated = "## Um\n\n## Dois\n\nCorpo.";

		expect(headingCountPreservedGuard(source, translated)).toBeNull();
	});

	test("fails when headings were removed", () => {
		const source = "## One\n\n## Two\n\nBody.";
		const translated = "## Um\n\nCorpo.";

		expect(headingCountPreservedGuard(source, translated)?.guardId).toBe("headingCountPreserved");
	});

	test("fails when headings were added", () => {
		const source = "## One\n\nBody.";
		const translated = "## Um\n\n## Extra\n\nCorpo.";

		expect(headingCountPreservedGuard(source, translated)?.guardId).toBe("headingCountPreserved");
	});

	test("returns null for documents with no headings", () => {
		expect(headingCountPreservedGuard("Body only.", "Só corpo.")).toBeNull();
	});
});

describe("countMarkdownHeadings", () => {
	test("counts headings inside fenced markdown examples", () => {
		const markdown = "# Title\n\n```md\n## Example inside fence\n```\n";

		expect(countMarkdownHeadings(markdown)).toBe(2);
	});
});

describe("headingSyntaxGuard", () => {
	test("returns null for valid heading syntax", () => {
		const source = "## Title\n\nBody.";
		const translated = "## Título\n\nCorpo.";

		expect(headingSyntaxGuard(source, translated)).toBeNull();
	});

	test("fails on duplicated heading markers", () => {
		const source = "## Title\n\nBody.";
		const translated = "## ## Título\n\nCorpo.";

		expect(headingSyntaxGuard(source, translated)?.guardId).toBe("headingSyntax");
	});

	test("fails on triple duplicated heading markers", () => {
		const translated = "### ### ### Título\n\nCorpo.";

		expect(headingSyntaxGuard("### Title", translated)?.guardId).toBe("headingSyntax");
	});
});
