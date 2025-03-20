import "@total-typescript/ts-reset";

import type { Environment } from "@/utils/env.util";
import type { RestEndpointMethodTypes } from "@octokit/rest";

import { TranslationFile } from "@/utils/translation-file.util";

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
    id: number;

    /** The timestamp of the snapshot */
    timestamp: number;

    /** The repository tree */
    repositoryTree: RestEndpointMethodTypes["git"]["getTree"]["response"]["data"]["tree"];

    /** The files to translate */
    filesToTranslate: TranslationFile[];

    /** The processed results */
    processedResults: ProcessedFileResult[];
}

/**
 * Database Record Interfaces
 * These interfaces represent the raw data structure of each table in the SQLite database
 */

/** Record from the snapshots table */
export interface SnapshotRecord {
    /** Primary key */
    id: number;

    /** Timestamp when the snapshot was created */
    timestamp: number;

    /** Creation timestamp from database */
    created_at: string;
}

/** Record from the repository_tree table */
export interface RepositoryTreeRecord {
    /** Primary key */
    id: number;

    /** Foreign key to snapshots table */
    snapshot_id: number;

    /** File or directory path */
    path: string | null;

    /** Git file mode */
    mode: string | null;

    /** Git object type */
    type: string | null;

    /** Git SHA hash */
    sha: string | null;

    /** File size in bytes */
    size: number | null;

    /** GitHub API URL */
    url: string | null;
}

/** Record from the files_to_translate table */
export interface FilesToTranslateRecord {
    /** Primary key */
    id: number;

    /** Foreign key to snapshots table */
    snapshot_id: number;

    /** File content */
    content: string;

    /** Git SHA hash */
    sha: string;

    /** File name */
    filename: string;

    /** File path */
    path: string;
}

/** Record from the processed_results table */
export interface ProcessedResultRecord {
    /** Primary key */
    id: number;

    /** Foreign key to snapshots table */
    snapshot_id: number;

    /** File name */
    filename: string;

    /** Git branch reference */
    branch_ref: string | null;

    /** Git branch object SHA */
    branch_object_sha: string | null;

    /** Translated content */
    translation: string | null;

    /** Pull request number */
    pull_request_number: number | null;

    /** Pull request URL */
    pull_request_url: string | null;

    /** Error message if translation failed */
    error: string | null;
}

/** Record from the failed_translations table */
export interface FailedTranslationRecord {
    /** Primary key */
    id: number;

    /** Foreign key to snapshots table */
    snapshot_id: number;

    /** File name */
    filename: string;

    /** Error message */
    error_message: string;

    /** Timestamp when the error occurred */
    timestamp: number;

    /** Creation timestamp from database */
    created_at: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv extends Environment {}
    }
}
