import path from "node:path";

import Bun from "bun";
import { z } from "zod";

void main();

async function main() {
	try {
		const data = await parseTranslationChecklist(path.join(import.meta.dir, "input.txt"));

		const outputFile = Bun.file("output.json");
		await outputFile.write(JSON.stringify(data, null, 2));
	} catch (error) {
		console.error("Error analyzing translations:", error);
		process.exit(1);
	}
}

const translationStatusSchema = z.object({
	title: z.string(),
	status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
	assignee: z.string().optional(),
	section: z.string(),
	subsection: z.string().optional(),
});

export type TranslationStatus = z.infer<typeof translationStatusSchema>;

export interface TranslationSection {
	name: string;
	subsections: { [key: string]: TranslationStatus[] };
	items: TranslationStatus[];
}

export interface TranslationData {
	sections: { [key: string]: TranslationSection };
}

function parseTranslationLine(
	line: string,
	section: string,
	subsection?: string,
): TranslationStatus | null {
	// Skip empty lines, headings, or invalid lines
	if (
		!line.trim() ||
		line.startsWith("#") ||
		line === section ||
		(subsection && line === subsection)
	) {
		return null;
	}

	// Extract assignee if present
	const mentionMatch = line.match(/\(@([^)]+)\)/);
	const assignee = mentionMatch ? mentionMatch[1] : undefined;

	// Clean the title (remove the mention part)
	const title = line.replace(/\s*\(@[^)]+\)/, "").trim();

	if (!title) return null;

	return {
		title,
		status: assignee ? "IN_PROGRESS" : "PENDING",
		section,
		subsection,
		...(assignee && { assignee }),
	};
}

function extractSections(content: string): TranslationData {
	const lines = content.split("\n");
	const sections: { [key: string]: TranslationSection } = {};

	let currentSection = "";
	let currentSubsection: string | undefined;

	for (const line of lines) {
		const trimmedLine = line.trim();

		// Skip empty lines
		if (!trimmedLine) continue;

		// Handle section headers
		if (trimmedLine.startsWith("## ")) {
			currentSection = trimmedLine.substring(3);
			currentSubsection = undefined;
			if (!sections[currentSection]) {
				sections[currentSection] = {
					name: currentSection,
					subsections: {},
					items: [],
				};
			}
			continue;
		}

		// Handle subsection headers (if line ends with ':')
		if (trimmedLine.endsWith(":")) {
			currentSubsection = trimmedLine.slice(0, -1);
			if (!sections[currentSection].subsections[currentSubsection]) {
				sections[currentSection].subsections[currentSubsection] = [];
			}
			continue;
		}

		// Parse translation items
		const item = parseTranslationLine(trimmedLine, currentSection, currentSubsection);
		if (item) {
			if (currentSubsection) {
				sections[currentSection].subsections[currentSubsection].push(item);
			} else {
				sections[currentSection].items.push(item);
			}
		}
	}

	return { sections };
}

// Parser function to extract translation status from the checklist
async function parseTranslationChecklist(filePath: string): Promise<TranslationData> {
	const file = Bun.file(filePath);
	const content = await file.text();
	return extractSections(content);
}
