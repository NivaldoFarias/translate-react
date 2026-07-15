import { describe, expect, test } from "bun:test";

import { loadUpstreamLocales } from "@/ci/services/upstream/upstream-locales.util";
import { readSmokeWorkflowDispatchLangs } from "@/ci/utils/smoke-workflow-locale.util";

describe("smoke workflow locale parity", () => {
	test("smoke.yml lang choices match .github/locales.json", () => {
		const registryLangs = loadUpstreamLocales()
			.map((row) => row.lang)
			.sort();
		const dispatchLangs = readSmokeWorkflowDispatchLangs().sort();

		expect(dispatchLangs).toEqual(registryLangs);
	});
});
