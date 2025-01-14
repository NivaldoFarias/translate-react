import { expect, test, describe, mock, beforeEach } from "bun:test";
import { GitHubService } from "../services/github";
import { TranslationFile } from "../types";
import { Octokit } from "@octokit/rest";

describe("GitHubService", () => {
  let github: GitHubService;
  let mockOctokit: any;

  beforeEach(() => {
    // Mock Octokit
    mockOctokit = {
      rest: {
        git: {
          getTree: mock(() => Promise.resolve({
            data: {
              tree: [
                { path: "src/test.md", sha: "123" },
                { path: "src/translated.md", sha: "456" }
              ]
            }
          })),
          getRef: mock(() => Promise.resolve({
            data: { object: { sha: "main-sha" } }
          })),
          createRef: mock(() => Promise.resolve()),
          createBlob: mock(() => Promise.resolve({ data: { sha: "blob-sha" } })),
          createTree: mock(() => Promise.resolve({ data: { sha: "tree-sha" } })),
          createCommit: mock(() => Promise.resolve({ data: { sha: "commit-sha" } })),
          updateRef: mock(() => Promise.resolve())
        },
        repos: {
          getContent: mock(() => Promise.resolve({
            data: { content: Buffer.from("test content").toString("base64") }
          }))
        }
      }
    };

    // @ts-ignore - Mock implementation
    mock.module("@octokit/rest", () => ({
      Octokit: mock(() => mockOctokit)
    }));

    github = new GitHubService();
  });

  // Edge Cases
  test("should handle non-existent files", async () => {
    mockOctokit.rest.repos.getContent = mock(() =>
      Promise.reject(new Error("Not found"))
    );

    await expect(github.getFileContent("nonexistent.md"))
      .rejects.toThrow("Not found");
  });

  test("should handle invalid branch names", async () => {
    const mockFile: TranslationFile = {
      path: "test/file with spaces.md",
      content: "content",
      sha: "sha"
    };

    const branchName = await github.createBranch(mockFile.path);
    expect(branchName).not.toContain(" ");
  });

  // API Error Cases
  test("should handle API rate limit errors", async () => {
    mockOctokit.rest.git.getTree = mock(() =>
      Promise.reject(new Error("API rate limit exceeded"))
    );

    await expect(github.getUntranslatedFiles())
      .rejects.toThrow("rate limit");
  });

  test("should handle network errors", async () => {
    mockOctokit.rest.repos.getContent = mock(() =>
      Promise.reject(new Error("Network error"))
    );

    await expect(github.getGlossary())
      .rejects.toThrow("Network error");
  });

  // Rate Limiting Tests
  test("should respect GitHub API rate limits", async () => {
    const startTime = Date.now();

    // Make multiple requests in quick succession
    await Promise.all([
      github.getGlossary(),
      github.getGlossary(),
      github.getGlossary()
    ]);

    const duration = Date.now() - startTime;
    expect(duration).toBeGreaterThan(1000); // Assuming 60 req/min rate limit
  });
}); 