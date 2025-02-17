import type { Environment } from "@/utils/env.util";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import type { ChatCompletion } from "openai/resources/chat/completions.mjs";

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

/**
 * # Translation Runner
 *
 * Orchestrates the entire translation workflow, managing the process of:
 * - Repository tree fetching
 * - File content retrieval
 * - Language detection
 * - Translation processing
 * - Pull request creation
 * - Progress tracking and reporting
 */
export interface ProcessedFileResult {
    branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;
    filename: string;
    translation: ChatCompletion | string | null;
    pullRequest:
        | RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
        | RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
        | null;
    error: Error | null;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends Environment {}
    }
}
