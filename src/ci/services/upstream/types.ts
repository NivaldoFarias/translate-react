import { z } from "zod";

/** Zod schema for one row in `.github/upstream-locales.json`. */
export const upstreamLocaleConfigSchema = z.object({
	lang: z.string().min(1),
	upstream_owner: z.string().min(1),
	upstream_name: z.string().min(1),
	fork_name: z.string().min(1),
	translation_guidelines_file: z.string().min(1),
});

/** Validated locale row from `.github/upstream-locales.json`. */
export type UpstreamLocaleConfig = z.infer<typeof upstreamLocaleConfigSchema>;

/** Full list of configured upstream locales. */
export const upstreamLocalesFileSchema = z.array(upstreamLocaleConfigSchema).min(1);

/** One GitHub Actions matrix row for the translation workflow job. */
export interface TranslationMatrixEntry extends UpstreamLocaleConfig {
	fork_owner: string;
	upstream_sha: string;
}

/** Result of comparing upstream default-branch tips to stored repository variables. */
export interface UpstreamPollResult {
	hasChanges: boolean;
	matrix: TranslationMatrixEntry[];
}
