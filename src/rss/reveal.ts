import * as helpers from "../helpers.ts";
import { qPstHgt } from "./layout.ts";

const JUMP_RETRY_FRAMES = 18;
const JUMP_SETTLE_MS = 520;

let pendingRevealPostRefs: readonly string[] = [];
let pendingRevealJumpId: string | null = null;

/**
 * Waits for the next layout frame.
 * @returns {Promise<void>}
 */
function waitFrame(): Promise<void> {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

/**
 * Waits several layout frames.
 * @param {number} count
 * @returns {Promise<void>}
 */
async function waitFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
        await waitFrame();
    }
}

/**
 * Gets a visible jump target.
 * @param {string} jumpId
 * @returns {HTMLElement | null}
 */
function getReadyJumpEl(jumpId: string): HTMLElement | null {
    const el = document.getElementById(jumpId);

    if (!(el instanceof HTMLElement)) {
        return null;
    }

    if (el.getClientRects().length === 0) {
        return null;
    }

    return el;
}

/**
 * Waits until the jump target exists and has layout.
 * @param {string} jumpId
 * @returns {Promise<HTMLElement | null>}
 */
async function waitForJumpEl(jumpId: string): Promise<HTMLElement | null> {
    for (let i = 0; i < JUMP_RETRY_FRAMES; i += 1) {
        const el = getReadyJumpEl(jumpId);

        if (el) {
            return el;
        }

        await waitFrame();
    }

    return null;
}

/**
 * Viewport height, accounting for mobile visual viewport when present.
 * @returns {number}
 */
function getViewportHeight(): number {
    return window.visualViewport?.height ?? document.documentElement.clientHeight;
}

/**
 * Scrolls one jump target to the middle of the viewport.
 * @param {HTMLElement} el
 * @returns {void}
 */
function scrollJumpEl(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    const viewportHeight = getViewportHeight();
    const targetTop = window.scrollY + rect.top + (rect.height / 2) - (viewportHeight / 2);

    window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth"
    });
}

/**
 * Repeats the jump once after the expand animation/layout has settled.
 * @param {string} jumpId
 * @returns {void}
 */
function qSettledJump(jumpId: string): void {
    window.setTimeout(() => {
        const el = getReadyJumpEl(jumpId);

        if (!el) {
            return;
        }

        scrollJumpEl(el);
    }, JUMP_SETTLE_MS);
}

/**
 * Moves to one rendered segment.
 * @param {string | null} jumpId
 * @returns {Promise<boolean>}
 */
async function jumpToSeg(jumpId: string | null): Promise<boolean> {
    if (!jumpId) {
        return false;
    }

    const el = await waitForJumpEl(jumpId);

    if (!el) {
        return false;
    }

    scrollJumpEl(el);
    qSettledJump(jumpId);

    return true;
}

/**
 * Scrolls to the requested segment, or falls back to the post.
 * @param {HTMLElement} first
 * @param {string | null} jumpId
 * @returns {Promise<void>}
 */
async function scrollRevealTarget(first: HTMLElement, jumpId: string | null): Promise<void> {
    try {
        await waitFrames(2);

        const jumped = await jumpToSeg(jumpId);

        if (jumped) {
            return;
        }

        first.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    } finally {
        pendingRevealPostRefs = [];
        pendingRevealJumpId = null;
    }
}

/**
 * Open the post, even if toggle is weird.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
function opnPstEl(pstDiv: HTMLElement): void {
    const tgl = pstDiv.querySelector(".rss-post-toggle");
    const cnt = pstDiv.querySelector(".rss-post-content");

    if (!(tgl instanceof HTMLElement)) return;
    if (!(cnt instanceof HTMLElement)) return;

    if (!cnt.classList.contains("content-expanded")) {
        tgl.click();
    }

    if (cnt.classList.contains("content-expanded")) {
        qPstHgt(pstDiv);
        return;
    }

    const arr = pstDiv.querySelector(".summary-arrow");

    cnt.classList.add("content-expanded");
    cnt.classList.remove("content-collapsed");
    cnt.style.maxHeight = `${cnt.scrollHeight}px`;
    cnt.style.visibility = "visible";
    cnt.style.pointerEvents = "auto";
    tgl.setAttribute("aria-expanded", "true");

    if (arr instanceof HTMLElement) arr.textContent = "🔽";

    qPstHgt(pstDiv);
}

/**
 * Reveal posts from saved refs.
 * @param {readonly string[]} postRefs
 * @param {string | null} jumpId
 * @returns {void}
 */
export function revealPostRefs(postRefs: readonly string[], jumpId: string | null = null): void {
    const refs = Array.from(new Set<string>(postRefs));

    pendingRevealPostRefs = refs;
    pendingRevealJumpId = jumpId;

    window.requestAnimationFrame(() => {
        const matched: HTMLElement[] = [];

        refs.forEach((postRef) => {
            const selector = `.rss-post-block[data-rss-post-ref="${helpers.escapeCssIdentifier(postRef)}"]`;

            document.querySelectorAll(selector).forEach((el) => {
                if (!(el instanceof HTMLElement)) return;
                if (matched.includes(el)) return;

                matched.push(el);
                opnPstEl(el);
            });
        });

        const first = matched[0];

        if (!first) {
            pendingRevealPostRefs = [];
            pendingRevealJumpId = null;
            return;
        }

        window.requestAnimationFrame(() => {
            void scrollRevealTarget(first, jumpId);
        });
    });
}


export function queuePendingReveal(
    postRefs: readonly string[],
    jumpId: string | null = null
): void {
    pendingRevealPostRefs = Array.from(
        new Set<string>(postRefs)
    );
    pendingRevealJumpId = jumpId;
}

export function revealPendingPosts(): void {
    if (pendingRevealPostRefs.length === 0) return;

    revealPostRefs(
        pendingRevealPostRefs,
        pendingRevealJumpId
    );
}
