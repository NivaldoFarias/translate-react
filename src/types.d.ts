import type { Environment } from "@/utils/env.util";
import type { RestEndpointMethodTypes } from "@octokit/rest";

/** Represents the progress of file processing in batches */
export interface FileProcessingProgress {
    /** The index of the current batch */
    batchIndex: number;

    /** The index of the current file in the batch */
    fileIndex: number;

    /** The total number of batches */
    totalBatches: number;

    /** The number of files to process in each batch */
    batchSize: number;
}

/** Represents a file that needs to be translated */
export interface TranslationFile {
    /** The SHA of the file */
    sha: string;

    /** The path of the file */
    path: string;

    /** The filename of the file */
    filename: string;

    /** The content of the file */
    content: string;
}

export interface ProcessedFileResult {
    branch: RestEndpointMethodTypes["git"]["getRef"]["response"]["data"] | null;
    filename: string;
    translation: string | null;
    pullRequest:
        | RestEndpointMethodTypes["pulls"]["create"]["response"]["data"]
        | RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number]
        | null;
    error: Error | null;
}

/** Represents a snapshot of the translation workflow state */
export interface Snapshot {
    /** The ID of the snapshot */
    id?: number;

    /** The timestamp of the snapshot */
    timestamp: number;

    /** The repository tree */
    repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

    /** The files to translate */
    filesToTranslate: TranslationFile[];

    /** The processed results */
    processedResults: ProcessedFileResult[];
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends Environment {}
    }
}
