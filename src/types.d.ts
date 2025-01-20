import type { Environment } from "./utils/env";

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

declare global {
    namespace NodeJS {
        interface ProcessEnv extends Environment {}
    }
}
