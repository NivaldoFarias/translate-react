export interface TranslationFile {
    filename?: string;
    content: string;
}

export interface GlossaryRule {
    original: string;
    translation: string;
    context?: string;
}
