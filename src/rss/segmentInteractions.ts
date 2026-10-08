import * as helpers from "../helpers.ts";
import { copyText } from "./clipboard.ts";
import {
    findByPstRef,
    mkPstSegShareUrl,
    mkPstShareUrl
} from "./postModel.ts";
import type {
    Pst,
    SegPoint,
    SegRevealReq,
    SegTapSnap
} from "./types.ts";

const SEG_DOUBLE_TAP_MS = 420;
const SEG_POINTER_REVEAL_MS = 1800;
const SEG_SHARE_SEL = "[data-rss-seg-id]";
const SEG_SHARE_BTN_SEL = "[data-rss-seg-share-btn]";

let activeSegShare: HTMLElement | null = null;
let lastSegTap: SegTapSnap | null = null;
let pendingSegReveal: SegRevealReq | null = null;
let segRevealTimer: number | null = null;
let segDismissWired = false;

/**
 * Links inside posts.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function cfgPstLks(pstDiv: HTMLElement): void {
    Array.from(pstDiv.querySelectorAll<HTMLAnchorElement>("a[href]")).forEach((lnk) => {
        if (lnk.dataset.rssNewTab === "1") return;

        lnk.dataset.rssNewTab = "1";
        lnk.target = "_blank";
        lnk.rel = "noopener noreferrer";

        lnk.addEventListener("click", (ev) => {
            ev.stopPropagation();
        });
    });
}

/**
 * Reads pointer coordinates from a pointer event.
 * @param {PointerEvent} ev
 * @returns {SegPoint}
 */
function segPointFromPointerEvent(ev: PointerEvent): SegPoint {
    return {
        clientX: ev.clientX,
        clientY: ev.clientY
    };
}

/**
 * Keeps a local segment coordinate inside its box.
 * @param {number} value
 * @param {number} max
 * @returns {number}
 */
function clampSegCoord(value: number, max: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.min(Math.max(value, 0), Math.max(max, 0));
}

/**
 * Checks if a target is an interactive element that should keep its own behaviour.
 * @param {Element} trg
 * @returns {boolean}
 */
function isSegControlTarget(trg: Element): boolean {
    return trg.closest("a,button,input,textarea,select,label") !== null;
}

/**
 * Stores the desired segment share button position as CSS variables.
 * @param {HTMLElement} seg
 * @param {SegPoint} point
 * @returns {void}
 */
function setSegSharePoint(seg: HTMLElement, point: SegPoint): void {
    const rect = seg.getBoundingClientRect();
    const localX = clampSegCoord(point.clientX - rect.left, rect.width);
    const localY = clampSegCoord(point.clientY - rect.top, rect.height);

    seg.style.setProperty("--rss-seg-share-x", `${localX}px`);
    seg.style.setProperty("--rss-seg-share-y", `${localY}px`);
}

/**
 * Cancels a delayed segment share reveal.
 * @returns {void}
 */
function cancelPendingSegReveal(): void {
    pendingSegReveal = null;

    if (segRevealTimer === null) {
        return;
    }

    window.clearTimeout(segRevealTimer);
    segRevealTimer = null;
}

/**
 * Hides the currently visible segment share button only.
 * @returns {void}
 */
function hideActiveSegShare(): void {
    if (!activeSegShare) {
        return;
    }

    activeSegShare.classList.remove("is-rss-seg-share-open");
    activeSegShare.dataset.rssSegShareOpen = "0";
    activeSegShare = null;
}

/**
 * Reveals one segment share button and hides the previous one.
 * @param {HTMLElement} seg
 * @returns {void}
 */
function rvlSegShare(seg: HTMLElement): void {
    if (activeSegShare && activeSegShare !== seg) {
        activeSegShare.classList.remove("is-rss-seg-share-open");
        activeSegShare.dataset.rssSegShareOpen = "0";
    }

    activeSegShare = seg;
    seg.classList.add("is-rss-seg-share-open");
    seg.dataset.rssSegShareOpen = "1";
}

