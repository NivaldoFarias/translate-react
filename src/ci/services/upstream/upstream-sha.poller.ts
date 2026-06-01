import type { Octokit } from "@octokit/rest";
import type { Logger } from "pino";

import type {
	TranslationMatrixEntry,
	UpstreamLocaleConfig,
	UpstreamPollResult,
} from "@/ci/services/upstream/types";

import type { UpstreamShaVariableReader } from "./upstream-sha-variable.reader";

import { UpstreamHeadShaService } from "./upstream-head-sha.service";

/**
 * Compares upstream default-branch tips to stored repository variables and builds a translation matrix.
 */
export class UpstreamShaPoller {
	private readonly headShaService: UpstreamHeadShaService;

	public constructor(
		octokit: Octokit,
		private readonly variableReader: UpstreamShaVariableReader,
		private readonly logger: Logger,
	) {
		this.headShaService = new UpstreamHeadShaService(octokit, logger);
	}

	/**
	 * Returns matrix rows only for locales whose upstream default-branch tip changed.
	 *
	 * @param locales Rows from `.github/locales.json`
	 * @param forkOwner GitHub owner for locale forks (typically `GITHUB_REPOSITORY_OWNER`)
	 *
	 * @returns Locales that need translation and whether any changes were detected
	 *
	 * @example
	 * ```typescript
	 * const result = await poller.poll(locales, "my-fork-owner");
	 * console.log(result.hasChanges);
	 * ```
	 */
	public async poll(locales: UpstreamLocaleConfig[], forkOwner: string) {
		const matrix: TranslationMatrixEntry[] = [];

		this.logger.debug({ localeCount: locales.length, forkOwner }, "Starting upstream SHA poll");

		for (const locale of locales) {
			this.logger.debug({ lang: locale.lang }, "Polling locale");

			const currentSha = await this.headShaService.fetchDefaultBranchHeadSha(locale);
			const storedSha = await this.variableReader.readStoredSha(locale.lang);
			const hasChanged = storedSha === undefined || storedSha !== currentSha;

			this.logger.debug(
				{
					lang: locale.lang,
					currentSha,
					storedSha: storedSha ?? null,
					hasChanged,
				},
				"Compared upstream SHA to stored variable",
			);

			if (hasChanged) {
				matrix.push({
					...locale,
					fork_owner: forkOwner,
					upstream_sha: currentSha,
				});
			}
		}

		const result = {
			hasChanges: matrix.length > 0,
			matrix,
		} satisfies UpstreamPollResult;

		this.logger.debug(
			{
				hasChanges: result.hasChanges,
				changedLangs: result.matrix.map((row) => row.lang),
			},
			"Upstream SHA poll complete",
		);

		return result;
	}
}
