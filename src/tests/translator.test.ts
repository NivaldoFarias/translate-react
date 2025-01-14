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
    mockFile = {
      path: "src/content/learn/your-first-component.md",
      content: readFileSync(join(import.meta.dir, "fixtures/sample-doc.md"), "utf-8"),
      sha: "mock-sha"
    };
  });

  describe("Mock Tests", () => {
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
    beforeEach(() => {
      // Unmock the module completely before live tests
      mock.module("@anthropic-ai/sdk", () => require("@anthropic-ai/sdk"));
      translator = new TranslatorService();
    });

    test("should correctly translate content with glossary terms", async () => {
      const content = `A component uses props and state.`;
      mockFile.content = content;

      const translation = await translator.translateContent(mockFile, mockGlossary);

      // Verify translation contains Portuguese terms from glossary
      expect(translation).toContain("componente");
      expect(translation).toContain("props");
      expect(translation).toContain("estado");
    }, { timeout: 30000 }); // Longer timeout for actual API call

    test("should handle content with special characters", async () => {
      mockFile.content = "# Title with ñ, é, ç\n```jsx\nconst x = 'áéíóú';\n```";

      const translation = await translator.translateContent(mockFile, mockGlossary);
      expect(translation).toMatch(/[ñéçáíóú]/);
      expect(translation).toContain("```jsx");
      expect(translation).toContain("const x = 'áéíóú';");
    }, { timeout: 30000 });
  });
}); 