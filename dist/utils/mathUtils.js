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
export function calculateBackoff(attempt, baseDelay, maxDelay, jitter = 100) {
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const randomJitter = Math.random() * jitter;
    return Math.min(exponentialDelay + randomJitter, maxDelay);
}
//# sourceMappingURL=mathUtils.js.map