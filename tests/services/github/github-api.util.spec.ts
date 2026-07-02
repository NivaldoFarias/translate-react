import { RequestError } from "@octokit/request-error";
import { describe, expect, mock, test } from "bun:test";
import { StatusCodes } from "http-status-codes";

import type { Octokit } from "@octokit/rest";

import {
	decodeRepositoryFileContent,
	fetchRepositoryContent,
	fetchRepositoryDefaultBranch,
	isRepositoryContentNotFound,
	readRepositoryFileSha,
} from "@/app/services/github/github-api.util";

function createRequestError(status: number) {
	return new RequestError("API error", status, {
		request: { method: "GET", url: "https://api.github.com/test", headers: {} },
	});
}

describe("github-api.util", () => {
	describe("fetchRepositoryDefaultBranch", () => {
		test("returns default_branch from repos.get", async () => {
			const reposGet = mock(() => Promise.resolve({ data: { default_branch: "develop" } }));
			const octokit = { repos: { get: reposGet } } as unknown as Octokit;

			const branch = await fetchRepositoryDefaultBranch(octokit, {
				owner: "reactjs",
				repo: "pt-br.react.dev",
			});

			expect(branch).toBe("develop");
			expect(reposGet).toHaveBeenCalledWith({ owner: "reactjs", repo: "pt-br.react.dev" });
		});
	});

	describe("fetchRepositoryContent", () => {
		test("passes path and ref to repos.getContent", async () => {
			const getContent = mock(() =>
				Promise.resolve({ data: { content: Buffer.from("hi").toString("base64"), sha: "abc" } }),
			);
			const octokit = { repos: { getContent } } as unknown as Octokit;

			await fetchRepositoryContent(
				octokit,
				{ owner: "fork-owner", repo: "fork-repo" },
				"src/content/page.md",
				"refs/heads/main",
			);

			expect(getContent).toHaveBeenCalledWith({
				owner: "fork-owner",
				repo: "fork-repo",
				path: "src/content/page.md",
				ref: "refs/heads/main",
			});
		});
	});

	describe("isRepositoryContentNotFound", () => {
		test("returns true for 404 RequestError", () => {
			expect(isRepositoryContentNotFound(createRequestError(StatusCodes.NOT_FOUND))).toBe(true);
		});

		test("returns false for other errors", () => {
			expect(
				isRepositoryContentNotFound(createRequestError(StatusCodes.INTERNAL_SERVER_ERROR)),
			).toBe(false);
			expect(isRepositoryContentNotFound(new Error("boom"))).toBe(false);
		});
	});

	describe("decodeRepositoryFileContent", () => {
		test("decodes base64 content", () => {
			expect(
				decodeRepositoryFileContent({
					type: "file",
					encoding: "base64",
					size: 3,
					name: "page.md",
					path: "page.md",
					content: Buffer.from("Olá").toString("base64"),
					sha: "abc",
					url: "https://api.github.com",
					git_url: null,
					html_url: null,
					download_url: null,
					_links: { self: "", git: null, html: null },
				}),
			).toBe("Olá");
		});

		test("returns undefined when content is missing", () => {
			expect(
				decodeRepositoryFileContent({
					type: "symlink",
					target: "other.md",
					size: 0,
					name: "link.md",
					path: "link.md",
					sha: "abc",
					url: "https://api.github.com",
					git_url: null,
					html_url: null,
					download_url: null,
					_links: { self: "", git: null, html: null },
				}),
			).toBeUndefined();
		});
	});

	describe("readRepositoryFileSha", () => {
		test("returns sha for a file payload", () => {
			expect(
				readRepositoryFileSha({
					type: "file",
					encoding: "base64",
					size: 2,
					name: "page.md",
					path: "src/page.md",
					content: "aGk=",
					sha: "blob-sha",
					url: "https://api.github.com",
					git_url: null,
					html_url: null,
					download_url: null,
					_links: { self: "", git: null, html: null },
				}),
			).toBe("blob-sha");
		});

		test("returns undefined for directory listings", () => {
			expect(
				readRepositoryFileSha([
					{
						type: "dir",
						size: 0,
						name: "src",
						path: "src",
						sha: "dir-sha",
						url: "https://api.github.com",
						git_url: null,
						html_url: null,
						download_url: null,
						_links: { self: "", git: null, html: null },
					},
				]),
			).toBeUndefined();
		});
	});
});
