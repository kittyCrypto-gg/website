import type React from "react";
import * as cfg from "./config.ts";
import { CalCtrl, type CalSel } from "./calendar.tsx";
import { atchRssComments, initRssComments } from "./rssComments.ts";
import { findByPstRef, getReqJumpId, getReqPstRef, mkPsts, mkPstsRefs, mkPstsSel, prsRss } from "./rss/postModel.ts";
import { isBlogPth, isResourcePth, pstsForCurPage } from "./rss/routing.ts";
import { ensureRssRuntimeDependencies } from "./rss/dependencies.ts";
import { waitForDomReady } from "./helpers/dom.ts";
import { ensBlogWrap } from "./rss/layout.ts";
import { queuePendingReveal } from "./rss/reveal.ts";
import { filterPostsByDate, flattenCalendarSelection, getPostAuthors, makeAuthorOptions, makeCalendarHasFn, makeCalendarSelection, makeDefaultAuthorOff, makeInitialCalendarSelection, makeYearOptions } from "./rss/filterModel.ts";
import { ensAthSlot, afterDrawerMove } from "./rss/filterDrawers.ts";
import { rndAthFilt, wireAthFilt } from "./rss/authorFilters.tsx";
import { rndBlog, rndResources, rndStd, rndErr, aplyBlogLyt } from "./rss/postRender.tsx";
import { syncCurFiltSum } from "./rss/filterSummary.ts";
import { rssState, registerRssFilterRepaint } from "./rss/runtimeState.ts";
import type { Pst } from "./rss/types.ts";

declare global {
    namespace JSX {
        interface Element extends React.ReactElement { }
        interface IntrinsicElements {
            [elemName: string]: Record<string, unknown>;
        }
    }
}

/**
 * Repaint the filter mess.
 * @returns {void}
 */
function repaintFiltersAndBlog(): void {
    const rs = ensBlogWrap();
    const authorSlot = document.getElementById("kc-blog-author-filter");

    if (authorSlot instanceof HTMLDivElement) {
        rndAthFilt(authorSlot, rssState.allPsts, rssState.curCalSel);
    }

    if (rs?.box) {
        rndBlog(rs.box, rssState.allPsts, rssState.curCalSel, rssState.authorOff);
    }

    syncCurFiltSum();
    afterDrawerMove();
}


/**
 * Set filters so the wanted posts can show up.
 * @param {readonly Pst[]} psts
 * @param {readonly Pst[]} tgts
 * @param {string | null} jumpId
 * @returns {void}
 */
function prepTgts(
    psts: readonly Pst[],
    tgts: readonly Pst[],
    jumpId: string | null = null
): void {
    if (tgts.length === 0) return;

    const targetAuthors = getPostAuthors(tgts);
    const allAuthors = getPostAuthors(psts);

    rssState.authorOff = new Set<string>(
        Array.from(allAuthors).filter((author) => !targetAuthors.has(author))
    );

    rssState.curCalSel = mkPstsSel(tgts);
    queuePendingReveal(Array.from(mkPstsRefs(tgts)), jumpId);
}


/**
 * Mount calendar, resets some stuff.
 * @param {HTMLDivElement} slot
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @returns {void}
 */
function mntCal(slot: HTMLDivElement, box: HTMLDivElement, psts: readonly Pst[]): void {
    const yrs = makeYearOptions(psts);
    const has = makeCalendarHasFn(psts);
    const authorSlot = ensAthSlot(slot);
    const initialSel = makeInitialCalendarSelection(psts, rssState.curCalSel);

    rssState.authorOff = makeDefaultAuthorOff();
    rssState.curCalSel = initialSel;
    wireAthFilt(authorSlot, box);

    if (rssState.calCtl) {
        rssState.calCtl.destroy();
        rssState.calCtl = null;
    }

    rssState.calCtl = new CalCtrl({
        host: slot,
        ttl: "Browse by date",
        yrs,
        has,
        onChg: (sel) => {
            rssState.curCalSel = sel;
            rndAthFilt(authorSlot, psts, sel);
            rndBlog(box, psts, sel, rssState.authorOff);
            syncCurFiltSum();
        }
    });

    rssState.calCtl.init();
    rssState.calCtl.setSel(flattenCalendarSelection(initialSel));
    rndAthFilt(authorSlot, psts, rssState.curCalSel);
    rndBlog(box, psts, rssState.curCalSel, rssState.authorOff);
    syncCurFiltSum();
}


/**
 * Target posts while cal exists.
 * @param {HTMLDivElement} box
 * @param {HTMLDivElement} cal
 * @param {readonly Pst[]} psts
 * @param {readonly Pst[]} tgts
 * @param {string | null} jumpId
 * @returns {void}
 */
function rndTgtsCal(
    box: HTMLDivElement,
    cal: HTMLDivElement,
    psts: readonly Pst[],
    tgts: readonly Pst[],
    jumpId: string | null = null
): void {
    const authorSlot = ensAthSlot(cal);

    prepTgts(psts, tgts, jumpId);
    rndAthFilt(authorSlot, psts, rssState.curCalSel);
    rndBlog(box, psts, rssState.curCalSel, rssState.authorOff);
    syncCurFiltSum();
}


/**
 * Load rss and draw stuff.
 * @returns {Promise<void>}
 */
async function loadBlog(): Promise<void> {
    const rs = ensBlogWrap();
    if (!rs) return;

    const { box, cal } = rs;
    // Preserve the build-rendered loading state until the feed can replace it.
    // Older HTML still gets the original empty-container fallback.
    if (box.dataset.rssBuilt !== "1") box.replaceChildren();

    try {
        void initRssComments();

        const [rsp] = await Promise.all([
            fetch(`${cfg.RSS_BACKEND_URL}`),
            ensureRssRuntimeDependencies()
        ]);
        if (!rsp.ok) {
            throw new Error(`RSS fetch error: ${rsp.status} ${rsp.statusText}`);
        }

        const xml = await rsp.text();
        rssState.allPsts = pstsForCurPage(mkPsts(prsRss(xml)));

        const requestedPostRef = getReqPstRef();
        const requestedJumpId = requestedPostRef ? getReqJumpId() : null;
        const requestedPosts = findByPstRef(rssState.allPsts, requestedPostRef);

        if (requestedPosts.length > 0) {
            prepTgts(rssState.allPsts, requestedPosts, requestedJumpId);
        }

        if (isResourcePth()) {
            rndResources(box, rssState.allPsts);
            return;
        }

        const hasCalendar = cal instanceof HTMLDivElement;

        if (hasCalendar) mntCal(cal, box, rssState.allPsts);
        if (hasCalendar && requestedPosts.length > 0) {
            rndTgtsCal(box, cal, rssState.allPsts, requestedPosts, requestedJumpId);
        }
        if (hasCalendar) return;

        if (isBlogPth()) {
            rndBlog(box, rssState.allPsts, rssState.curCalSel, rssState.authorOff);
            return;
        }

        rndStd(box, rssState.allPsts);
    } catch (err: unknown) {
        rndErr(box, err);
    }
}


registerRssFilterRepaint(repaintFiltersAndBlog);

void waitForDomReady().then(() => {
    aplyBlogLyt();
    return loadBlog();
});
