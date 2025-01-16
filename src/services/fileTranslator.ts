declare interface LanguageAnalysis {
	portugueseScore: number;
	englishScore: number;
	ratio: number;
	isTranslated: boolean;
}

declare interface LanguagePattern {
	pattern: RegExp;
	weight: number;
}

export class FileTranslator {
	private portuguesePatterns: LanguagePattern[] = [
		// High-confidence patterns (weight: 2.0)
		{
			pattern: /\b(são|está|você|também|não|para|como|isso|este|esta|pelo|pela)\b/gi,
			weight: 2.0,
		},
		// Technical terms (weight: 1.5)
		{
			pattern: /\b(função|variável|objeto|array|classe|componente|propriedade)\b/gi,
			weight: 1.5,
		},
		// Documentation terms (weight: 1.2)
		{
			pattern: /\b(exemplo|nota|aviso|importante|observação|lembre-se)\b/gi,
			weight: 1.2,
		},
		// General technical vocabulary (weight: 1.0)
		{
			pattern: /\b(código|página|aplicação|desenvolvimento|biblioteca)\b/gi,
			weight: 1.0,
		},
		// Conjugated verbs (weight: 1.8)
		{
			pattern: /\b(estamos|podemos|devemos|temos|vamos|fazemos)\b/gi,
			weight: 1.8,
		},
	];

	private englishPatterns: LanguagePattern[] = [
		// Common verbs and auxiliaries (weight: 2.0)
		{
			pattern: /\b(is|are|was|were|has|have|had|been|will|would|should|could|must)\b/g,
			weight: 2.0,
		},
		// Articles and pronouns (weight: 1.5)
		{
			pattern: /\b(the|this|that|these|those|there|their|they|them|then|than)\b/g,
			weight: 1.5,
		},
		// Technical terms (weight: 1.2)
		{
			pattern: /\b(function|variable|object|array|class|component|property)\b/g,
			weight: 1.2,
		},
		// Documentation terms (weight: 1.0)
		{
			pattern: /\b(example|note|warning|important|remember|learn|more)\b/g,
			weight: 1.0,
		},
		// Development terms (weight: 1.0)
		{
			pattern: /\b(code|page|application|development|library)\b/g,
			weight: 1.0,
		},
	];

	isFileUntranslated(content: string): boolean {
		// Quick check for translation status in frontmatter
		if (content.includes("status: translated")) {
			return false;
		}

		// Skip analysis for files that are clearly code
		if (this.isCodeFile(content)) {
			return true;
		}

		const analysis = this.analyzeLanguage(content);
		return !analysis.isTranslated;
	}

	private isCodeFile(content: string): boolean {
		const codeIndicators = [
			/^import\s+.*from/m,
			/^export\s+(default\s+)?(function|class|const|let|var)/m,
			/^const\s+.*=/m,
			/^let\s+.*=/m,
			/^var\s+.*=/m,
		];

		return codeIndicators.some((pattern) => pattern.test(content));
	}

	private analyzeLanguage(content: string): LanguageAnalysis {
		const portugueseScore = this.calculateWeightedScore(content, this.portuguesePatterns);
		const englishScore = this.calculateWeightedScore(content, this.englishPatterns);

		const totalScore = portugueseScore + englishScore;
		const ratio = totalScore > 0 ? portugueseScore / totalScore : 0;

		// More sophisticated translation detection
		const isTranslated = this.determineTranslationStatus(ratio, portugueseScore, englishScore);

		return {
			portugueseScore,
			englishScore,
			ratio,
			isTranslated,
		};
	}

	private calculateWeightedScore(content: string, patterns: LanguagePattern[]): number {
		return patterns.reduce((score, { pattern, weight }) => {
			const matches = (content.match(pattern) || []).length;
			return score + matches * weight;
		}, 0);
	}

	private determineTranslationStatus(
		ratio: number,
		portugueseScore: number,
		englishScore: number,
	): boolean {
		// Multiple factors for determining translation status
		const hasSignificantPortuguese = portugueseScore > 10;
		const hasLowEnglish = englishScore < portugueseScore * 0.3;
		const hasGoodRatio = ratio >= 0.4;

		// Consider it translated if it has significant Portuguese content
		// and either has low English content or a good Portuguese/English ratio
		return hasSignificantPortuguese && (hasLowEnglish || hasGoodRatio);
	}
}
