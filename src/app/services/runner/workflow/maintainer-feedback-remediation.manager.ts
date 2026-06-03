import type {
	TranslationResult,
	TranslatorService,
} from "@/app/services/translator/translator.service";

import { TranslationFile } from "@/app/services/translator/";

import {
	applyMechanicalLineReplacements,
	parseMechanicalLineReplacements,
} from "./maintainer-mechanical-fix.util";
import {
	extractFirstHeadingSlug,
	extractMarkdownSectionBySlug,
	replaceMarkdownSectionBySlug,
} from "./markdown-section.util";

/** How maintainer feedback was applied to the translated file */
export type MaintainerRemediationKind = "mechanical" | "section";

/** Successful targeted remediation without a full-document re-translation */
export interface MaintainerRemediationResult {
	/** Remediation tier that produced the content */
	readonly kind: MaintainerRemediationKind;

	/** Updated translated markdown for the fork branch */
	readonly content: string;

	/** Validation retries from section-scoped LLM, if any */
	readonly retries: TranslationResult["retries"];
}

/**
 * Applies maintainer feedback tiers (mechanical, then section-scoped LLM) before full re-translation.
 */
export class MaintainerFeedbackRemediationManager {
	/**
	 * @param translator Translator used for section-scoped re-translation
	 */
	constructor(private readonly translator: TranslatorService) {}

	/**
	 * Tries mechanical patches, then section-scoped translation using maintainer comments.
	 *
	 * @param forkContent Current translated markdown on the fork branch
	 * @param sourceContent English upstream markdown for section-scoped translation
	 * @param commentBodies Maintainer issue comment bodies after the latest runner commit
	 * @param file Translation file metadata for logging and LLM context
	 *
	 * @returns Remediation outcome, or `undefined` to fall back to full re-translation
	 */
	public async tryRemediate(
		forkContent: string,
		sourceContent: string,
		commentBodies: readonly string[],
		file: TranslationFile,
	): Promise<MaintainerRemediationResult | undefined> {
		const mechanical = this.tryMechanicalRemediation(forkContent, commentBodies);

		if (mechanical) {
			return mechanical;
		}

		return this.trySectionRemediation({ forkContent, sourceContent, commentBodies, file });
	}

	/**
	 * Tries mechanical patches for line-level replacements in maintainer comments.
	 *
	 * @param forkContent Current translated markdown on the fork branch
	 * @param commentBodies Maintainer issue comment bodies after the latest runner commit
	 *
	 * @returns Remediation outcome, or `undefined` when no replacements were applied
	 */
	private tryMechanicalRemediation(
		forkContent: string,
		commentBodies: readonly string[],
	): MaintainerRemediationResult | undefined {
		const replacements = parseMechanicalLineReplacements(commentBodies);
		const { content, appliedCount } = applyMechanicalLineReplacements(forkContent, replacements);

		if (appliedCount === 0) {
			return undefined;
		}

		return { kind: "mechanical", content, retries: [] };
	}

	/**
	 * Tries section-scoped translation using maintainer comments.
	 *
	 * @param params Current translated markdown on the fork branch
	 * @param params.forkContent Current translated markdown on the fork branch
	 * @param params.sourceContent English upstream markdown for section-scoped translation
	 * @param params.commentBodies Maintainer issue comment bodies after the latest runner commit
	 * @param params.file Translation file metadata for logging and LLM context
	 *
	 * @returns Remediation outcome, or `undefined` when no section was found
	 */
	private async trySectionRemediation({
		forkContent,
		sourceContent,
		commentBodies,
		file,
	}: {
		forkContent: string;
		sourceContent: string;
		commentBodies: readonly string[];
		file: TranslationFile;
	}): Promise<MaintainerRemediationResult | undefined> {
		const slug = this.resolveSectionSlug(commentBodies, forkContent);

		if (!slug) {
			return undefined;
		}

		const sourceSection = extractMarkdownSectionBySlug(sourceContent, slug);
		const forkSection = extractMarkdownSectionBySlug(forkContent, slug);

		if (!sourceSection || !forkSection) {
			return undefined;
		}

		const hints = commentBodies.map(
			(body) => `Maintainer review feedback for this section:\n${body.trim()}`,
		);

		const sectionFile = new TranslationFile(
			sourceSection.section,
			file.filename,
			file.path,
			file.sha,
			file.logger,
		);

		const translated = await this.translator.translateContent(sectionFile, {
			validationRetryHints: hints,
		});

		const merged = replaceMarkdownSectionBySlug(forkContent, slug, translated.content);

		if (!merged) {
			return undefined;
		}

		return { kind: "section", content: merged, retries: translated.retries };
	}

	/**
	 * Resolves the slug comment value from the first maintainer comment body that contains a heading.
	 *
	 * @param commentBodies Maintainer issue comment bodies after the latest runner commit
	 * @param forkContent Current translated markdown on the fork branch
	 *
	 * @returns Slug string, or `undefined` when no heading was found
	 */
	private resolveSectionSlug(
		commentBodies: readonly string[],
		forkContent: string,
	): string | undefined {
		for (const body of commentBodies) {
			const slug = extractFirstHeadingSlug(body);

			if (slug && extractMarkdownSectionBySlug(forkContent, slug)) {
				return slug;
			}
		}

		return undefined;
	}
}
