import type { Environment } from "./utils/env";

/**
 * Represents a parsed content object that contains the original content with placeholders for repeated blocks.
 */
export interface ParsedContent {
    /** The original content with placeholders for repeated blocks */
    content: string;
    /** Map of block identifiers to their content */
    blocks: Map<string, string>;
    /** A string containing all unique blocks formatted for translation */
    uniqueBlocksForTranslation: string;
}

/**
 * Represents a file that needs to be translated.
 */
export interface TranslationFile {
    /** The path of the file */
    path?: string;
    /** The SHA of the file */
    sha?: string;
    /** The filename of the file */
    filename?: string;
    /** The content of the file */
    content: string | ParsedContent;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends Environment {}
    }
}
