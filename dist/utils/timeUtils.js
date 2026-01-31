/**
 * Simple promise-based sleep helper.
 * @param ms - Duration in milliseconds
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=timeUtils.js.map