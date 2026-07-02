import type { Octokit } from "@octokit/rest";
import type { Logger } from "pino";

import type { TranslationMatrixEntry, UpstreamLocaleConfig } from "@/ci/services/upstream/types";

import { UpstreamHeadShaService } from "./upstream-head-sha.service";
import { resolveForkOwner } from "./upstream-locales.util";

/**
 * Builds a full translation matrix (manual runs) with current upstream SHAs for each locale.
 */
export class TranslationMatrixBuilder {
	private readonly headShaService: UpstreamHeadShaService;

	public constructor(
		octokit: Octokit,
		private readonly logger: Logger,
	) {
		this.headShaService = new UpstreamHeadShaService(octokit, logger);
	}

	/**
	 * Resolves matrix rows for every locale in `locales`, fetching each upstream default-branch tip.
	 *
	 * @param locales Filtered rows from `.github/locales.json`
	 * @param forkOwner GitHub owner for locale forks
	 *
	 * @returns Matrix rows including current `upstream_sha` per locale
	 *
	 * @example
	 * ```typescript
	 * const matrix = await builder.build(locales, "my-fork-owner");
	 * ```
	 */
	public async build(locales: UpstreamLocaleConfig[], forkOwner: string) {
		const matrix: TranslationMatrixEntry[] = [];

		this.logger.debug({ localeCount: locales.length, forkOwner }, "Building translation matrix");

		for (const locale of locales) {
			this.logger.debug({ lang: locale.lang }, "Resolving matrix row");

			const upstreamSha = await this.headShaService.fetchDefaultBranchHeadSha(locale);

			matrix.push({
				...locale,
				fork_owner: resolveForkOwner(locale, forkOwner),
				upstream_sha: upstreamSha,
			});

			this.logger.debug({ lang: locale.lang, upstreamSha }, "Matrix row resolved");
		}

		this.logger.debug(
			{ langs: matrix.map((row) => row.lang) },
			"Translation matrix build complete",
		);

		return matrix;
	}
}
