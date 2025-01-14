import { expect, test, describe, beforeAll, mock, beforeEach, afterAll } from "bun:test";
import { TranslatorService } from "../services/translator";
import { TranslationFile } from "../types";
import { readFileSync } from "fs";
import { join } from "path";
import { TranslationError, ErrorCodes } from "../utils/errors";

declare class MockAnthropic {
  messages: {
    create: () => Promise<{ content: { text: string }[] }>;
  };
}

describe("TranslatorService", () => {
  let translator: TranslatorService;
  let mockGlossary: string;
  let mockFile: TranslationFile;

  beforeAll(() => {
    mockGlossary = readFileSync(join(import.meta.dir, "fixtures/glossary.md"), "utf-8");
  });

  beforeEach(() => {
    mockFile = {
      path: "src/content/learn/your-first-component.md",
      content: readFileSync(join(import.meta.dir, "fixtures/sample-doc.md"), "utf-8"),
      sha: "mock-sha"
    };
  });

  describe("Mock Tests", () => {
    beforeEach(() => {
      // Mock entire Anthropic class
      mock.module("@anthropic-ai/sdk", () => {
        return {
          default: class Anthropic implements MockAnthropic {
            messages = {
              create: async () => ({
                content: [ { text: "Mocked translation response" } ]
              })
            }
          }
        }
      });

      translator = new TranslatorService();
    });

    test("should handle empty content", async () => {
      mockFile.content = "";
      expect(translator.translateContent(mockFile, mockGlossary))
        .rejects.toThrow(TranslationError);
    });

    test("should handle content with only code blocks", async () => {
      mockFile.content = "```jsx\nconst x = 1;\n```";

      mock.module("@anthropic-ai/sdk", () => {
        return {
          default: class Anthropic implements MockAnthropic {
            messages = {
              create: async () => ({
                content: [ { text: mockFile.content } ]
              })
            }
          }
        }
      });

      translator = new TranslatorService();

      const translation = await translator.translateContent(mockFile, mockGlossary);
      expect(translation).toContain("```jsx");
      expect(translation).toContain("const x = 1;");
    });

    test("should handle API rate limit errors", async () => {
      const mockError = new Error("Rate limit exceeded");
      mockError.name = "RateLimitError";

      mock.module("@anthropic-ai/sdk", () => {
        return {
          default: class Anthropic implements MockAnthropic {
            messages = {
              create: async () => { throw mockError; }
            }
          }
        };
      });

      translator = new TranslatorService();

      expect(translator.translateContent(mockFile, mockGlossary))
        .rejects.toThrow(TranslationError);
    });

    test("should handle API timeout errors", async () => {
      mock.module("@anthropic-ai/sdk", () => {
        return {
          default: class Anthropic implements MockAnthropic {
            messages = {
              create: async () => { throw new Error("Request timeout"); }
            }
          }
        }
      });

      translator = new TranslatorService();

      expect(translator.translateContent(mockFile, mockGlossary))
        .rejects.toThrow(TranslationError);
    });
  });

  describe("Live API Tests", () => {
    test("should correctly translate content with glossary terms", async () => {
      mock.module("@anthropic-ai/sdk", () => require("@anthropic-ai/sdk"));
      translator = new TranslatorService();

      const content = `A component uses props and state.`;
      mockFile.content = content;

      const translation = await translator.translateContent(mockFile, mockGlossary);

      expect(translation).toContain("componente");
      expect(translation).toContain("props");
      expect(translation).toContain("estado");
    }, { timeout: 30000 });

    test("should handle content with special characters", async () => {
      mock.module("@anthropic-ai/sdk", () => require("@anthropic-ai/sdk"));
      translator = new TranslatorService();

      mockFile.content = "# Title with ñ, é, ç\n```jsx\nconst x = 'áéíóú';\n```";

      const translation = await translator.translateContent(mockFile, mockGlossary);
      expect(translation).toMatch(/[ñéçáíóú]/);
      expect(translation).toContain("```jsx");
      expect(translation).toContain("const x = 'áéíóú';");
    }, { timeout: 30000 });
  });

  test("should handle refinement failures", async () => {
    mock.module("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: async () => {
            throw new Error("Refinement failed");
          }
        }
      }
    }));

    const translator = new TranslatorService();
    await expect(
      translator.refineTranslation("test content", "test glossary")
    ).rejects.toThrow(TranslationError);
  });

  test("should handle rate limiting in translation", async () => {
    const rateLimitError = new Error("Rate limit exceeded");
    rateLimitError.name = "RateLimitError";

    mock.module("@anthropic-ai/sdk", () => ({
      default: class MockAnthropic {
        messages = {
          create: async () => {
            throw rateLimitError;
          }
        }
      }
    }));

    const translator = new TranslatorService();
    const mockFile = {
      path: "test.md",
      content: "test content",
      sha: "test-sha"
    };

    await expect(
      translator.translateContent(mockFile, "test glossary")
    ).rejects.toThrow(TranslationError);
  });
}); 