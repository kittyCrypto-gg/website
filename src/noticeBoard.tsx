import * as notices from "./notices.tsx";

const ROOT_ID = "notice-board";
const WRAP_ID = "notice-board-wrapper";
const RD_KEY = "kc-ntcs-rd";

/**
 * gets the board root if its there.
 * if not, just null.
 *
 * @returns {HTMLElement | null}
 */
function getRoot(): HTMLElement | null {
    const el = document.body.querySelector(`#${ROOT_ID}`);
    return el instanceof HTMLElement ? el : null;
}

/**
 * wrapper around the board, if the page has one.
 *
 * @returns {HTMLElement | null}
 */
function getWrap(): HTMLElement | null {
    const el = document.body.querySelector(`#${WRAP_ID}`);
    return el instanceof HTMLElement ? el : null;
}

/**
 * reads the stored read ids.
 * nothing clever going on here.
 *
 * @returns {readonly string[]}
 */
function getSeen(): readonly string[] {
    try {
        const raw = localStorage.getItem(RD_KEY);
        if (!raw) return [];

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter((itm): itm is string => typeof itm === "string" && itm.trim().length > 0);
    } catch {
        return [];
    }
}

/**
 * saves read ids back, minus any dupes.
 *
 * @param {readonly string[]} ids
 * @returns {void}
 */
function setSeen(ids: readonly string[]): void {
    try {
        const uniq = Array.from(new Set(ids));
        localStorage.setItem(RD_KEY, JSON.stringify(uniq));
    } catch {
        // storage can sulk sometimes
    }
}

/**
 * marks these notices as read.
 *
 * @param {readonly notices.Ntc[]} ntcs
 * @returns {void}
 */
function markRead(ntcs: readonly notices.Ntc[]): void {
    const ids = ntcs.map((ntc) => ntc.id);
    if (ids.length < 1) return;

    setSeen([...getSeen(), ...ids]);
}

/**
 * once the board is actually on screen, mark those notices as read.
 * stops the floating one from banging on later.
 *
 * @param {HTMLElement} root
 * @param {readonly notices.Ntc[]} ntcs
 * @returns {void}
 */
function markSeenOnView(root: HTMLElement, ntcs: readonly notices.Ntc[]): void {
    if (ntcs.length < 1) return;

    if (typeof IntersectionObserver === "undefined") {
        markRead(ntcs);
        return;
    }

    const obs = new IntersectionObserver((entries) => {
        const hit = entries.some((entry) => entry.isIntersecting);
        if (!hit) return;

        markRead(ntcs);
        obs.disconnect();
    }, {
        root: null,
        threshold: 0.1
    });

    obs.observe(root);
}

/**
 * fills the page notice board with notices that are live right now.
 * once the board is actually visible, those get marked read too.
 *
 * @returns {Promise<void>}
 */
export async function initNoticeBoard(): Promise<void> {
    const root = getRoot();
    if (!root) return;

    const wrap = getWrap();
    if (!wrap) return;

    const ntcs = await notices.getActNtcs().catch(() => []);
    if (ntcs.length < 1) {
        root.remove();
        wrap.remove();
        return;
    }

    notices.popNtcs(root, ntcs);
    wrap.style.visibility = "visible";
    markSeenOnView(root, ntcs);
}