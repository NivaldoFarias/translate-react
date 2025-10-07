import { DatabaseRecord } from ".";

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
