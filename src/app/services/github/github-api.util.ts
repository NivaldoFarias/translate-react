import { Buffer } from "node:buffer";

import { RequestError } from "@octokit/request-error";

import type { Octokit, RestEndpointMethodTypes } from "@octokit/rest";

import type { RepositoryMetadata } from "./types";

/** `repos.getContent` response `data` payload */
type RepositoryContentData = RestEndpointMethodTypes["repos"]["getContent"]["response"]["data"];

/**
 * Fetches the default branch name for a repository.
 *
 * @param octokit Authenticated Octokit client
 * @param repository Owner and repo slug
 *
 * @returns Default branch name (for example `main`)
 */
export async function fetchRepositoryDefaultBranch(
	octokit: Octokit,
	repository: RepositoryMetadata,
) {
	const response = await octokit.repos.get(repository);

	return response.data.default_branch;
}

/**
 * Fetches repository content metadata for a path via `repos.getContent`.
 *
 * @param octokit Authenticated Octokit client
 * @param repository Owner and repo slug
 * @param path Repository-relative file or directory path
 * @param ref Optional branch or ref (defaults to the repository default branch)
 *
 * @returns Octokit `getContent` response
 */
export async function fetchRepositoryContent(
	octokit: Octokit,
	repository: RepositoryMetadata,
	path: string,
	ref?: string,
) {
	return octokit.repos.getContent({
		...repository,
		path,
		...(ref !== undefined ? { ref } : {}),
	});
}

/**
 * Returns whether a `repos.getContent` error indicates the path is missing.
 *
 * @param error Caught rejection from {@link fetchRepositoryContent}
 *
 * @returns `true` when GitHub responded with HTTP 404
 */
export function isRepositoryContentNotFound(error: unknown) {
	return error instanceof RequestError && error.status === 404;
}

/**
 * Decodes base64 file body from a `repos.getContent` file payload.
 *
 * @param data File item from `repos.getContent`
 *
 * @returns UTF-8 file body, or `undefined` when `content` is absent
 */
export function decodeRepositoryFileContent(data: RepositoryContentData) {
	if (Array.isArray(data) || !("content" in data) || !data.content) {
		return undefined;
	}

	return Buffer.from(data.content, "base64").toString();
}

/**
 * Returns the blob `sha` when `getContent` resolved to a single file.
 *
 * @param data `repos.getContent` response data
 *
 * @returns File blob `sha`, or `undefined` for directories and unexpected shapes
 */
export function readRepositoryFileSha(data: RepositoryContentData) {
	if (Array.isArray(data)) {
		return undefined;
	}

	if ("sha" in data) {
		return data.sha;
	}

	return undefined;
}