/**
 * Reveals a segment share button at a pointer or tap position.
 * @param {HTMLElement} seg
 * @param {SegPoint} point
 * @returns {void}
 */
function rvlSegShareAt(seg: HTMLElement, point: SegPoint): void {
    cancelPendingSegReveal();
    setSegSharePoint(seg, point);
    rvlSegShare(seg);
}

/**
 * Queues a segment share reveal once the pointer enters a shareable segment.
 * @param {HTMLElement} seg
 * @param {SegPoint} point
 * @returns {void}
 */
function qSegShareReveal(seg: HTMLElement, point: SegPoint): void {
    if (activeSegShare === seg) {
        return;
    }

    if (pendingSegReveal?.seg === seg) {
        return;
    }

    if (activeSegShare) {
        hideActiveSegShare();
    }

    cancelPendingSegReveal();
    setSegSharePoint(seg, point);

    pendingSegReveal = {
        seg,
        point
    };

    segRevealTimer = window.setTimeout(() => {
        const pending = pendingSegReveal;

        segRevealTimer = null;
        pendingSegReveal = null;

        if (!pending?.seg.isConnected) {
            return;
        }

        rvlSegShare(pending.seg);
    }, SEG_POINTER_REVEAL_MS);
}

/**
 * Hides the active segment share button.
 * @returns {void}
 */
function hideSegShare(): void {
    cancelPendingSegReveal();
    hideActiveSegShare();
}

/**
 * Reads the post ref for one rendered segment.
 * @param {HTMLElement} seg
 * @returns {string | null}
 */
function getSegPostRef(seg: HTMLElement): string | null {
    const pstDiv = seg.closest(".rss-post-block");

    if (!(pstDiv instanceof HTMLElement)) {
        return null;
    }

    return pstDiv.dataset.rssPostRef ?? null;
}

/**
 * Reads the share URL for one rendered segment.
 * @param {HTMLElement} seg
 * @returns {string | null}
 */
function getSegShareUrl(seg: HTMLElement): string | null {
    const segId = seg.dataset.rssSegId;
    const postRef = getSegPostRef(seg);

    if (!segId || !postRef) {
        return null;
    }

    return mkPstSegShareUrl(postRef, segId);
}

/**
 * Copies a rendered segment URL.
 * @param {HTMLElement} seg
 * @returns {void}
 */
function copySegShareUrl(seg: HTMLElement): void {
    const url = getSegShareUrl(seg);

    if (!url) {
        return;
    }

    void copyText(url);
    hideSegShare();
}

/**
 * Shares a rendered segment using the normal share helper.
 * @param {HTMLElement} seg
 * @returns {void}
 */
function shareSegUrl(
    seg: HTMLElement,
    posts: readonly Pst[]
): void {
    const url = getSegShareUrl(seg);
    const postRef = getSegPostRef(seg);
    const pst = findByPstRef(posts, postRef).at(0);
    const title = pst?.ttl ?? document.title;

    if (!url) {
        return;
    }

    void helpers.shareUrl(url, title);
    hideSegShare();
}

/**
 * Handles touch tap on a shareable segment.
 * @param {HTMLElement} seg
 * @param {SegPoint} point
 * @returns {void}
 */
function hdlSegTap(seg: HTMLElement, point: SegPoint): void {
    const segId = seg.dataset.rssSegId;
    const now = Date.now();
    const isDoubleTap =
        !!segId
        && lastSegTap?.id === segId
        && now - lastSegTap.at <= SEG_DOUBLE_TAP_MS;

    if (isDoubleTap) {
        lastSegTap = null;
        copySegShareUrl(seg);
        return;
    }

    if (segId) {
        lastSegTap = {
            id: segId,
            at: now
        };
    }

    rvlSegShareAt(seg, point);
}

/**
 * Hides mobile revealed segment buttons on outside tap/click.
 * @returns {void}
 */
