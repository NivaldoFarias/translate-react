import { describe, expect, test } from "bun:test";

import { frontmatterPreservedGuard } from "@/app/services/translator/validation/guards/frontmatter-preserved.guard";

describe("frontmatterPreservedGuard", () => {
	test("returns null when the source has no YAML frontmatter", () => {
		const source = "# Title\n\nBody";
		const translated = "---\nunexpected: true\n---\n\n# Título";

		expect(frontmatterPreservedGuard(source, translated)).toBeNull();
	});

	test("returns null when frontmatter delimiters remain after translation", () => {
		const source = `---
title: Example
description: Original
---

# Title
`;
		const translated = `---
title: Example
description: Traduzido
---

# Título
`;

		expect(frontmatterPreservedGuard(source, translated)).toBeNull();
	});

	test("fails when frontmatter block was removed entirely", () => {
		const source = `---
title: Example
---

# Title
`;
		const translated = "# Título\n\nSem frontmatter.\n";

		const issue = frontmatterPreservedGuard(source, translated);

		expect(issue?.guardId).toBe("frontmatterPreserved");
		expect(issue?.message).toContain("Frontmatter lost");
		expect(issue?.retryHint).toContain("YAML frontmatter");
	});
});
