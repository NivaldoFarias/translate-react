import { describe, expect, test } from "bun:test";

import {
	extractFirstHeadingSlug,
	extractMarkdownSectionBySlug,
	replaceMarkdownSectionBySlug,
} from "@/app/services/runner/workflow/markdown-section.util";

describe("markdown-section.util", () => {
	const document = `\
# Title

## Intro

### Opting-out of an animation {/*opting-out-of-an-animation*/}
You can use the class "none" to opt-out.

### Next section {/*next*/}
More text.
`;

	test("extracts a section by heading slug", () => {
		const slice = extractMarkdownSectionBySlug(document, "opting-out-of-an-animation");

		expect(slice?.section).toContain("### Opting-out of an animation");
		expect(slice?.section).toContain('class "none"');
		expect(slice?.suffix).toContain("### Next section");
	});

	test("replaces a section by heading slug", () => {
		const updated = replaceMarkdownSectionBySlug(
			document,
			"opting-out-of-an-animation",
			"### Desativando uma animação {/*opting-out-of-an-animation*/}\nNovo texto.\n",
		);

		expect(updated).toContain("### Desativando uma animação");
		expect(updated).toContain("### Next section");
		expect(updated).not.toContain("### Opting-out of an animation");
	});

	test("extracts the first slug from maintainer comment text", () => {
		expect(
			extractFirstHeadingSlug("Na seção `### Opting-out` {/*opting-out-of-an-animation*/}"),
		).toBe("opting-out-of-an-animation");
	});
});
