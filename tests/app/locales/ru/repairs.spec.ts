import { describe, expect, test } from "bun:test";

import {
	applyRuLocaleMechanicalRepairs,
	collapseDuplicatedRuUseClientLeadIn,
	repairCorruptedRuOutputEmphasis,
} from "@/app/locales/ru/repairs";

describe("collapseDuplicatedRuUseClientLeadIn", () => {
	test("collapses duplicated Russian lead-in before a comma", () => {
		const input = "С помощью `'use client'` С помощью , вы можете определить";

		expect(collapseDuplicatedRuUseClientLeadIn(input)).toBe(
			"С помощью `'use client'`, вы можете определить",
		);
	});
});

describe("repairCorruptedRuOutputEmphasis", () => {
	test("restores dropped HTML output emphasis after a component reference", () => {
		const input = "в результате чего `FancyText` вывод _ (а не его исходный код) будет отправлен";

		expect(repairCorruptedRuOutputEmphasis(input)).toBe(
			"в результате чего `FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен",
		);
	});

	test("removes duplicated corrupted output clause tails", () => {
		const input =
			"`FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, _ , а не его исходный код), будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется";

		expect(repairCorruptedRuOutputEmphasis(input)).toBe(
			"`FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется",
		);
	});
});

describe("applyRuLocaleMechanicalRepairs", () => {
	test("repairs smoke-style Russian regressions from run 29363105829", () => {
		const input = [
			"С помощью `'use client'` С помощью , вы можете определить",
			"в результате чего `FancyText` вывод _ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, _ , а не его исходный код), будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется",
		].join("\n");

		expect(applyRuLocaleMechanicalRepairs(input)).toBe(
			[
				"С помощью `'use client'`, вы можете определить",
				"в результате чего `FancyText` HTML- _вывод_ (а не его исходный код) будет отправлен в браузер при обращении из серверного компонента. Как показано в предыдущем примере приложения Inspirations, `FancyText` используется",
			].join("\n"),
		);
	});
});
