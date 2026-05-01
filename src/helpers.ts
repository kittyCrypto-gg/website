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

export type CollapseIconRenderer = (open: boolean) => Node;

export type RoundToggleSyncCfg = Readonly<{
    btn: HTMLElement;
    open: boolean;
    renderIcon?: CollapseIconRenderer;
    controlsId?: string;
    collapseLabel?: string;
    expandLabel?: string;
    collapseTitle?: string;
    expandTitle?: string;
    applyUtilityClass?: boolean;
}>;

export type CollapsibleSetCfg = Readonly<{
    root: HTMLElement;
    body: HTMLElement;
    open: boolean;
    header?: HTMLElement | null;
    toggle?: HTMLElement | null;
    iconHost?: HTMLElement | null;
    renderIcon?: CollapseIconRenderer;
    rootDatasetKey?: string;
    openValue?: string;
    closedValue?: string;
    collapseLabel?: string;
    expandLabel?: string;
    collapseTitle?: string;
    expandTitle?: string;
    onLayout?: (() => void) | null;
}>;

export type CollapsibleHeaderWireCfg = Readonly<{
    header: HTMLElement;
    toggle: HTMLElement;
    getOpen: () => boolean;
    setOpen: (open: boolean) => void;
    wiredKey?: string;
}>;

type CollapsibleAncestorSnap = Readonly<{
    body: HTMLElement;
    startHeight: number;
}>;

type HeightAnimState = Readonly<{
    token: number;
    frameIds: readonly number[];
    onEnd: (ev: TransitionEvent) => void;
}>;

const COLLAPSIBLE_BODY_SELECTOR = [
    ".rss-filters__body",
    ".rss-author-filter__body",
    ".cal__rootBody",
    ".cal__sctBody"
].join(",");

const heightAnimStates = new WeakMap<HTMLElement, HeightAnimState>();

let nextHeightAnimToken = 0;

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
 * Checks whether an element is one of the known collapsible bodies.
 * @param {Element} el
 * @returns {boolean}
 */
function isCollapsibleBody(el: Element): boolean {
    return el.matches(COLLAPSIBLE_BODY_SELECTOR);
}

/**
 * Cancels pending frame work and stale transition handlers for one collapsible body.
 * @param {HTMLElement} body
 * @returns {void}
 */
function cancelHeightAnim(body: HTMLElement): void {
    const state = heightAnimStates.get(body);
    if (!state) return;

    state.frameIds.forEach((frameId) => {
        window.cancelAnimationFrame(frameId);
    });

    body.removeEventListener("transitionend", state.onEnd);
    heightAnimStates.delete(body);
}

/**
 * Current rendered block height.
 * @param {HTMLElement} body
 * @returns {number}
 */
function getRenderedHeight(body: HTMLElement): number {
    return body.getBoundingClientRect().height;
}

/**
 * Locks a body at whatever height it is visually using right now.
 * @param {HTMLElement} body
 * @returns {number}
 */
function lockRenderedHeight(body: HTMLElement): number {
    cancelHeightAnim(body);

    const height = getRenderedHeight(body);

    body.style.maxHeight = `${height}px`;
    void body.offsetHeight;

    return height;
}

/**
 * Runs a max-height animation from an already locked height.
 * @param {HTMLElement} body
 * @param {number} startHeight
 * @param {number} targetHeight
 * @param {boolean} freeOnEnd
 * @returns {void}
 */
function runHeightAnim(
    body: HTMLElement,
    startHeight: number,
    targetHeight: number,
    freeOnEnd: boolean
): void {
    const token = nextHeightAnimToken + 1;
    const frameIds: number[] = [];

    nextHeightAnimToken = token;

    /**
     * Finishes the animation only if this is still the current animation
     * and the element has actually reached its current target.
     * @param {TransitionEvent} ev
     * @returns {void}
     */
    const onEnd = (ev: TransitionEvent): void => {
        if (ev.target !== body || ev.propertyName !== "max-height") return;

        const state = heightAnimStates.get(body);
        if (!state || state.token !== token) return;

        const curHeight = getRenderedHeight(body);
        const reachedTarget = Math.abs(curHeight - targetHeight) <= 1;

        if (!reachedTarget) return;

        body.removeEventListener("transitionend", onEnd);
        heightAnimStates.delete(body);

        if (freeOnEnd) {
            body.style.maxHeight = "none";
        }
    };

    heightAnimStates.set(body, {
        token,
        frameIds,
        onEnd
    });

    if (Math.abs(startHeight - targetHeight) <= 1) {
        body.style.maxHeight = freeOnEnd ? "none" : `${targetHeight}px`;
        heightAnimStates.delete(body);
        return;
    }

    body.addEventListener("transitionend", onEnd);

    const frameId = window.requestAnimationFrame(() => {
        const state = heightAnimStates.get(body);
        if (!state || state.token !== token) return;

        body.style.maxHeight = `${targetHeight}px`;
    });

    frameIds.push(frameId);
}

