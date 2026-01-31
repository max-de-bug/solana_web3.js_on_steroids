/**
 * Math and calculation utilities.
 */
/**
 * Calculates an exponential backoff delay with jitter.
 *
 * @param attempt - The current attempt number (starts at 1)
 * @param baseDelay - The base delay in milliseconds
 * @param maxDelay - The maximum allowed delay
 * @param jitter - The optional jitter factor in milliseconds
 * @returns The calculated delay in milliseconds
 */
export declare function calculateBackoff(attempt: number, baseDelay: number, maxDelay: number, jitter?: number): number;
