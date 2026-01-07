/**
 * Formats a `Date` object into an NFTS-compatible date string.
 *
 * NFTS date strings replace colons with hyphens to ensure compatibility
 * with file systems that restrict the use of colons in filenames.
 *
 * @param date Date object to format (defaults to current date/time)
 *
 * @returns NFTS-compatible date string in ISO format
 *
 * @example
 * ```typescript
 * const dateStr = nftsCompatibleDateString(new Date('2024-01-01T12:34:56Z'));
 * // dateStr === '2024-01-01T12-34-56.000Z'
 * ```
 *
 * @see {@link https://en.wikipedia.org/wiki/ISO_8601#Representations_of_dates_and_times:~:text=Combined%20date%20and%20time%20representations|ISO 8601: Combined date and time representations}
 */
export function nftsCompatibleDateString(date = new Date()): string {
	return date.toISOString().replace(/:/g, "-");
}