/**
 * Gets open collapsible ancestors for nested height animation.
 * @param {HTMLElement} body
 * @returns {HTMLElement[]}
 */
function getOpenCollapsibleAncestors(body: HTMLElement): HTMLElement[] {
    const out: HTMLElement[] = [];
    let cur = body.parentElement;

    while (cur) {
        if (
            cur !== body &&
            isCollapsibleBody(cur) &&
            cur.getAttribute("aria-hidden") !== "true"
        ) {
            out.push(cur);
        }

        cur = cur.parentElement;
    }

    return out;
}

/**
 * Locks currently-open ancestor bodies to their present height before a nested body changes.
 * This lets parent drawers animate with the nested drawer instead of jumping.
 * @param {HTMLElement} body
 * @returns {CollapsibleAncestorSnap[]}
 */
function primeCollapsibleAncestors(body: HTMLElement): CollapsibleAncestorSnap[] {
    return getOpenCollapsibleAncestors(body).map((ancestor) => ({
        body: ancestor,
        startHeight: lockRenderedHeight(ancestor)
    }));
}

/**
 * Moves any locked open ancestors to their new height.
 * @param {readonly CollapsibleAncestorSnap[]} snaps
 * @returns {void}
 */
function animateCollapsibleAncestors(snaps: readonly CollapsibleAncestorSnap[]): void {
    snaps.forEach((snap) => {
        const nextHeight = snap.body.scrollHeight;

        runHeightAnim(snap.body, snap.startHeight, nextHeight, true);
    });
}

/**
 * Checks if the event path includes a specific element.
 * @param {Event} ev
 * @param {EventTarget} el
 * @returns {boolean}
 */
export function eventPathIncludes(ev: Event, el: EventTarget): boolean {
    return ev.composedPath().includes(el);
}

/**
 * Checks if the event came from a real control, except controls explicitly allowed.
 * @param {Event} ev
 * @param {readonly EventTarget[]} allowed
 * @returns {boolean}
 */
export function eventHasBlockedControl(
    ev: Event,
    allowed: readonly EventTarget[] = []
): boolean {
    return ev.composedPath().some((nd) => isCtl(nd) && !allowed.includes(nd as EventTarget));
}

/**
 * Syncs a round collapse/expand button with an open state.
 * @param {RoundToggleSyncCfg} cfg
 * @returns {void}
 */
export function syncRoundToggleButton(cfg: RoundToggleSyncCfg): void {
    const {
        btn,
        open,
        renderIcon,
        controlsId,
        collapseLabel = "Collapse",
        expandLabel = "Expand",
        collapseTitle = collapseLabel,
        expandTitle = expandLabel,
        applyUtilityClass = true
    } = cfg;

    if (applyUtilityClass) {
        btn.classList.add("kc-round-icon-btn");
    }

    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? collapseLabel : expandLabel);
    btn.setAttribute("title", open ? collapseTitle : expandTitle);

    if (controlsId) {
        btn.setAttribute("aria-controls", controlsId);
    }

    if (!renderIcon) return;

    btn.replaceChildren(renderIcon(open));
}

/**
 * Applies non-animated collapsible state to a root/body/header/toggle group.
 * @param {CollapsibleSetCfg} cfg
 * @returns {void}
 */
