import { render2Frag } from "../reactHelpers.tsx";
import * as helpers from "../helpers.ts";
import type { CalSel } from "../calendar.tsx";
import { AuthorFilter } from "./views.tsx";
import { getPostAuthors, makeAuthorOptions, filterPostsByDate } from "./filterModel.ts";
import { syncCurFiltSum } from "./filterSummary.ts";
import { setAthOpn } from "./filterDrawers.ts";
import { rndBlog } from "./postRender.tsx";
import { rssState } from "./runtimeState.ts";
import type { Pst } from "./types.ts";

/**
 * Turn authors on.
 * @param {ReadonlySet<string>} aths
 * @returns {void}
 */
function selAths(aths: ReadonlySet<string>): void {
    aths.forEach((ath) => {
        rssState.authorOff.delete(ath);
    });
}


/**
 * Turn authors off.
 * @param {ReadonlySet<string>} aths
 * @returns {void}
 */
function unselAths(aths: ReadonlySet<string>): void {
    aths.forEach((ath) => {
        rssState.authorOff.add(ath);
    });
}


/**
 * Repaint authors.
 * @param {HTMLDivElement} slot
 * @param {readonly Pst[]} psts
 * @param {CalSel} sel
 * @returns {void}
 */
export function rndAthFilt(slot: HTMLDivElement, psts: readonly Pst[], sel: CalSel): void {
    const opts = makeAuthorOptions(filterPostsByDate(psts, sel), rssState.authorOff);
    const frag = render2Frag(<AuthorFilter opts={opts} opn={rssState.athMenuOpen} />);

    slot.replaceChildren(frag);
    syncCurFiltSum();
}


/**
 * Clicks for author filter.
 * @param {HTMLDivElement} slot
 * @param {HTMLDivElement} box
 * @returns {void}
 */
export function wireAthFilt(slot: HTMLDivElement, box: HTMLDivElement): void {
    if (slot.dataset.rssAuthorWired === "1") return;

    slot.dataset.rssAuthorWired = "1";

    slot.addEventListener("click", (ev) => {
        const trg = ev.target;
        if (!(trg instanceof Element)) return;

        const menuBtn = trg.closest<HTMLButtonElement>("[data-rss-author-menu-tgl]");

        const menuRoot = menuBtn?.closest(".rss-author-filter") ?? null;
        if (menuBtn && !(menuRoot instanceof HTMLElement)) return;

        if (menuBtn && menuRoot instanceof HTMLElement) {
            ev.preventDefault();
            ev.stopPropagation();
            setAthOpn(menuRoot, menuRoot.dataset.rssAuthorOpen !== "1");
            return;
        }

        const allBtn = trg.closest<HTMLButtonElement>("[data-rss-author-act]");

        if (allBtn) {
            ev.preventDefault();
            ev.stopPropagation();

            const aths = getPostAuthors(filterPostsByDate(rssState.allPsts, rssState.curCalSel));
            const act = allBtn.dataset.rssAuthorAct;

            act === "clr"
                ? unselAths(aths)
                : selAths(aths);

            rndAthFilt(slot, rssState.allPsts, rssState.curCalSel);
            rndBlog(box, rssState.allPsts, rssState.curCalSel, rssState.authorOff);
            syncCurFiltSum();
            return;
        }

        const btn = trg.closest<HTMLButtonElement>("[data-rss-author]");
        if (!(btn instanceof HTMLButtonElement)) return;

        const ath = btn.dataset.rssAuthor;
        if (!ath) return;

        rssState.authorOff.has(ath)
            ? rssState.authorOff.delete(ath)
            : rssState.authorOff.add(ath);

        rndAthFilt(slot, rssState.allPsts, rssState.curCalSel);
        rndBlog(box, rssState.allPsts, rssState.curCalSel, rssState.authorOff);
        syncCurFiltSum();

        const hdr = trg.closest<HTMLElement>("[data-rss-author-menu-hdr]");
        if (!hdr) return;
        if (helpers.eventHasBlockedControl(ev)) return;

        const root = hdr.closest(".rss-author-filter");
        if (!(root instanceof HTMLElement)) return;

        setAthOpn(root, root.dataset.rssAuthorOpen !== "1");
    });

    slot.addEventListener("keydown", (ev) => {
        const trg = ev.target;
        if (!(trg instanceof HTMLElement)) return;
        if (!trg.matches("[data-rss-author-menu-hdr]")) return;
        if (ev.key !== "Enter" && ev.key !== " ") return;

        const root = trg.closest(".rss-author-filter");
        if (!(root instanceof HTMLElement)) return;

        ev.preventDefault();
        setAthOpn(root, root.dataset.rssAuthorOpen !== "1");
    });
}

