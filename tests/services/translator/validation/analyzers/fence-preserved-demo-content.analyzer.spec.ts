import { describe, expect, test } from "bun:test";

import {
	collectPreservedDemoSnippets,
	findFencePreservedDemoContentMismatches,
	findFenceReactCommentTermMismatches,
	isPreservedDemoSnippet,
} from "@/app/services/translator/validation/analyzers/fence-preserved-demo-content.analyzer";

describe("fence-preserved-demo-content.analyzer", () => {
	test("isPreservedDemoSnippet accepts UI labels and rejects identifiers", () => {
		expect(isPreservedDemoSnippet("Created at:")).toBe(true);
		expect(isPreservedDemoSnippet("Create React App is Deprecated")).toBe(true);
		expect(isPreservedDemoSnippet("useState")).toBe(false);
		expect(isPreservedDemoSnippet("ProductCard")).toBe(false);
	});

	test("collectPreservedDemoSnippets gathers quoted literals and JSX text", () => {
		const fence = `
return (
  <div>
    <h1>Create React App is Deprecated</h1>
    <p>Created at: {createdAt}</p>
  </div>
);
`;

		const snippets = collectPreservedDemoSnippets(fence);

		expect(snippets).toContain("Create React App is Deprecated");
	});

	test("findFencePreservedDemoContentMismatches detects translated JSX heading (pt-br #1186)", () => {
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

		const mismatches = findFencePreservedDemoContentMismatches(source, translated);

		expect(mismatches.length).toBeGreaterThan(0);
		expect(mismatches[0]?.sourceSnippet).toBe("Create React App is Deprecated");
	});

	test("findFencePreservedDemoContentMismatches detects translated UI string (pt-br #1215)", () => {
		const source = `
\`\`\`js
function Row({ createdAt }) {
  return <label aria-label="Created at:">Created at: {createdAt}</label>;
}
\`\`\`
`;

		const translated = `
\`\`\`js
function Row({ createdAt }) {
  return <label aria-label="Criado em:">Criado em: {createdAt}</label>;
}
\`\`\`
`;

		const mismatches = findFencePreservedDemoContentMismatches(source, translated);

		expect(
			mismatches.some(
				(mismatch) => mismatch.fenceIndex === 1 && mismatch.sourceSnippet === "Created at:",
			),
		).toBe(true);
	});

	test("findFencePreservedDemoContentMismatches passes when demo strings are preserved", () => {
		const source = `
\`\`\`js
<button>Submit form</button>
\`\`\`
`;

		const translated = `
\`\`\`js
<button>Submit form</button>
\`\`\`
`;

		expect(findFencePreservedDemoContentMismatches(source, translated)).toEqual([]);
	});

	test("findFenceReactCommentTermMismatches detects translated state in comment (pt-br #1218)", () => {
		const source = `
\`\`\`js
// You can read state from a ref during render
const ref = useRef(null);
\`\`\`
`;

		const translated = `
\`\`\`js
// Você pode ler o estado de uma ref durante a renderização
const ref = useRef(null);
\`\`\`
`;

		const mismatches = findFenceReactCommentTermMismatches(source, translated);

		expect(
			mismatches.some(
				(mismatch) => mismatch.fenceIndex === 1 && mismatch.sourceSnippet === "state",
			),
		).toBe(true);
	});
});
