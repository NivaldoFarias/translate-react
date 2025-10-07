import { DatabaseRecord } from ".";

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