function wireSegShareDismiss(): void {
    if (segDismissWired) return;

    segDismissWired = true;

    document.addEventListener(
        "pointerdown",
        (ev) => {
            const trg = ev.target;

            if (!(trg instanceof Element)) {
                hideSegShare();
                return;
            }

            if (activeSegShare?.contains(trg)) {
                return;
            }

            hideSegShare();
        },
        true
    );
}

/**
 * Share btn click wires.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function wireShareBtns(
    pstDiv: HTMLElement,
    posts: readonly Pst[]
): void {
    if (pstDiv.dataset.rssShareWired === "1") return;

    pstDiv.dataset.rssShareWired = "1";

    pstDiv.querySelectorAll<HTMLButtonElement>("[data-rss-share-post]").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const postRef = btn.dataset.rssSharePost;
            if (!postRef) return;

            const psts = findByPstRef(posts, postRef);
            const shareTitle = psts.length === 1 ? psts[0].ttl : document.title;
            const shareUrl = mkPstShareUrl(postRef);

            void helpers.shareUrl(shareUrl, shareTitle);
        });
    });
}

/**
 * Segment share click wires.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function wireSegShares(
    pstDiv: HTMLElement,
    posts: readonly Pst[]
): void {
    if (pstDiv.dataset.rssSegShareWired === "1") return;

    pstDiv.dataset.rssSegShareWired = "1";
    wireSegShareDismiss();

    pstDiv.addEventListener(
        "pointermove",
        (ev) => {
            if (ev.pointerType === "touch") {
                return;
            }

            const trg = ev.target;

            if (!(trg instanceof Element)) {
                hideSegShare();
                return;
            }

            if (trg.closest(SEG_SHARE_BTN_SEL)) {
                return;
            }

            const seg = trg.closest<HTMLElement>(SEG_SHARE_SEL);

            if (!(seg instanceof HTMLElement)) {
                hideSegShare();
                return;
            }

            qSegShareReveal(seg, segPointFromPointerEvent(ev));
        },
        true
    );

    pstDiv.addEventListener(
        "pointerleave",
        (ev) => {
            if (ev.pointerType === "touch") {
                return;
            }

            hideSegShare();
        },
        true
    );

    pstDiv.addEventListener(
        "click",
        (ev) => {
            const trg = ev.target;

            if (!(trg instanceof Element)) return;

            const shareBtn = trg.closest<HTMLButtonElement>(SEG_SHARE_BTN_SEL);

            if (!(shareBtn instanceof HTMLButtonElement)) return;

            ev.preventDefault();
            ev.stopPropagation();

            const seg = shareBtn.closest<HTMLElement>(SEG_SHARE_SEL);
            if (!(seg instanceof HTMLElement)) return;

            shareSegUrl(seg, posts);
        },
        true
    );

    pstDiv.addEventListener(
        "dblclick",
        (ev) => {
            const trg = ev.target;

            if (!(trg instanceof Element)) return;

            const seg = trg.closest<HTMLElement>(SEG_SHARE_SEL);

            if (!(seg instanceof HTMLElement)) {
                return;
            }

            ev.preventDefault();
            ev.stopPropagation();
        },
        true
    );

    pstDiv.addEventListener(
        "pointerdown",
        (ev) => {
            const trg = ev.target;

            if (!(trg instanceof Element)) return;

            if (trg.closest(SEG_SHARE_BTN_SEL)) {
                ev.stopPropagation();
                return;
            }

            const seg = trg.closest<HTMLElement>(SEG_SHARE_SEL);

            if (!(seg instanceof HTMLElement)) {
                return;
            }

            ev.stopPropagation();

            if (ev.pointerType !== "touch") {
                return;
            }

            if (isSegControlTarget(trg)) {
                return;
            }

            hdlSegTap(seg, segPointFromPointerEvent(ev));
        },
        true
    );
}