export function setCollapsibleOpen(cfg: CollapsibleSetCfg): void {
    const {
        root,
        body,
        open,
        header = null,
        toggle = null,
        iconHost = null,
        renderIcon,
        rootDatasetKey = "open",
        openValue = "1",
        closedValue = "0",
        collapseLabel = "Collapse",
        expandLabel = "Expand",
        collapseTitle = collapseLabel,
        expandTitle = expandLabel,
        onLayout = null
    } = cfg;

    root.dataset[rootDatasetKey] = open ? openValue : closedValue;
    body.setAttribute("aria-hidden", open ? "false" : "true");

    if (header) {
        header.setAttribute("aria-expanded", open ? "true" : "false");
        header.setAttribute("title", open ? collapseTitle : expandTitle);
    }

    if (toggle) {
        syncRoundToggleButton({
            btn: toggle,
            open,
            renderIcon,
            collapseLabel,
            expandLabel,
            collapseTitle,
            expandTitle,
            applyUtilityClass: false
        });
    }

    if (iconHost && renderIcon) {
        iconHost.replaceChildren(renderIcon(open));
    }

    if (!onLayout) return;

    window.requestAnimationFrame(() => {
        onLayout();
    });
}

/**
 * Applies collapsible state with a max-height transition.
 * Safe to call again before the previous animation has finished.
 * @param {CollapsibleSetCfg} cfg
 * @returns {void}
 */
export function animateCollapsibleOpen(cfg: CollapsibleSetCfg): void {
    const { body, open } = cfg;
    const startHeight = lockRenderedHeight(body);
    const ancestorSnaps = primeCollapsibleAncestors(body);

    setCollapsibleOpen(cfg);

    const targetHeight = open ? body.scrollHeight : 0;

    runHeightAnim(body, startHeight, targetHeight, open);

    window.requestAnimationFrame(() => {
        animateCollapsibleAncestors(ancestorSnaps);
    });
}

/**
 * Wires a header where the whole row toggles, except normal controls inside it.
 * The actual toggle button still toggles.
 * @param {CollapsibleHeaderWireCfg} cfg
 * @returns {void}
 */
export function wireCollapsibleHeader(cfg: CollapsibleHeaderWireCfg): void {
    const {
        header,
        toggle,
        getOpen,
        setOpen,
        wiredKey = "kcCollapsibleHeaderWired"
    } = cfg;

    if (header.dataset[wiredKey] === "1") return;

    header.dataset[wiredKey] = "1";

    header.addEventListener("click", (ev) => {
        if (eventPathIncludes(ev, toggle)) {
            ev.preventDefault();
            ev.stopPropagation();
            setOpen(!getOpen());
            return;
        }

        if (eventHasBlockedControl(ev, [header])) return;

        setOpen(!getOpen());
    });

    header.addEventListener("keydown", (ev) => {
        const trg = ev.target;
        if (trg !== header) return;
        if (ev.key !== "Enter" && ev.key !== " ") return;

        ev.preventDefault();
        setOpen(!getOpen());
    });
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
        if (eventHasBlockedControl(ev)) return;
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
        if (eventHasBlockedControl(ev)) return;
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
export function isRecord(
    value: unknown,
    acceptArrays: boolean = false
): value is Record<string, unknown> {
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

/**
 * Reads a query parameter from a URL.
 * @param {string} name
 * @param {string} url
 * @returns {string | null}
 */
export function getUrlParam(name: string, url: string = window.location.href): string | null {
    return new URL(url, window.location.href).searchParams.get(name);
}

/**
 * Returns a URL string with one query parameter set.
 * @param {string} name
 * @param {string} value
 * @param {string} url
 * @returns {string}
 */
export function setUrlParam(
    name: string,
    value: string,
    url: string = window.location.href
): string {
    const nextUrl = new URL(url, window.location.href);

    nextUrl.searchParams.set(name, value);

    return nextUrl.toString();
}

/**
 * Returns a URL string with one query parameter removed.
 * @param {string} name
 * @param {string} url
 * @returns {string}
 */
export function removeUrlParam(name: string, url: string = window.location.href): string {
    const nextUrl = new URL(url, window.location.href);

    nextUrl.searchParams.delete(name);

    return nextUrl.toString();
}

/**
 * Checks whether native sharing is available for the given data.
 * @param {ShareData} data
 * @returns {boolean}
 */
function canNativeShare(data: ShareData): boolean {
    if (typeof navigator.share !== "function") return false;
    if (typeof navigator.canShare !== "function") return true;

    return navigator.canShare(data);
}

/**
 * Shares a URL using the native share sheet.
 * @param {string} url
 * @param {string} title
 * @returns {Promise<boolean>}
 */
export async function shareUrl(url: string, title = document.title): Promise<boolean> {
    const shareData: ShareData = {
        title,
        url: new URL(url, window.location.href).toString()
    };

    if (!canNativeShare(shareData)) return false;

    try {
        await navigator.share(shareData);
        return true;
    } catch {
        return false;
    }
}