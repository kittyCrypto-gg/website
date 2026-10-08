import { rssState, notifyRssFiltersChanged } from "./runtimeState.ts";
import { flattenCalendarSelection, getPostAuthors, makeCalendarSelection } from "./filterModel.ts";
import { syncCurFiltSum } from "./filterSummary.ts";
import type { FiltSumKnd } from "./types.ts";

/**
 * Drops a date pill.
 * @param {"yr" | "mo" | "dy"} lvl
 * @param {number} val
 * @returns {void}
 */
function rmSumDtPill(lvl: "yr" | "mo" | "dy", val: number): void {
    const cur = flattenCalendarSelection(rssState.curCalSel);
    const next = {
        yrs: lvl === "yr" ? cur.yrs.filter((yr) => yr !== val) : cur.yrs,
        mos: lvl === "mo" ? cur.mos.filter((mo) => mo !== val) : cur.mos,
        dys: lvl === "dy" ? cur.dys.filter((dy) => dy !== val) : cur.dys
    };

    if (rssState.calCtl) {
        rssState.calCtl.setSel(next);
        syncCurFiltSum();
        return;
    }

    rssState.curCalSel = makeCalendarSelection(next.yrs, next.mos, next.dys);
    notifyRssFiltersChanged();
}


/**
 * Summary pill click.
 * @param {HTMLElement} pill
 * @returns {void}
 */
export function hdlSumPillClick(pill: HTMLElement): void {
    const kind = pill.dataset.rssFilterSummaryKind as FiltSumKnd | undefined;

    const ath = pill.dataset.rssFilterSummaryAuthor;
    if (kind === "author" && !ath) return;

    if (kind === "author") {
        rssState.authorOff.add(ath as string);
        notifyRssFiltersChanged();
        return;
    }

    if (kind !== "date") return;

    const lvl = pill.dataset.calLvl as "yr" | "mo" | "dy" | undefined;
    const val = Number(pill.dataset.calVal ?? "");

    if (!lvl || Number.isNaN(val)) return;

    rmSumDtPill(lvl, val);
}


/**
 * Nukes the tiny row.
 * @returns {void}
 */
export function clrAllSumFilt(): void {
    rssState.authorOff = new Set<string>(getPostAuthors(rssState.allPsts));

    if (rssState.calCtl) {
        rssState.calCtl.setSel({
            yrs: [],
            mos: [],
            dys: []
        });
        syncCurFiltSum();
        return;
    }

    rssState.curCalSel = makeCalendarSelection([], [], []);
    notifyRssFiltersChanged();
}

