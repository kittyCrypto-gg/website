import { Clusteriser } from "../clusterise.ts";
import { render2Frag, render2Mkup } from "../reactHelpers.tsx";
import * as helpers from "../helpers.ts";
import { atchRssComments } from "../rssComments.ts";
import { hglPstCode } from "./codeBlocks.ts";
import { EmptyBlk, PstCard } from "./views.tsx";
import { filterPostsByAuthor, filterPostsByDate } from "./filterModel.ts";
import { adjScrHgt, calcExpHgt, qPstHgt, setDynScr, trgAdjOnTgl, wireCmntLyt, wireHvr } from "./layout.ts";
import { revealPendingPosts } from "./reveal.ts";
import { cfgPstLks, wireSegShares, wireShareBtns } from "./segmentInteractions.ts";
import { syncCurFiltSum } from "./filterSummary.ts";
import { rssState } from "./runtimeState.ts";
import type { CalSel } from "../calendar.tsx";
import type { Pst } from "./types.ts";

const RSS_RESOURCE_TITLE_PREFIX = "${resource}";

/**
 * layout nudge, kinda blunt.
 * @returns {void}
 */
export function aplyBlogLyt(): void {
    const sels = [".frame", ".frame-content", "#main-content", ".blog-wrapper", ".blog-container"];

    sels.forEach((sel) => {
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLElement)) return;
        if (el.classList.contains("window-frame")) return;

        el.style.height = "auto";
        el.style.maxHeight = "none";
        el.style.overflow = "visible";
    });
}


/**
 * Attach the post bits.
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

    const cnt = pstDiv.querySelector(".rss-post-content");
    if (!(cnt instanceof HTMLElement)) return;

    cfgPstLks(pstDiv);
    hglPstCode(pstDiv, {
        recalculateContentHeight: calcExpHgt,
        adjustScrollHeight: adjScrHgt,
        queuePostHeight: qPstHgt
    });
    wireShareBtns(pstDiv, rssState.allPsts);
    wireSegShares(pstDiv, rssState.allPsts);
    wireHvr(pstDiv);
    wireCmntLyt(pstDiv);
    helpers.atchColl({ tgl, cnt, arr });
    atchRssComments(pstDiv);
}


/**
 * All post toggles.
 * @param {HTMLElement} box
 * @returns {void}
 */
function atchAllTgl(box: HTMLElement): void {
    const psts = Array.from(box.querySelectorAll<HTMLElement>(".rss-post-block"));
    if (psts.length === 0) return;

    psts.forEach((pst) => atchTgl(pst));

    revealPendingPosts();
}


/**
 * Draw the blog list.
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @param {CalSel} sel
 * @param {ReadonlySet<string>} offAuthors
 * @returns {void}
 */
export function rndBlog(
    box: HTMLDivElement,
    psts: readonly Pst[],
    sel: CalSel,
    offAuthors: ReadonlySet<string> = new Set<string>()
): void {
    const byDate = filterPostsByDate(psts, sel);
    const vis = filterPostsByAuthor(byDate, offAuthors);

    if (byDate.length === 0) {
        const frag = render2Frag(
            <EmptyBlk
                ttl="No posts for this date selection"
                body="Try adding another year, month, or day, or clear the filters to widen the range."
            />
        );

        box.replaceChildren(frag);
        aplyBlogLyt();
        syncCurFiltSum();
        return;
    }

    if (vis.length === 0) {
        const frag = render2Frag(
            <EmptyBlk
                ttl="No posts for the selected authors"
                body="Turn an author back on, or use Select all to show every author for this date selection."
            />
        );

        box.replaceChildren(frag);
        aplyBlogLyt();
        syncCurFiltSum();
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
    syncCurFiltSum();
}


/**
 * Draw the resources list without filters.
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @returns {void}
 */
export function rndResources(box: HTMLDivElement, psts: readonly Pst[]): void {
    if (psts.length === 0) {
        const frag = render2Frag(
            <EmptyBlk
                ttl="No resources found"
                body={`Posts whose title starts with ${RSS_RESOURCE_TITLE_PREFIX} will appear here.`}
            />
        );

        box.replaceChildren(frag);
        aplyBlogLyt();
        return;
    }

    const frag = render2Frag(
        <>
            {psts.map((pst) => (
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
 * Non calendar render path.
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @returns {void}
 */
export function rndStd(box: HTMLDivElement, psts: readonly Pst[]): void {
    const rows = psts.map((pst) => render2Mkup(<PstCard pst={pst} exp={false} />));

    if (!rssState.blogClstr) {
        rssState.blogClstr = new Clusteriser(box);
        void rssState.blogClstr.init().then(() => {
            rssState.blogClstr?.update(rows);
            window.requestAnimationFrame(() => {
                atchAllTgl(box);
                trgAdjOnTgl();
                setDynScr();
                window.setTimeout(() => adjScrHgt(), 100);
            });
        });
        return;
    }

    rssState.blogClstr.update(rows);

    window.requestAnimationFrame(() => {
        atchAllTgl(box);
        trgAdjOnTgl();
        setDynScr();
        window.setTimeout(() => adjScrHgt(), 100);
    });
}


/**
 * Oops screen.
 * @param {HTMLDivElement} box
 * @param {unknown} err
 * @returns {void}
 */
export function rndErr(box: HTMLDivElement, err: unknown): void {
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

