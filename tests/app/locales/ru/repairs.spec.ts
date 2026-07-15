import { describe, expect, test } from "bun:test";

import {
	applyCuratedRuYoSpellings,
	applyRuLocaleMechanicalRepairs,
	collapseDuplicatedRuUseClientLeadIn,
	repairCorruptedRuOutputEmphasis,
	replaceEnglishServerClientComponentTerms,
	replaceKnownRuCalquePhrases,
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

describe("replaceKnownRuCalquePhrases", () => {
	test("repairs RichTextEditor dependency phrasing from maintainer feedback", () => {
		const input =
			"В качестве зависимостей `RichTextEditor`, `formatDate` и `Button` также будут выполняться на клиенте.";

		expect(replaceKnownRuCalquePhrases(input)).toBe(
			"Будучи зависимостями `RichTextEditor`, `formatDate` и `Button` также будут выполняться на клиенте.",
		);
	});

	test("localizes guillemet-wrapped component term", () => {
		expect(replaceKnownRuCalquePhrases("термин «component» не очень точен")).toBe(
			"термин «компонент» не очень точен",
		);
	});

	test("skips fenced code blocks", () => {
		const input =
			"```js\nconst Server Component = 1;\n```\nимпортированный из помеченного клиента кода";

		expect(replaceKnownRuCalquePhrases(input)).toBe(
			"```js\nconst Server Component = 1;\n```\nиз кода, помеченного как клиентский",
		);
	});
});

describe("replaceEnglishServerClientComponentTerms", () => {
	test("rewrites English Server/Client Component terms in prose", () => {
		const input =
			"импортируется из Server Component, а `App` считаются Server Components и Client Components.";

		expect(replaceEnglishServerClientComponentTerms(input)).toBe(
			"импортируется из серверного компонента, а `App` считаются серверными компонентами и клиентскими компонентами.",
		);
	});

	test("preserves inline code spans", () => {
		const input = "используйте `Server Component` в коде, но Server Component в prose.";

		expect(replaceEnglishServerClientComponentTerms(input)).toBe(
			"используйте `Server Component` в коде, но серверный компонент в prose.",
		);
	});
});

describe("applyCuratedRuYoSpellings", () => {
	test("restores reviewer-cited ё forms outside code", () => {
		const input = "желтый фон, объем текста и начнет рендер";

		expect(applyCuratedRuYoSpellings(input)).toBe("жёлтый фон, объём текста и начнёт рендер");
	});

	test("skips inline code", () => {
		const input = "`желтый` желтый";

		expect(applyCuratedRuYoSpellings(input)).toBe("`желтый` жёлтый");
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

	test("repairs use-client.md regressions from run 29429673894", () => {
		const input = [
			"В качестве зависимостей `RichTextEditor`, `formatDate` и `Button` также будут выполняться на клиенте.",
			"импортируется из Server Component, считаются Server Components.",
			"желтый фон в alt text",
		].join("\n");

		expect(applyRuLocaleMechanicalRepairs(input)).toBe(
			[
				"Будучи зависимостями `RichTextEditor`, `formatDate` и `Button` также будут выполняться на клиенте.",
				"импортируется из серверного компонента, считаются серверными компонентами.",
				"жёлтый фон в alt text",
			].join("\n"),
		);
	});
});
