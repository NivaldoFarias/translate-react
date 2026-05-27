import type { UpstreamLocaleConfig } from "./upstream-locale.schema";

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
