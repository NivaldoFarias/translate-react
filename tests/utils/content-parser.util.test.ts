import { describe, expect, test } from "bun:test";

import { parseContent, reconstructContent } from "@/utils/content-parser.util";

/**
 * Test suite for Content Parser Utility
 * Tests content parsing and reconstruction with code blocks
 */
describe("Content Parser Utility", () => {
	test("should parse content with repeated code blocks", () => {
		const content = `Here's some code:
\`\`\`js
console.log("hello");
\`\`\`
And here's the same code again:
\`\`\`js
console.log("hello");
\`\`\``;

		const parsed = parseContent(content);
		expect(parsed.blocks.size).toBe(1);
		expect(parsed.content).toContain("{{BLOCK_0}}");
		expect(parsed.content.match(/{{BLOCK_0}}/g)).toHaveLength(2);
	});

	test("should handle content without code blocks", () => {
		const content = "Just some plain text\nwithout any code blocks.";
		const parsed = parseContent(content);
		expect(parsed.blocks.size).toBe(0);
		expect(parsed.content).toBe(content);
	});

	test("should handle empty content", () => {
		const parsed = parseContent("");
		expect(parsed.blocks.size).toBe(0);
		expect(parsed.content).toBe("");
	});

	test("should handle different code blocks", () => {
		const content = `\`\`\`js
const a = 1;
\`\`\`

\`\`\`python
x = 1
\`\`\``;

		const parsed = parseContent(content);
		expect(parsed.blocks.size).toBe(2);
		expect(parsed.content).toContain("{{BLOCK_0}}");
		expect(parsed.content).toContain("{{BLOCK_1}}");
	});

	test("should reconstruct content correctly", () => {
		const originalContent = `Here's some code:
\`\`\`js
console.log("hello");
\`\`\`
And here's the same code again:
\`\`\`js
console.log("hello");
\`\`\``;

		const parsed = parseContent(originalContent);
		const reconstructed = reconstructContent(parsed);
		expect(reconstructed).toBe(originalContent);
	});

	test("should handle reconstruction without blocks", () => {
		const content = "Just plain text";
		const parsed = parseContent(content);
		const reconstructed = reconstructContent(parsed);
		expect(reconstructed).toBe(content);
	});
});
