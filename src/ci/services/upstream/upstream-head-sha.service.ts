import type { Octokit } from "@octokit/rest";
import type { Logger } from "pino";

import type { UpstreamLocaleConfig } from "@/ci/services/upstream/types";

/**
 * Resolves the latest commit SHA on an upstream repository default branch.
 */
export class UpstreamHeadShaService {
	public constructor(
		private readonly octokit: Octokit,
		private readonly logger: Logger,
	) {}

	/**
	 * Fetches the tip commit SHA for the upstream repository default branch.
	 *
	 * @param locale Upstream coordinates from `.github/locales.json`
	 *
	 * @returns Full commit SHA for the default branch head
	 *
	 * @example
	 * ```typescript
	 * const sha = await service.fetchDefaultBranchHeadSha({
	 *   lang: "pt-br",
	 *   upstream_owner: "reactjs",
	 *   upstream_name: "pt-br.react.dev",
	 *   fork_name: "pt-br.react.dev",
	 *   translation_guidelines_file: "GLOSSARY.md",
	 * });
	 * ```
	 */
	public async fetchDefaultBranchHeadSha(locale: UpstreamLocaleConfig) {
		this.logger.debug(
			{
				lang: locale.lang,
				upstream: `${locale.upstream_owner}/${locale.upstream_name}`,
			},
			"Fetching upstream repository metadata",
		);

		const repository = await this.octokit.rest.repos.get({
			owner: locale.upstream_owner,
			repo: locale.upstream_name,
		});
		const defaultBranch = repository.data.default_branch;

		this.logger.debug(
			{
				lang: locale.lang,
				defaultBranch,
			},
			"Listing latest commit on upstream default branch",
		);

		const commits = await this.octokit.rest.repos.listCommits({
			owner: locale.upstream_owner,
			repo: locale.upstream_name,
			sha: defaultBranch,
			per_page: 1,
		});
		const headSha = commits.data[0]?.sha;

		if (!headSha) {
			throw new Error(
				`No commits on ${locale.upstream_owner}/${locale.upstream_name}@${defaultBranch}`,
			);
		}

		this.logger.debug(
			{
				lang: locale.lang,
				defaultBranch,
				headSha,
			},
			"Resolved upstream default-branch head",
		);

		return headSha;
	}
}
