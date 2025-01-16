import { parseTranslationChecklist } from "../data/translation-status";

async function main() {
	try {
		const data = await parseTranslationChecklist("pending-translation.txt");
		console.log(JSON.stringify(data, null, 2));
	} catch (error) {
		console.error("Error analyzing translations:", error);
		process.exit(1);
	}
}

main();
