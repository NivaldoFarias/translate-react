export interface TranslationFile {
	path: string;
	content: string;
	sha: string;
}

export interface GlossaryRule {
	original: string;
	translation: string;
	context?: string;
}
