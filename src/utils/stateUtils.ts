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
export function clearExpiredEntries<T extends { startTime: number }>(
  map: Map<string, T>,
  maxAgeMs: number
): void {
  const now = Date.now();
  for (const [id, entry] of map.entries()) {
    if (now - entry.startTime > maxAgeMs) {
      map.delete(id);
    }
  }
}
