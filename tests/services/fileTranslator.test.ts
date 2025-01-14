import { expect, test, describe, beforeEach } from "bun:test";
import { FileTranslator } from "../../src/services/fileTranslator";

describe("FileTranslator", () => {
  let translator: FileTranslator;

  beforeEach(() => {
    translator = new FileTranslator();
  });

  test("should analyze language patterns correctly", () => {
    const mixedContent = `
      # Title
      This is an English sentence with function and component.
      Esta é uma frase em português com função e componente.
    `;

    const analysis = (translator as any).analyzeLanguage(mixedContent);
    expect(analysis).toHaveProperty("portugueseScore");
    expect(analysis).toHaveProperty("englishScore");
    expect(analysis).toHaveProperty("ratio");
    expect(analysis).toHaveProperty("isTranslated");
    expect(analysis.portugueseScore).toBeGreaterThan(0);
    expect(analysis.englishScore).toBeGreaterThan(0);
  });

  test("should handle edge cases in language analysis", () => {
    const emptyContent = "";
    const analysis = (translator as any).analyzeLanguage(emptyContent);
    expect(analysis.ratio).toBe(0);
    expect(analysis.isTranslated).toBe(false);
  });
}); 