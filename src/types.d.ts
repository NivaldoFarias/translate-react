import "@total-typescript/ts-reset";

/** Record from the snapshots table */
export interface DatabaseRecord {
    /** Primary key */
    id: number;

    /** Creation timestamp from database */
    created_at: string;
}

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

/** Record from the files_to_translate table */
export interface FilesToTranslateRecord extends DatabaseRecord {
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

/** Record from the repository_tree table */
export interface RepositoryTreeRecord extends DatabaseRecord {
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

/** Record from the failed_translations table */
export interface FailedTranslationRecord extends DatabaseRecord {
    /** Foreign key to snapshots table */
    snapshot_id: number;

    /** File name */
    filename: string;

    /** Error message */
    error_message: string;

    /** Timestamp when the error occurred */
    timestamp: number;
}

/** Record from the snapshots table */
export interface SnapshotRecord extends DatabaseRecord {
    /** Timestamp when the snapshot was created */
    timestamp: number;
}
