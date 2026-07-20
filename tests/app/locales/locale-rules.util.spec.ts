import { describe, expect, test } from "bun:test";

import {
	buildLocaleRulesPrompt,
	formatLocalePromptRuleSection,
	segmentBatchContextSection,
} from "@/app/locales/rules.util";

describe("formatLocalePromptRuleSection", () => {
	test("serializes bullets without a heading", () => {
		expect(
			formatLocalePromptRuleSection({
				bullets: ["first rule", "second rule"],
			}),
		).toBe("- first rule\n- second rule");
	});

	test("serializes a heading and bullets", () => {
		expect(
			formatLocalePromptRuleSection({
				heading: "SEMANTIC TRANSLATION",
				bullets: ["avoid calques"],
			}),
		).toBe("# SEMANTIC TRANSLATION\n- avoid calques");
	});
});

describe("buildLocaleRulesPrompt", () => {
	test("joins the title and ordered sections", () => {
		const prompt = buildLocaleRulesPrompt("RUSSIAN SPECIFIC RULES", [
			segmentBatchContextSection,
			{
				bullets: ["Use formal вы"],
			},
		]);

		expect(prompt).toContain("# RUSSIAN SPECIFIC RULES");
		expect(prompt).toContain("# SEGMENT BATCH CONTEXT");
		expect(prompt).toContain("- Use formal вы");
	});
});
