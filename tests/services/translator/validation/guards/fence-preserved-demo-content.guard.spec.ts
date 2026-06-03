import { describe, expect, test } from "bun:test";

import { fencePreservedDemoContentGuard } from "@/app/services/translator/validation/guards/fence-preserved-demo-content.guard";

describe("fencePreservedDemoContentGuard", () => {
	test("returns retryable issue when JSX demo text was translated", () => {
		const source = `
\`\`\`jsx
<h1>Create React App is Deprecated</h1>
\`\`\`
`;

		const translated = `
\`\`\`jsx
<h1>O Create React App foi descontinuado</h1>
\`\`\`
`;

		const issue = fencePreservedDemoContentGuard(source, translated);

		expect(issue).not.toBeNull();
		expect(issue?.guardId).toBe("fencePreservedDemoContent");
		expect(issue?.retryHint).toContain("demo UI strings");
	});
});
