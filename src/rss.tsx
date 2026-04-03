import React from "react";
import { Clusteriser } from "./clusterise.ts";
import * as cfg from "./config.ts";
import { render2Frag, render2Mkup } from "./reactHelpers.tsx";
import { CalCtrl, type CalHasArg, type CalSel } from "./calendar.tsx";

declare global {
    namespace JSX {
        interface Element extends React.ReactElement { }
        interface IntrinsicElements {
            [elemName: string]: Record<string, unknown>;
        }
    }
}

declare const marked: {
    parse: (markdown: string) => string;
};

type WrapRs = Readonly<{
    scr: HTMLDivElement | null;
    box: HTMLDivElement;
    cal: HTMLDivElement | null;
}>;

type RssItm = Readonly<{
    title: string;
    description: string;
    content: string;
    pubDate: string;
    author: string;
    guid: string;
}>;

type Pst = Readonly<{
    ttl: string;
    dsc: string;
    cnt: string;
    pub: string;
    ath: string;
    gid: string;
    dt: Date;
    yr: number;
    mo: number;
    dy: number;
}>;

let blogClstr: Clusteriser | null = null;
let calCtl: CalCtrl | null = null;
let allPsts: readonly Pst[] = [];

/**
 * @returns {boolean}
 */
function isBlogPth(): boolean {
    return window.location.pathname.toLowerCase().includes("blog");
}

/**
 * @returns {void}
 */
function aplyBlogLyt(): void {
    const sels = [".frame", ".frame-content", "#main-content", ".blog-wrapper", ".blog-container"];

    sels.forEach((sel) => {
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLElement)) return;

        el.style.height = "auto";
        el.style.maxHeight = "none";
        el.style.overflow = "visible";
    });
}

/**
 * @returns {HTMLDivElement | null}
 */
function ensCalSlot(): HTMLDivElement | null {
    const slot = document.getElementById("kc-blog-cal-filter");
    return slot instanceof HTMLDivElement ? slot : null;
}

/**
 * @returns {WrapRs | null}
 */
