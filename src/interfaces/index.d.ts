/** Record from the snapshots table */
export interface DatabaseRecord {
    /** Primary key */
    id: number;

    /** Creation timestamp from database */
    created_at: string;
}
