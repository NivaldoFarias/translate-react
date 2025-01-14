import { expect, test, describe } from "bun:test";
import { FileTranslator } from "../services/fileTranslator";

describe("FileTranslator", () => {
  const translator = new FileTranslator();

  test("should detect untranslated content", () => {
    const englishContent = `---
title: Your First Component
---

# Creating and nesting components

React apps are made out of components. A component is a piece of the UI that has its own logic and appearance.`;

    expect(translator.isFileUntranslated(englishContent)).toBe(true);
  });

  test("should detect translated content", () => {
    const portugueseContent = `---
title: Seu Primeiro Componente
status: translated
---

# Criando e aninhando componentes

Aplicações React são feitas de componentes. Um componente é uma parte da UI que possui sua própria lógica e aparência.`;

    expect(translator.isFileUntranslated(portugueseContent)).toBe(false);
  });

  test("should handle mixed language content", () => {
    const mixedContent = `---
title: Seu Primeiro Componente
---

# Creating and nesting components

Aplicações React são feitas de components. A component is a piece of the UI that has its own logic and appearance.`;

    expect(translator.isFileUntranslated(mixedContent)).toBe(true);
  });
}); 