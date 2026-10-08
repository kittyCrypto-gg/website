import {
    isBlogPth,
    isDirectRssPth
} from "./routing.ts";
import type { WrapRs } from "./types.ts";

/**
 * Cal slot if it is there.
 * @returns {HTMLDivElement | null}
 */
export function ensCalSlot(): HTMLDivElement | null {
    const slot = document.getElementById("kc-blog-cal-filter");
    return slot instanceof HTMLDivElement ? slot : null;
}

/**
 * Finds/makes the blog shell, fragile-ish.
 * @returns {WrapRs | null}
 */
function cleanExistingBlogContainers(
    wrap: HTMLElement,
    scroll: HTMLDivElement
): void {
    for (const child of Array.from(wrap.children)) {
        if (child === scroll) continue;
        if (!child.classList.contains("blog-container")) continue;
        wrap.removeChild(child);
    }
}

export function ensBlogWrap(): WrapRs | null {
    const direct = isDirectRssPth();
    const directBox = direct
        ? document.querySelector(".blog-container")
        : null;

    if (direct && !(directBox instanceof HTMLDivElement)) return null;

    if (direct && directBox instanceof HTMLDivElement) {
        return {
            scr: null,
            box: directBox,
            cal: isBlogPth() ? ensCalSlot() : null
        };
    }

    const wrap = document.querySelector(".blog-wrapper");
    if (!(wrap instanceof HTMLElement)) return null;

    let scr: Element | null = wrap.querySelector(".rss-scroll-2");
    let box: Element | null = wrap.querySelector(".blog-container");

    if (!(box instanceof HTMLDivElement)) {
        const nxt = document.createElement("div");
        nxt.className = "blog-container";
        box = nxt;
    }

    if (!(scr instanceof HTMLDivElement)) {
        const nxt = document.createElement("div");
        nxt.className = "rss-scroll-2";
        nxt.appendChild(box);
        scr = nxt;

        cleanExistingBlogContainers(wrap, nxt);

        const hdr = wrap.querySelector(".comments-header");
        const aft = hdr?.nextSibling ?? null;

        aft ? wrap.insertBefore(nxt, aft) : wrap.appendChild(nxt);
    }

    if (!scr.contains(box)) scr.appendChild(box);

    if (!(scr instanceof HTMLDivElement) || !(box instanceof HTMLDivElement)) return null;

    return {
        scr,
        box,
        cal: null
    };
}

/**
 * Weird scroll height fix.
 * @returns {void}
 */
export function adjScrHgt(): void {
    const rs = ensBlogWrap();
    const scr = rs?.scr ?? null;
    if (!scr) return;

    const psts = Array.from(scr.querySelectorAll<HTMLElement>(".rss-post-block"));
    if (psts.length === 0) return;

    const top = scr.scrollTop;
    let fstIx = 0;

    for (let i = 0; i < psts.length; i += 1) {
        if ((psts[i]?.offsetTop ?? 0) <= top) {
            fstIx = i;
            continue;
        }

        break;
    }

    const sndIx = fstIx + 1 < psts.length ? fstIx + 1 : fstIx;
    const fstH = psts[fstIx]?.offsetHeight ?? 0;
    const sndH = psts[sndIx]?.offsetHeight ?? 0;

    scr.style.maxHeight = fstIx === sndIx ? `${fstH}px` : `${fstH + sndH}px`;
}

/**
 * Opened content needs its number again.
 * @param {HTMLElement} content
 * @returns {void}
 */
export function calcExpHgt(content: HTMLElement): void {
    if (!content.classList.contains("content-expanded")) return;

    content.style.maxHeight = `${content.scrollHeight}px`;
}

/**
 * Post height poke.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
function calcPstHgt(pstDiv: HTMLElement): void {
    const content = pstDiv.querySelector(".rss-post-content");
    if (!(content instanceof HTMLElement)) return;

    calcExpHgt(content);
    adjScrHgt();
}

/**
 * Do it twice because DOM is annoying.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function qPstHgt(pstDiv: HTMLElement): void {
    window.requestAnimationFrame(() => {
        calcPstHgt(pstDiv);

        window.requestAnimationFrame(() => {
            calcPstHgt(pstDiv);
        });
    });
}

/**
 * Comment box changes mess with size.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function wireCmntLyt(pstDiv: HTMLElement): void {
    if (pstDiv.dataset.rssCommentLayoutWired === "1") return;

    const comments = pstDiv.querySelector(".rss-comments");
    if (!(comments instanceof HTMLElement)) return;

    pstDiv.dataset.rssCommentLayoutWired = "1";

    comments.addEventListener("rss-comments-layout-change", () => {
        qPstHgt(pstDiv);
    });

    const mutationTarget = comments.querySelector("[data-rss-comments-box]");

    const observer = new MutationObserver(() => {
        qPstHgt(pstDiv);
    });

    observer.observe(
        mutationTarget instanceof HTMLElement ? mutationTarget : comments,
        {
            childList: true,
            subtree: true,
            characterData: true
        }
    );

    if (!("ResizeObserver" in window)) return;

    const resizeObserver = new ResizeObserver(() => {
        qPstHgt(pstDiv);
    });

    resizeObserver.observe(comments);
}

/**
 * Moving scroll thing.
 * @returns {void}
 */
export function setDynScr(): void {
    const rs = ensBlogWrap();
    const scr = rs?.scr ?? null;
    if (!scr) return;

    scr.addEventListener("transitionend", () => adjScrHgt(), true);
    scr.addEventListener("scroll", () => adjScrHgt(), { passive: true });
    window.addEventListener("resize", () => adjScrHgt());
}

/**
 * Old toggle height bump.
 * @returns {void}
 */
export function trgAdjOnTgl(): void {
    const blog = document.querySelector(".blog-container");
    if (!(blog instanceof HTMLElement)) return;

    blog.addEventListener("click", (ev) => {
        const trg = ev.target;
        if (!(trg instanceof Element)) return;
        if (!trg.closest(".rss-post-toggle")) return;

        window.setTimeout(() => adjScrHgt(), 350);
    });
}

/**
 * Hover class stuff.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function wireHvr(pstDiv: HTMLElement): void {
    if (pstDiv.dataset.rssHoverStateWired === "1") return;

    const tgl = pstDiv.querySelector(".rss-post-toggle");
    if (!(tgl instanceof HTMLElement)) return;

    pstDiv.dataset.rssHoverStateWired = "1";

    tgl.addEventListener("pointerenter", () => {
        pstDiv.classList.add("is-rss-toggle-hovered");
    });

    tgl.addEventListener("pointerleave", () => {
        pstDiv.classList.remove("is-rss-toggle-hovered");
    });

    tgl.addEventListener("pointercancel", () => {
        pstDiv.classList.remove("is-rss-toggle-hovered");
    });

    tgl.addEventListener("blur", () => {
        pstDiv.classList.remove("is-rss-toggle-hovered");
    });
}

