interface LanguageAnalysis {
  portugueseScore: number;
  englishScore: number;
  ratio: number;
  isTranslated: boolean;
}

export class FileTranslator {
  private portuguesePatterns = [
    /\b(são|está|você|também|não|para|como|isso|este|esta|pelo|pela)\b/gi,
    /\b(função|variável|objeto|array|classe|componente|propriedade)\b/gi,
    /\b(exemplo|nota|aviso|importante|observação|lembre-se)\b/gi,
    /\b(código|página|aplicação|desenvolvimento|biblioteca)\b/gi
  ];

  private englishPatterns = [
    /\b(is|are|was|were|has|have|had|been|will|would|should|could|must)\b/g,
    /\b(the|this|that|these|those|there|their|they|them|then|than)\b/g,
    /\b(function|variable|object|array|class|component|property)\b/g,
    /\b(example|note|warning|important|remember|learn|more)\b/g,
    /\b(code|page|application|development|library)\b/g
  ];

  isFileUntranslated(content: string): boolean {
    if (content.includes('status: translated')) {
      return false;
    }

    const analysis = this.analyzeLanguage(content);
    return !analysis.isTranslated;
  }

  private analyzeLanguage(content: string): LanguageAnalysis {
    const portugueseMatches = this.portuguesePatterns.map(pattern =>
      (content.match(pattern) || []).length
    );

    const englishMatches = this.englishPatterns.map(pattern =>
      (content.match(pattern) || []).length
    );

    const portugueseScore = portugueseMatches.reduce((a, b) => a + b, 0);
    const englishScore = englishMatches.reduce((a, b) => a + b, 0);
    const totalScore = portugueseScore + englishScore;
    const ratio = totalScore > 0 ? portugueseScore / totalScore : 0;

    return {
      portugueseScore,
      englishScore,
      ratio,
      isTranslated: ratio >= 0.3 && !(englishScore > 10 && portugueseScore < 5)
    };
  }
} 