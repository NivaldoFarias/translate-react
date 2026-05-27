/**
 * Formats a {@link Date} into an NFTS-compatible date string for log file names.
 *
 * @param date Date to format (defaults to now)
 *
 * @returns ISO string with colons replaced by hyphens
 */
export function nftsCompatibleDateString(date = new Date()): string {
	return date.toISOString().replace(new RegExp(/:/g), "-");
}
