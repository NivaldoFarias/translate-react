import { z } from "zod";

/** Zod schema for one row in `.github/locales.json`. */
export const upstreamLocaleConfigSchema = z.object({
	lang: z.string().min(1),
	upstream_owner: z.string().min(1),
	upstream_name: z.string().min(1),
	fork_name: z.string().min(1),
	translation_guidelines_file: z.string().min(1),
	fork_owner: z.string().min(1).optional(),
});

/** Validated locale row from `.github/locales.json`. */
export type UpstreamLocaleConfig = z.infer<typeof upstreamLocaleConfigSchema>;

/** Full list of configured upstream locales. */
export const upstreamLocalesFileSchema = z.array(upstreamLocaleConfigSchema).min(1);

/** One GitHub Actions matrix row for the translation workflow job. */
export interface TranslationMatrixEntry extends UpstreamLocaleConfig {
	/** Resolved fork owner for this locale row */
	fork_owner: string;

	/** Stored upstream default-branch SHA for change detection */
	upstream_sha: string;
}

/** Result of comparing upstream default-branch tips to stored repository variables. */
export interface UpstreamPollResult {
	/** Whether any locale upstream tip differs from its stored SHA */
	hasChanges: boolean;

	/** Matrix rows to dispatch when {@link UpstreamPollResult.hasChanges} is true */
	matrix: TranslationMatrixEntry[];
}
