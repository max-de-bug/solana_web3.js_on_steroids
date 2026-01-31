/**
 * ID generation utilities.
 */
/**
 * Generates a unique, timestamped identifier with an optional prefix.
 *
 * @param prefix - Optional prefix for the ID
 * @returns A unique string ID
 */
export function generateId(prefix = '') {
    const timestamp = Date.now();
    const randomPart = Math.random().toString(36).substring(2, 11);
    return prefix ? `${prefix}_${timestamp}_${randomPart}` : `${timestamp}_${randomPart}`;
}
//# sourceMappingURL=idUtils.js.map