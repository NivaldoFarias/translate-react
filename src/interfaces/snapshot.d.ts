import { DatabaseRecord } from ".";

/** Record from the snapshots table */
export interface SnapshotRecord extends DatabaseRecord {
    /** Timestamp when the snapshot was created */
    timestamp: number;
}
