import { describe, expect, test } from "bun:test";

import { resolveUpstreamShaVariableName } from "@/ci/lib/upstream-sha-variable";

describe("upstream-sha-variable.util", () => {
	test("resolveUpstreamShaVariableName maps hyphens to underscores", () => {
		expect(resolveUpstreamShaVariableName("pt-br")).toBe("UPSTREAM_SHA_PT_BR");
	});

	test("resolveUpstreamShaVariableName uppercases simple langs", () => {
		expect(resolveUpstreamShaVariableName("ru")).toBe("UPSTREAM_SHA_RU");
	});
});
