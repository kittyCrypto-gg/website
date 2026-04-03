/**
 * @param {unknown} value Raw value to inspect.
 * @returns {value is Record<string, unknown>} True when the value is a plain object record.
 */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @returns {Promise<void>} Resolves once the DOM is ready for querying.
 */
export async function waitForDomReady(): Promise<void> {
    if (document.readyState === "interactive" || document.readyState === "complete") {
        return;
    }

    await new Promise<void>((resolve) => {
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
}