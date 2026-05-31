import { z } from "zod";

/**
 * Keys allowed in YAML frontmatter batch translation requests and responses.
 *
 * Matches {@link TranslatorService}'s dedicated metadata pass for the `description` scalar only.
 */
export const frontmatterBatchFieldKeySchema = z.enum(["description"]);

/**
 * One translated frontmatter field returned by the LLM in structured-output mode.
 */
export const frontmatterBatchTranslationItemSchema = z.object({
	fieldKey: frontmatterBatchFieldKeySchema,
	translated: z.string(),
});

/**
 * Envelope for batched frontmatter metadata translations from the LLM.
 *
 * Used with OpenAI/OpenRouter `json_schema` structured outputs so every scalar is
 * translated in one completion with a validated shape.
 */
export const frontmatterBatchTranslationEnvelopeSchema = z.object({
	items: z.array(frontmatterBatchTranslationItemSchema).length(1),
});

/**
 * User payload shape for the frontmatter batch translation request (JSON in the user message).
 */
export const frontmatterBatchRequestEnvelopeSchema = z.object({
	items: z
		.array(
			z.object({
				fieldKey: frontmatterBatchFieldKeySchema,
				source: z.string(),
			}),
		)
		.length(1),
});

export type FrontmatterBatchFieldKey = z.infer<typeof frontmatterBatchFieldKeySchema>;
export type FrontmatterBatchTranslationEnvelope = z.infer<
	typeof frontmatterBatchTranslationEnvelopeSchema
>;
export type FrontmatterBatchRequestEnvelope = z.infer<typeof frontmatterBatchRequestEnvelopeSchema>;
