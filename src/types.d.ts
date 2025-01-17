export interface TranslationFile {
    path?: string;
    sha?: string;
    filename?: string;
    content: string;
}

export interface GlossaryRule {
    original: string;
    translation: string;
    context?: string;
}
