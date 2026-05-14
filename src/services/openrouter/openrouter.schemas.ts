import { z } from "zod";

/**
 * `Model.architecture` from OpenRouter’s models list (`GET /v1/models`).
 *
 * @see {@link https://openrouter.ai/docs/api/api-reference/models/get-models|List all models}
 */
export const modelArchitectureSchema = z.looseObject({
	input_modalities: z.array(z.string()),
	modality: z.union([z.string(), z.null()]),
	output_modalities: z.array(z.string()),
	instruct_type: z.union([z.string(), z.null()]),
	tokenizer: z.string(),
});

/** `Model.links` */
export const modelLinksSchema = z.looseObject({
	details: z.string(),
});

/** `DefaultParameters` (nullable on the wire for some models). */
export const defaultParametersSchema = z.looseObject({
	temperature: z.union([z.number(), z.null()]).optional(),
	top_p: z.union([z.number(), z.null()]).optional(),
	top_k: z.union([z.number(), z.null()]).optional(),
	frequency_penalty: z.union([z.number(), z.null()]).optional(),
	presence_penalty: z.union([z.number(), z.null()]).optional(),
	repetition_penalty: z.union([z.number(), z.null()]).optional(),
});

/** `PublicPricing` — `prompt` and `completion` are required; other price fields vary by model. */
export const publicPricingSchema = z.looseObject({
	prompt: z.string(),
	completion: z.string(),
});

/** `PerRequestLimits` when present. */
export const perRequestLimitsSchema = z.looseObject({
	completion_tokens: z.number(),
	prompt_tokens: z.number(),
});

/** `TopProviderInfo` */
export const topProviderInfoSchema = z.looseObject({
	is_moderated: z.boolean(),
	context_length: z.union([z.number(), z.null()]).optional(),
	max_completion_tokens: z.union([z.number(), z.null()]).optional(),
});

/**
 * One `Model` entry from `ModelsListResponse.data` (`GET /v1/models`).
 *
 * Uses `z.looseObject` so OpenRouter can add properties without breaking validation.
 *
 * @see {@link https://openrouter.ai/docs/api/api-reference/models/get-models|List all models}
 */
export const openRouterModelRowSchema = z.looseObject({
	architecture: modelArchitectureSchema,
	canonical_slug: z.string(),
	context_length: z.union([z.number(), z.null()]),
	created: z.number(),
	default_parameters: z.union([defaultParametersSchema, z.null()]),
	description: z.string().optional(),
	expiration_date: z.union([z.string(), z.null()]).optional(),
	hugging_face_id: z.union([z.string(), z.null()]).optional(),
	id: z.string(),
	knowledge_cutoff: z.union([z.string(), z.null()]).optional(),
	links: modelLinksSchema,
	name: z.string(),
	per_request_limits: z.union([perRequestLimitsSchema, z.null()]),
	pricing: publicPricingSchema,
	supported_parameters: z.array(z.string()),
	supported_voices: z.union([z.array(z.string()), z.null()]),
	top_provider: topProviderInfoSchema,
});

/** `ModelsListResponse` */
export const openRouterModelsListSchema = z.object({
	data: z.array(openRouterModelRowSchema),
});

export type OpenRouterModelRow = z.infer<typeof openRouterModelRowSchema>;
