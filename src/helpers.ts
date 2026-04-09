/**
 * @param {unknown} value Raw value to inspect.
 * @param {boolean} [acceptArrays=false] Whether to consider arrays as valid records.
 * @returns {value is Record<string, unknown>} True when the value is a plain object record.
 */
export function isRecord(value: unknown, acceptArrays: boolean = false): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && (acceptArrays || !Array.isArray(value));
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

/**
 * @param {unknown} value Raw value to convert.
 * @returns {string} Sanitised string suitable for an id fragment.
 */
export function toSafeIdPart(value: unknown): string {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * @param {string} prefix Prefix for the id.
 * @param {unknown} value Raw value to incorporate.
 * @returns {string} Stable id.
 */
export function makeStableId(prefix: string, value: unknown): string {
    const part = toSafeIdPart(value);
    return part ? `${prefix}${part}` : `${prefix}x`;
}

export type SessionTokenResponse = Readonly<{
    sessionToken: string;
}>;

export type GetIpResponse = Readonly<{
    ip: string;
}>;

/**
 * @param {unknown} value Unknown JSON payload.
 * @returns {void} Asserts that the payload contains a string sessionToken.
 */
export function assertSessionTokenResponse(value: unknown): asserts value is SessionTokenResponse {
    if (!isRecord(value)) {
        throw new Error("Invalid session-token payload: not an object");
    }

    if (typeof value.sessionToken !== "string") {
        throw new Error("Invalid session-token payload: sessionToken is not a string");
    }
}

/**
 * @param {unknown} value Unknown JSON payload.
 * @returns {void} Asserts that the payload contains a string ip.
 */
export function assertGetIpResponse(value: unknown): asserts value is GetIpResponse {
    if (!isRecord(value)) {
        throw new Error("Invalid get-ip payload: not an object");
    }

    if (typeof value.ip !== "string") {
        throw new Error("Invalid get-ip payload: ip is not a string");
    }
}

/**
 * @param {string} value Raw CSS identifier.
 * @returns {string} Escaped value safe for use inside CSS selectors.
 */
export function escapeCssIdentifier(value: string): string {
    if (typeof globalThis.CSS !== "undefined" && typeof globalThis.CSS.escape === "function") {
        return globalThis.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * @param {string | null | undefined} value Raw string to escape for HTML.
 * @returns {string} Escaped string safe for HTML insertion.
 */
export function escapeHtml(value: string | null | undefined): string {
    return (value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

/**
 * @param {number} hue Hue in degrees.
 * @param {number} sat Saturation percentage.
 * @param {number} light Lightness percentage.
 * @returns {string} HSL colour string.
 */
export function getHSL(hue: number, sat: number = 80, light: number = 60): string {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

/**
 * @param {string} str - Input string to hash.
 * @returns {Promise<number[]>} - Promise resolving to an array of bytes representing the SHA-256 hash of the input string.
 */
export async function hashString(str: string): Promise<number[]> {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    return Array.from(new Uint8Array(hashBuffer));
}

/**
 * @returns {Promise<void>} Resolves on the next animation frame.
 */
export function nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

/**
 * @param {string} id - Element id.
 * @returns {HTMLElement | null} HTMLElement if found.
 */
export function getEl(id: string): HTMLElement | null {
    const el = document.getElementById(id);
    return el instanceof HTMLElement ? el : null;
}

/**
 * 
 * @param delayMS 
 * @returns {Promise<void>}
 */
export function wait(delayMS: number): Promise<void> {
    return new Promise((resolve) => {
        window.setTimeout(resolve, delayMS);
    });
}