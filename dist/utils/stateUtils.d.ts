/**
 * State and Map management utilities.
 */
/**
 * Clears entries from a Map that are older than a specified duration.
 * Assumes the Map values have a 'startTime' property.
 *
 * @param map - The Map to clean up
 * @param maxAgeMs - Maximum allowed age in milliseconds
 */
export declare function clearExpiredEntries<T extends {
    startTime: number;
}>(map: Map<string, T>, maxAgeMs: number): void;
