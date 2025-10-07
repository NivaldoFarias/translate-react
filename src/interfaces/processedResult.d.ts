import { DatabaseRecord } from ".";

/** Record from the processed_results table */
export interface ProcessedResultRecord extends DatabaseRecord {
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