function ensBlogWrap(): WrapRs | null {
    if (isBlogPth()) {
        const box = document.querySelector(".blog-container");
        if (!(box instanceof HTMLDivElement)) return null;

        const cal = ensCalSlot();

        return {
            scr: null,
            box,
            cal
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

        Array.from(wrap.children).forEach((chd) => {
            if (chd === scr) return;
            if (!(chd instanceof Element)) return;
            if (!chd.classList.contains("blog-container")) return;
            wrap.removeChild(chd);
        });

        const hdr = wrap.querySelector(".comments-header");
        const aft = hdr?.nextSibling ?? null;

        if (aft) wrap.insertBefore(scr, aft);
        else wrap.appendChild(scr);
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
 * @returns {void}
 */
function adjScrHgt(): void {
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
 * @returns {void}
 */
function setDynScr(): void {
    const rs = ensBlogWrap();
    const scr = rs?.scr ?? null;
    if (!scr) return;

    scr.addEventListener("transitionend", () => adjScrHgt(), true);
    scr.addEventListener("scroll", () => adjScrHgt(), { passive: true });
    window.addEventListener("resize", () => adjScrHgt());
}

/**
 * @returns {void}
 */
function trgAdjOnTgl(): void {
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
 * @param {string} xml
 * @returns {RssItm[]}
 */
function prsRss(xml: string): RssItm[] {
    const prs = new DOMParser();
    const doc = prs.parseFromString(xml, "application/xml");

    return Array.from(doc.querySelectorAll("item")).map((itm) => {
        const cntTags = itm.getElementsByTagName("content:encoded");
        const cnt = (cntTags.length ? (cntTags[0]?.textContent ?? "") : "").trim();

        return {
            title: (itm.querySelector("title")?.textContent ?? "").trim(),
            description: (itm.querySelector("description")?.textContent ?? "").trim(),
            content: cnt,
            pubDate: (itm.querySelector("pubDate")?.textContent ?? "").trim(),
            author: ((itm.querySelector("author")?.textContent ?? "Kitty").trim() || "Kitty"),
            guid: (itm.querySelector("guid")?.textContent ?? "").trim()
        };
    });
}

/**
 * @param {string} pub
 * @returns {Date}
 */
function mkDt(pub: string): Date {
    const dt = new Date(pub);
    return Number.isNaN(dt.getTime()) ? new Date(0) : dt;
}

/**
 * @param {RssItm[]} itms
 * @returns {Pst[]}
 */
function mkPsts(itms: RssItm[]): Pst[] {
    return itms
        .map((itm) => {
            const dt = mkDt(itm.pubDate);

            return {
                ttl: itm.title,
                dsc: itm.description,
                cnt: itm.content,
                pub: itm.pubDate,
                ath: itm.author,
                gid: itm.guid,
                dt,
                yr: dt.getFullYear(),
                mo: dt.getMonth() + 1,
                dy: dt.getDate()
            };
        })
        .sort((a, b) => b.dt.getTime() - a.dt.getTime());
}

/**
 * @param {string} pub
 * @returns {string}
 */
function fmtDt(pub: string): string {
    const dt = mkDt(pub);
    if (dt.getTime() === 0) return "";

    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, "0");
    const dy = String(dt.getDate()).padStart(2, "0");

    return `${yr}.${mo}.${dy}`;
}

/**
 * @param {Pst} pst
 * @param {boolean} exp
 * @returns {JSX.Element}
 */
function PstCard({ pst, exp }: Readonly<{ pst: Pst; exp: boolean }>): JSX.Element {
    const cnt = { __html: marked.parse(pst.cnt) };
    const arr = exp ? "🔽" : "▶️";
    const expd = exp ? "true" : "false";
    const cls = exp ? "rss-post-content content-expanded" : "rss-post-content content-collapsed";

    return (
        <article className="rss-post-block" data-pub={pst.pub} data-gid={pst.gid}>
            <div
                className="rss-post-toggle"
                {...(exp ? {} : { tabIndex: 0, role: "button" })}
                aria-expanded={expd}
            >
                <div className="rss-post-header">
                    <span className="summary-arrow">{arr}</span>
                    <span className="rss-post-title">{pst.ttl}</span>
                    <span className="rss-post-date">{fmtDt(pst.pub)}</span>
                </div>

                <div className="rss-post-meta">
                    <span className="rss-post-author">By: {pst.ath}</span>
                </div>

                <div className="rss-post-summary summary-collapsed">
                    <span className="summary-text">{pst.dsc}</span>
                </div>
            </div>

            <div className={cls} dangerouslySetInnerHTML={cnt} />
        </article>
    );
}

/**
 * @param {string} ttl
 * @param {string} body
 * @returns {JSX.Element}
 */
function EmptyBlk({ ttl, body }: Readonly<{ ttl: string; body: string }>): JSX.Element {
    return (
        <section className="rss-empty" aria-live="polite">
            <div className="rss-empty__ttl">{ttl}</div>
            <p className="rss-empty__txt">{body}</p>
        </section>
    );
}

/**
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
function cfgPstLks(pstDiv: HTMLElement): void {
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
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
function atchTgl(pstDiv: HTMLElement): void {
    const tgl = pstDiv.querySelector(".rss-post-toggle");
    if (!(tgl instanceof HTMLElement)) return;

    const hdr = tgl.querySelector(".rss-post-header");
    if (!(hdr instanceof HTMLElement)) return;

    const arr = hdr.querySelector(".summary-arrow");
    if (!(arr instanceof HTMLElement)) return;

    const cntEl = pstDiv.querySelector(".rss-post-content");
    if (!(cntEl instanceof HTMLElement)) return;

    const cnt = cntEl;
    const tglRef = tgl;
    const arrRef = arr;

    cfgPstLks(pstDiv);

    /**
     * @returns {void}
     */
    function tglPst(): void {
        const expd = cnt.classList.toggle("content-expanded");
        cnt.classList.toggle("content-collapsed", !expd);
        tglRef.setAttribute("aria-expanded", expd ? "true" : "false");

        if (expd) {
            arrRef.textContent = "🔽";
            cnt.style.maxHeight = `${cnt.scrollHeight}px`;
            return;
        }

        arrRef.textContent = "▶️";
        cnt.style.maxHeight = "0px";
        tglRef.blur();
    }

    tglRef.addEventListener("click", (ev) => {
        const pth = ev.composedPath();
        const hitA = pth.find((nd) => nd instanceof HTMLAnchorElement);
        if (hitA) return;

        tglPst();
    });

    tglRef.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;

        ev.preventDefault();
        tglPst();
    });

    cnt.addEventListener("click", (ev) => {
        if (!cnt.classList.contains("content-expanded")) return;

        const pth = ev.composedPath();
        const hitCtl = pth.find((nd) =>
            nd instanceof HTMLAnchorElement ||
            nd instanceof HTMLButtonElement ||
            nd instanceof HTMLInputElement ||
            nd instanceof HTMLTextAreaElement ||
            nd instanceof HTMLSelectElement ||
            nd instanceof HTMLLabelElement
        );

        if (hitCtl) return;
        tglPst();
    });
}

/**
 * @param {HTMLElement} box
 * @returns {void}
 */
function atchAllTgl(box: HTMLElement): void {
    const psts = Array.from(box.querySelectorAll<HTMLElement>(".rss-post-block"));
    if (psts.length === 0) return;

    psts.forEach((pst) => atchTgl(pst));
}

/**
 * @param {readonly Pst[]} psts
 * @returns {number[]}
 */
function mkYrOpts(psts: readonly Pst[]): number[] {
    const nowYr = new Date().getFullYear();
    const src = new Set<number>([nowYr]);

    psts.forEach((pst) => {
        if (Number.isNaN(pst.yr)) return;
        src.add(pst.yr);
    });

    return Array.from(src).sort((a, b) => b - a);
}

/**
 * @param {Pst} pst
 * @param {CalSel} sel
 * @returns {boolean}
 */
function mtchPst(pst: Pst, sel: CalSel): boolean {
    const yrOk = sel.yrs.size === 0 || sel.yrs.has(pst.yr);
    const moOk = sel.mos.size === 0 || sel.mos.has(pst.mo);
    const dyOk = sel.dys.size === 0 || sel.dys.has(pst.dy);

    return yrOk && moOk && dyOk;
}

/**
 * @param {readonly Pst[]} psts
 * @returns {(arg: CalHasArg) => boolean}
 */
function mkHasFn(psts: readonly Pst[]): (arg: CalHasArg) => boolean {
    return ({ lvl, val, sel, ctx }: CalHasArg): boolean => {
        return psts.some((pst) => {
            const yrOk =
                lvl === "yr"
                    ? pst.yr === val
                    : ctx.yr !== undefined
                        ? pst.yr === ctx.yr
                        : sel.yrs.size === 0 || sel.yrs.has(pst.yr);

            const moOk =
                lvl === "mo"
                    ? pst.mo === val
                    : ctx.mo !== undefined
                        ? pst.mo === ctx.mo
                        : sel.mos.size === 0 || sel.mos.has(pst.mo);

            const dyOk =
                lvl === "dy"
                    ? ctx.dy !== undefined
                        ? pst.dy === ctx.dy
                        : pst.dy === val
                    : sel.dys.size === 0 || sel.dys.has(pst.dy);

            return yrOk && moOk && dyOk;
        });
    };
}

/**
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @param {CalSel} sel
 * @returns {void}
 */
function rndBlog(box: HTMLDivElement, psts: readonly Pst[], sel: CalSel): void {
    const vis = psts.filter((pst) => mtchPst(pst, sel));

    if (vis.length === 0) {
        const frag = render2Frag(
            <EmptyBlk
                ttl="No posts for this date selection"
                body="Try adding another year, month, or day, or clear the filters to widen the range."
            />
        );

        box.replaceChildren(frag);
        aplyBlogLyt();
        return;
    }

    const frag = render2Frag(
        <>
            {vis.map((pst) => (
                <PstCard
                    key={pst.gid || `${pst.pub}-${pst.ttl}`}
                    pst={pst}
                    exp={false}
                />
            ))}
        </>
    );

    box.replaceChildren(frag);
    atchAllTgl(box);
    aplyBlogLyt();
}

/**
 * @param {HTMLDivElement} slot
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @returns {void}
 */
function mntCal(slot: HTMLDivElement, box: HTMLDivElement, psts: readonly Pst[]): void {
    const yrs = mkYrOpts(psts);
    const has = mkHasFn(psts);

    if (calCtl) {
        calCtl.destroy();
        calCtl = null;
    }

    calCtl = new CalCtrl({
        host: slot,
        ttl: "Browse by date",
        yrs,
        has,
        onChg: (sel) => {
            rndBlog(box, psts, sel);
        }
    });

    calCtl.init();
}

/**
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @returns {void}
 */
function rndStd(box: HTMLDivElement, psts: readonly Pst[]): void {
    const rows = psts.map((pst) => render2Mkup(<PstCard pst={pst} exp={false} />));

    if (!blogClstr) {
        blogClstr = new Clusteriser(box);
        void blogClstr.init().then(() => {
            blogClstr?.update(rows);
            window.requestAnimationFrame(() => {
                atchAllTgl(box);
                trgAdjOnTgl();
                setDynScr();
                window.setTimeout(() => adjScrHgt(), 100);
            });
        });
        return;
    }

    blogClstr.update(rows);

    window.requestAnimationFrame(() => {
        atchAllTgl(box);
        trgAdjOnTgl();
        setDynScr();
        window.setTimeout(() => adjScrHgt(), 100);
    });
}

/**
 * @param {HTMLDivElement} box
 * @param {unknown} err
 * @returns {void}
 */
function rndErr(box: HTMLDivElement, err: unknown): void {
    console.error(err);

    const frag = render2Frag(
        <EmptyBlk
            ttl="The blog feed could not be loaded"
            body="Please refresh the page or try again in a moment."
        />
    );

    box.replaceChildren(frag);
    aplyBlogLyt();
}

/**
 * @returns {Promise<void>}
 */
async function loadBlogFeed(): Promise<void> {
    const rs = ensBlogWrap();
    if (!rs) return;

    const { box, cal } = rs;
    box.innerHTML = "";

    try {
        const rsp = await fetch(`${cfg.RSS_BACKEND_URL}`);
        if (!rsp.ok) {
            throw new Error(`RSS fetch error: ${rsp.status} ${rsp.statusText}`);
        }

        const xml = await rsp.text();
        allPsts = mkPsts(prsRss(xml));

        if (cal instanceof HTMLDivElement) {
            mntCal(cal, box, allPsts);
            return;
        }

        if (isBlogPth()) {
            rndBlog(box, allPsts, {
                yrs: new Set<number>(),
                mos: new Set<number>(),
                dys: new Set<number>()
            });
            return;
        }

        rndStd(box, allPsts);
    } catch (err: unknown) {
        rndErr(box, err);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    aplyBlogLyt();
    void loadBlogFeed();
});