import { DatabaseRecord } from ".";

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
