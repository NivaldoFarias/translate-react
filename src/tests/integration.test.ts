import { expect, test, describe, beforeAll } from "bun:test";
import { GitHubService } from "../services/github";
import { TranslatorService } from "../services/translator";
import { FileTranslator } from "../services/fileTranslator";

describe("Integration Tests", () => {
  let github: GitHubService;
  let translator: TranslatorService;
  let fileTranslator: FileTranslator;

  beforeAll(() => {
    github = new GitHubService();
    translator = new TranslatorService();
    fileTranslator = new FileTranslator();
  });

  test("should complete full translation workflow", async () => {
    // 1. Fetch untranslated files
    const files = await github.getUntranslatedFiles();
    expect(files.length).toBeGreaterThan(0);

    // 2. Get glossary
    const glossary = await github.getGlossary();
    expect(glossary).toBeTruthy();

    // 3. Process first file
    const file = files[ 0 ];

    // 4. Create branch
    const branch = await github.createBranch(file.path);
    expect(branch).toContain("translate-");

    // 5. Translate content
    const translation = await translator.translateContent(file, glossary);
    expect(translation).toBeTruthy();

    // 6. Verify translation
    expect(fileTranslator.isFileUntranslated(translation)).toBe(false);

    // 7. Commit changes
    await expect(
      github.commitTranslation(branch, file, translation)
    ).resolves.not.toThrow();
  });

  test("should handle concurrent translations", async () => {
    const files = await github.getUntranslatedFiles();
    const glossary = await github.getGlossary();

    // Try to translate multiple files concurrently
    const results = await Promise.allSettled(
      files.slice(0, 3).map(async file => {
        const branch = await github.createBranch(file.path);
        const translation = await translator.translateContent(file, glossary);
        await github.commitTranslation(branch, file, translation);
        return translation;
      })
    );

    // Check if at least one translation succeeded
    expect(results.some(r => r.status === "fulfilled")).toBe(true);
  });

  test("should maintain consistency across translations", async () => {
    const files = await github.getUntranslatedFiles();
    const glossary = await github.getGlossary();
    const translations = new Set<string>();

    // Translate same content multiple times
    for (let i = 0; i < 3; i++) {
      const translation = await translator.translateContent(files[ 0 ], glossary);
      translations.add(translation);
    }

    // All translations should be identical
    expect(translations.size).toBe(1);
  });
}); 