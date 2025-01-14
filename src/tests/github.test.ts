import { expect, test, describe, mock, beforeEach } from "bun:test";
import { GitHubService } from "../services/github";
import { TranslationFile } from "../types";

describe("GitHubService", () => {
  describe("Mock Tests", () => {
    let github: GitHubService;
    let mockOctokit = {
      rest: {
        git: {
          getTree: mock(() => Promise.resolve({
            data: { tree: [ { path: "src/test.md", sha: "123" } ] }
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

    beforeEach(() => {
      mock.module("@octokit/rest", () => ({
        Octokit: mock(() => mockOctokit)
      }));

      github = new GitHubService();
    });

    test("should handle non-existent files", async () => {
      mockOctokit.rest.repos.getContent = mock(() =>
        Promise.reject(new Error("Not found"))
      );

      expect(github.getFileContent("nonexistent.md"))
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

    test("should handle API rate limit errors", async () => {
      mockOctokit.rest.git.getTree = mock(() =>
        Promise.reject(new Error("API rate limit exceeded"))
      );

      expect(github.getUntranslatedFiles())
        .rejects.toThrow("rate limit");
    });

    test("should handle network errors", async () => {
      mockOctokit.rest.repos.getContent = mock(() =>
        Promise.reject(new Error("Network error"))
      );

      expect(github.getGlossary())
        .rejects.toThrow("Network error");
    });
  });

  describe("Live API Tests", () => {
    mock.restore(); // Restore original modules
    let github = new GitHubService();

    test("should fetch repository tree", async () => {
      const { data } = await github.fetchRepositoryTree();
      expect(data.tree).toBeDefined();
      expect(Array.isArray(data.tree)).toBe(true);
    });

    test("should fetch up to 10 untranslated files", async () => {
      const files = await github.getUntranslatedFiles(10);
      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeLessThanOrEqual(10);
    }, { timeout: 60000 });

    test("should fetch glossary content", async () => {
      const content = await github.getGlossary();
      expect(content).toContain("**");
      expect(content.length).toBeGreaterThan(0);
    });

    test("should create and delete test branch", async () => {
      const testFile: TranslationFile = {
        path: "test/temp-branch-test.md",
        content: "Test content",
        sha: "test-sha"
      };

      const branchName = await github.createBranch(testFile.path);
      expect(branchName).toContain("translate-");
      expect(branchName).not.toContain(" ");
      expect(branchName).not.toContain("/");

      // Clean up
      await github.deleteBranch(branchName);
    });

    test("should handle file operations", async () => {
      const testPath = "README.md"; // Use an existing file
      const content = await github.getFileContent(testPath);
      expect(content).toBeTruthy();
      expect(content.length).toBeGreaterThan(0);
    });

    test("should commit translation", async () => {
      const testFile: TranslationFile = {
        path: "README.md",
        content: "Original content",
        sha: "original-sha"
      };

      const branch = await github.createBranch(testFile.path);
      const translation = "Translated content";

      expect(
        github.commitTranslation(branch, testFile, translation)
      ).resolves.toBeUndefined();

      await github.deleteBranch(branch);
    });
  });
}); 
