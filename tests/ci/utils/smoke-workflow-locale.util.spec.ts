import { describe, expect, test } from "bun:test";

import { readSmokeWorkflowDispatchLangs } from "@/ci/utils/smoke-workflow-locale.util";

describe("readSmokeWorkflowDispatchLangs", () => {
	test("reads lang choice options from smoke.yml", () => {
		expect(readSmokeWorkflowDispatchLangs()).toEqual(["pt-br", "ru"]);
	});
});
