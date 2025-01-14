import { expect, test, describe, beforeAll, mock, beforeEach } from "bun:test";
import { TranslatorService } from "../services/translator";
import { TranslationFile } from "../types";
import { readFileSync } from "fs";
import { join } from "path";
import { TranslationError, ErrorCodes } from "../utils/errors";

describe("TranslatorService", () => {
  let translator: TranslatorService;
  let mockGlossary: string;
  let mockFile: TranslationFile;

  beforeAll(() => {
    translator = new TranslatorService();
    mockGlossary = readFileSync(join(import.meta.dir, "fixtures/glossary.md"), "utf-8");
  });

  beforeEach(() => {
    mockFile = {
      path: "src/content/learn/your-first-component.md",
      content: readFileSync(join(import.meta.dir, "fixtures/sample-doc.md"), "utf-8"),
      sha: "mock-sha"
    };
  });

  // Edge Cases
  test("should handle empty content", async () => {
    mockFile.content = "";
    await expect(translator.translateContent(mockFile, mockGlossary))
      .rejects.toThrow(TranslationError);
  });

  test("should handle content with only code blocks", async () => {
    mockFile.content = "```jsx\nconst x = 1;\n```";
    const translation = await translator.translateContent(mockFile, mockGlossary);
    expect(translation).toContain("```jsx");
    expect(translation).toContain("const x = 1;");
  });

  test("should handle content with special characters", async () => {
    mockFile.content = "# Title with ñ, é, ç\n```jsx\nconst x = 'áéíóú';\n```";
    const translation = await translator.translateContent(mockFile, mockGlossary);
    expect(translation).toMatch(/[ñéçáíóú]/);
  });

  // API Error Cases
  test("should handle API rate limit errors", async () => {
    const mockError = new Error("Rate limit exceeded");
    mockError.name = "RateLimitError";

    mock.module("@anthropic-ai/sdk", () => ({
      messages: {
        create: () => { throw mockError; }
      }
    }));

    await expect(translator.translateContent(mockFile, mockGlossary))
      .rejects.toThrow(TranslationError);
  });

  test("should handle API timeout errors", async () => {
    const mockError = new Error("Request timeout");
    mock.module("@anthropic-ai/sdk", () => ({
      messages: {
        create: () => { throw mockError; }
      }
    }));

    await expect(translator.translateContent(mockFile, mockGlossary))
      .rejects.toThrow(TranslationError);
  });

  // Glossary Term Tests
  test("should correctly translate all glossary terms", async () => {
    const glossaryTerms = new Map([
      [ "component", "componente" ],
      [ "prop", "prop" ],
      [ "state", "estado" ]
    ]);

    const content = `A component uses props and state.`;
    mockFile.content = content;

    const translation = await translator.translateContent(mockFile, mockGlossary);

    for (const [ en, pt ] of glossaryTerms) {
      if (content.includes(en)) {
        expect(translation).toContain(pt);
      }
    }
  });

  // Rate Limiting Tests
  test("should respect rate limits", async () => {
    const startTime = Date.now();

    // Make multiple requests in quick succession
    await Promise.all([
      translator.translateContent(mockFile, mockGlossary),
      translator.translateContent(mockFile, mockGlossary),
      translator.translateContent(mockFile, mockGlossary)
    ]);

    const duration = Date.now() - startTime;
    // Ensure minimum time between requests is respected
    expect(duration).toBeGreaterThan(2000); // Assuming 30 req/min rate limit
  });
}); 