export type CollCfg = Readonly<{
    tgl: HTMLElement;
    cnt: HTMLElement;
    arr?: HTMLElement | null;
}>;

export type CtrWinStateArg = Readonly<{
    storeKey: string;
    width: number;
    height: number;
    force?: boolean;
}>;

/**
 * Checks if some random node from the event path is a control we should leave alone.
 * mostly so clicks on links/buttons inside the header do not start toggling stuff.
 * @param {unknown} nd
 * @returns {boolean}
 */
function isCtl(nd: unknown): boolean {
    return nd instanceof HTMLAnchorElement ||
        nd instanceof HTMLButtonElement ||
        nd instanceof HTMLInputElement ||
        nd instanceof HTMLTextAreaElement ||
        nd instanceof HTMLSelectElement ||
        nd instanceof HTMLLabelElement;
}

/**
 * Wires up the little collapse thing.
 * click header, it opens. click again, it shuts. nothing fancy.
 * @param {CollCfg} cfg
 * @returns {void}
 */
export function atchColl(cfg: CollCfg): void {
    const { tgl, cnt, arr = null } = cfg;

    /**
     * Flips the section open/closed state and keeps the arrow in sync.
     * @param {boolean} open
     * @returns {void}
     */
    const setOpen = (open: boolean): void => {
        cnt.classList.toggle("content-expanded", open);
        cnt.classList.toggle("content-collapsed", !open);
        cnt.style.maxHeight = open ? `${cnt.scrollHeight}px` : "0px";
        tgl.setAttribute("aria-expanded", open ? "true" : "false");

        if (arr) {
            arr.textContent = open ? "🔽" : "▶️";
        }

        if (!open) {
            tgl.blur();
        }
    };

    setOpen(cnt.classList.contains("content-expanded"));

    /**
     * Header click handler.
     * skips clicks that came from actual controls inside the header.
     * @param {MouseEvent} ev
     * @returns {void}
     */
    const onClick = (ev: MouseEvent): void => {
        if (ev.composedPath().find(isCtl)) return;
        setOpen(!cnt.classList.contains("content-expanded"));
    };

    /**
     * Keyboard toggle handler for Enter/Space.
     * @param {KeyboardEvent} ev
     * @returns {void}
     */
    const onKey = (ev: KeyboardEvent): void => {
        if (ev.key !== "Enter" && ev.key !== " ") return;

        ev.preventDefault();
        setOpen(!cnt.classList.contains("content-expanded"));
    };

    /**
     * Clicking the open content area itself collapses it,
     * unless the click came from a real control in there.
     * @param {MouseEvent} ev
     * @returns {void}
     */
    const onCntClick = (ev: MouseEvent): void => {
        if (!cnt.classList.contains("content-expanded")) return;
        if (ev.composedPath().find(isCtl)) return;
        setOpen(false);
    };

    tgl.addEventListener("click", onClick);
    tgl.addEventListener("keydown", onKey);
    cnt.addEventListener("click", onCntClick);
}

/**
 * Small object check helper.
 * arrays only count if you ask nicely.
 * @param {unknown} value
 * @param {boolean} acceptArrays
 * @returns {value is Record<string, unknown>}
 */
export function isRecord(value: unknown, acceptArrays: boolean = false): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && (acceptArrays || !Array.isArray(value));
}

/**
 * Waits until the DOM is ready enough to query.
 * @returns {Promise<void>}
 */
export async function waitForDomReady(): Promise<void> {
    if (document.readyState === "interactive" || document.readyState === "complete") {
        return;
    }

    await new Promise<void>((resolve) => {
        /**
         * DOMContentLoaded one-shot resolver.
         * @returns {void}
         */
        const done = (): void => resolve();

        document.addEventListener("DOMContentLoaded", done, { once: true });
    });
}

/**
 * Turns whatever this is into a safe-ish id fragment.
 * good enough for generated ids and that sort of thing.
 * @param {unknown} value
 * @returns {string}
 */
export function toSafeIdPart(value: unknown): string {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * Makes a stable id from a prefix + value.
 * @param {string} prefix
 * @param {unknown} value
 * @returns {string}
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
 * Checks the session token payload shape.
 * throws if the server sent nonsense.
 * @param {unknown} value
 * @returns {void}
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
 * Checks the get-ip payload shape.
 * @param {unknown} value
 * @returns {void}
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
 * Escapes a CSS identifier for selectors.
 * uses CSS.escape when available, falls back to a rougher version otherwise.
 * @param {string} value
 * @returns {string}
 */
export function escapeCssIdentifier(value: string): string {
    if (typeof globalThis.CSS !== "undefined" && typeof globalThis.CSS.escape === "function") {
        return globalThis.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Escapes plain text for HTML insertion.
 * not thrilling, but useful.
 * @param {string | null | undefined} value
 * @returns {string}
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
 * Tiny HSL helper.
 * @param {number} hue
 * @param {number} sat
 * @param {number} light
 * @returns {string}
 */
export function getHSL(hue: number, sat: number = 80, light: number = 60): string {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

/**
 * Hashes a string with SHA-256 and gives the bytes back.
 * @param {string} str
 * @returns {Promise<number[]>}
 */
export async function hashString(str: string): Promise<number[]> {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    return Array.from(new Uint8Array(hashBuffer));
}

/**
 * Resolves on the next animation frame.
 * @returns {Promise<void>}
 */
export function nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
        /**
         * RAF resolver.
         * @returns {void}
         */
        const done = (): void => resolve();

        window.requestAnimationFrame(done);
    });
}

/**
 * Gets an element by id and makes sure it is actually an HTMLElement.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
export function getEl(id: string): HTMLElement | null {
    const el = document.getElementById(id);
    return el instanceof HTMLElement ? el : null;
}

/**
 * Simple timeout wait.
 * not clever, just a pause.
 * @param {number} delayMS
 * @returns {Promise<void>}
 */
export function wait(delayMS: number): Promise<void> {
    return new Promise<void>((resolve) => {
        /**
         * Timeout resolver.
         * @returns {void}
         */
        const done = (): void => resolve();

        window.setTimeout(done, delayMS);
    });
}

/**
 * @param {CtrWinStateArg} arg Window bits for centring.
 * @returns {void} Seeds window state so it opens dead-centre.
 */
export function ensCtrWinState(arg: CtrWinStateArg): void {
    const { storeKey, width, height, force = false } = arg;

    try {
        if (!force) {
            const existing = window.localStorage.getItem(storeKey);
            if (existing !== null) {
                return;
            }
        }

        const left = Math.max(0, Math.round((window.innerWidth - width) / 2));
        const top = Math.max(0, Math.round((window.innerHeight - height) / 2));

        const x = `${left}px`;
        const y = `${top}px`;
        const w = `${width}px`;
        const h = `${height}px`;

        window.localStorage.setItem(
            storeKey,
            JSON.stringify({
                floating: true,
                minimised: false,
                closed: false,
                maximised: false,
                x,
                y,
                width: w,
                height: h,
                launcherX: x,
                launcherY: y,
                restoreX: "",
                restoreY: "",
                restoreWidth: "",
                restoreHeight: "",
                restoreFloating: false
            })
        );
    } catch {
        // Storage can be a bit dramatic sometimes.
    }
}