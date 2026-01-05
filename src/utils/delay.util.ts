/**
 * Creates a delay promise for testing async timing.
 *
 * @param ms Milliseconds to delay
 *
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
