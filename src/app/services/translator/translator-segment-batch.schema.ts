import { z } from "zod";

/** One segment in a batched prose translation LLM request */
export const segmentBatchRequestItemSchema = z.object({
	segmentId: z.string(),
	source: z.string(),
	heading: z.string().optional(),
});

/** User payload for a segment batch translation request */
export const segmentBatchRequestEnvelopeSchema = z.object({
	items: z.array(segmentBatchRequestItemSchema).min(1),
});

/** One translated segment returned by the LLM in structured-output mode */
export const segmentBatchTranslationItemSchema = z.object({
	segmentId: z.string(),
	translated: z.string().min(1),
});

/** Envelope for batched prose segment translations from the LLM */
export const segmentBatchTranslationEnvelopeSchema = z.object({
	items: z.array(segmentBatchTranslationItemSchema).min(1),
});

export type SegmentBatchRequestItem = z.infer<typeof segmentBatchRequestItemSchema>;
export type SegmentBatchRequestEnvelope = z.infer<typeof segmentBatchRequestEnvelopeSchema>;
export type SegmentBatchTranslationItem = z.infer<typeof segmentBatchTranslationItemSchema>;
export type SegmentBatchTranslationEnvelope = z.infer<typeof segmentBatchTranslationEnvelopeSchema>;
