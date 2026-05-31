import { describe, expect, test } from "bun:test";

import {
	collectFunctionDeclarationNames,
	findFenceFunctionIdentifierMismatches,
} from "@/app/services/translator/validation/analyzers/fence-code-identifier.analyzer";

describe("fence-code-identifier.analyzer", () => {
	test("collectFunctionDeclarationNames returns unique names in order", () => {
		const code = `
function Alpha() {}
function Beta() {}
function Alpha() {}
`;

		expect(collectFunctionDeclarationNames(code)).toEqual(["Alpha", "Beta"]);
	});

	test("findFenceFunctionIdentifierMismatches detects renamed function in a fence", () => {
		const source = `
## Example

\`\`\`js
function OptimizedList() {
  "use memo";
}
\`\`\`
`;

		const translated = `
## Exemplo

\`\`\`js
function ListaOtimizada() {
  "use memo";
}
\`\`\`
`;

		const mismatches = findFenceFunctionIdentifierMismatches(source, translated);

		expect(mismatches).toEqual([{ fenceIndex: 1, sourceName: "OptimizedList" }]);
	});

	test("findFenceFunctionIdentifierMismatches passes when function names are preserved", () => {
		const source = `
\`\`\`js
function ProductCard({ product }) {}
\`\`\`
`;

		const translated = `
\`\`\`js
function ProductCard({ product }) {}
\`\`\`
`;

		expect(findFenceFunctionIdentifierMismatches(source, translated)).toEqual([]);
	});
});
