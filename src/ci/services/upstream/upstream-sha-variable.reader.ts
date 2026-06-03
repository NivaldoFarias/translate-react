import { RequestError } from "@octokit/request-error";

import type { Octokit } from "@octokit/rest";
import type { Logger } from "pino";

import { resolveUpstreamShaVariableName } from "@/ci/services/upstream/upstream-sha-variable.util";

/** Repository coordinates for Actions variable API calls. */
export interface UpstreamShaVariableRepository {
	owner: string;
	repo: string;
}

/**
 * Reads stored upstream SHAs from repository Actions variables.
 */
export class UpstreamShaVariableReader {
	public constructor(
		private readonly octokit: Octokit,
		private readonly repository: UpstreamShaVariableRepository,
		private readonly logger: Logger,
	) {}

	/**
	 * Returns the stored SHA for a locale, or `undefined` when the variable is unset.
	 *
	 * @param lang Locale id (e.g. `pt-br`)
	 *
	 * @returns Stored upstream SHA, or `undefined` when the Actions variable is unset
	 *
	 * @example
	 * ```typescript
	 * const stored = await reader.readStoredSha("pt-br");
	 * ```
	 */
	public async readStoredSha(lang: string) {
		const variableName = resolveUpstreamShaVariableName(lang);

		this.logger.debug(
			{
				lang,
				variableName,
				repository: `${this.repository.owner}/${this.repository.repo}`,
			},
			"Reading stored upstream SHA variable",
		);

		try {
			const response = await this.octokit.rest.actions.getRepoVariable({
				owner: this.repository.owner,
				repo: this.repository.repo,
				name: variableName,
			});

			this.logger.debug(
				{ lang, variableName, hasValue: Boolean(response.data.value) },
				"Stored upstream SHA variable loaded",
			);

			return response.data.value;
		} catch (error) {
			const isNotFound = error instanceof RequestError && error.status === 404;

			if (isNotFound) {
				this.logger.debug({ lang, variableName }, "Stored upstream SHA variable not set");

				return undefined;
			}

			throw error;
		}
	}
}
