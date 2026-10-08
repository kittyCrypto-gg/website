import * as icons from "../icons.tsx";
import { render2Frag } from "../reactHelpers.tsx";
import { rssState } from "./runtimeState.ts";
import { filterPostsByDate, formatSummaryMonth, makeAuthorOptions, makeAuthorPillKey, makeDatePillKey } from "./filterModel.ts";
import type { FiltSumPill } from "./types.ts";

/**
 * Render helper for shared collapse wiring.
 * @param {boolean} open
 * @returns {DocumentFragment}
 */
export function renderTglIco(open: boolean): DocumentFragment {
    return render2Frag(open ? icons.MakeDecreaseFontIcon() : icons.MakeIncreaseFontIcon());
}


/**
 * Plus/minus thing, yep.
 * @param {HTMLButtonElement} btn
 * @param {boolean} opn
 * @returns {void}
 */
function setFiltIco(btn: HTMLButtonElement, opn: boolean): void {
    btn.replaceChildren(renderTglIco(opn));
    btn.setAttribute("aria-expanded", opn ? "true" : "false");
    btn.setAttribute("aria-label", opn ? "Collapse filters" : "Expand filters");
    btn.title = opn ? "Collapse filters" : "Expand filters";
}


/**
 * Same toy, different cave.
 * @param {HTMLButtonElement} btn
 * @param {boolean} opn
 * @returns {void}
 */
function setAthIco(btn: HTMLButtonElement, opn: boolean): void {
    btn.replaceChildren(renderTglIco(opn));
    btn.setAttribute("aria-expanded", opn ? "true" : "false");
    btn.setAttribute("aria-label", opn ? "Collapse author filters" : "Expand author filters");
    btn.title = opn ? "Collapse author filters" : "Expand author filters";
}


/**
 * Silly round filter btn.
 * @returns {HTMLButtonElement}
 */
export function mkFiltBtn(): HTMLButtonElement {
    const btn = document.createElement("button");

    btn.type = "button";
    btn.className = "rss-filters__toggle kc-round-icon-btn kc-click-header__control";
    btn.dataset.rssFiltersToggle = "1";
    btn.setAttribute("aria-controls", "kc-blog-filters-body");
    setFiltIco(btn, false);

    return btn;
}


/**
 * Clear all thing.
 * @returns {HTMLButtonElement}
 */
export function mkFiltClearBtn(): HTMLButtonElement {
    const btn = document.createElement("button");

    btn.type = "button";
    btn.className = "rss-filters__clear kc-click-header__control";
    btn.dataset.rssFiltersClearAll = "1";
    btn.textContent = "Clear all";
    btn.hidden = true;
    btn.setAttribute("aria-hidden", "true");
    btn.title = "Clear all filters";

    return btn;
}


/**
 * Authors on, for the tiny row.
 * @returns {readonly string[]}
 */
function selAthsForSum(): readonly string[] {
    return makeAuthorOptions(filterPostsByDate(rssState.allPsts, rssState.curCalSel), rssState.authorOff)
        .filter((opt) => opt.on)
        .map((opt) => opt.ath);
}


/**
 * Tiny row pills.
 * @returns {readonly FiltSumPill[]}
 */
function mkFiltSumPills(): readonly FiltSumPill[] {
    const yrs = Array.from(rssState.curCalSel.yrs).sort((a, b) => b - a);
    const mos = Array.from(rssState.curCalSel.mos).sort((a, b) => a - b);
    const dys = Array.from(rssState.curCalSel.dys).sort((a, b) => a - b);
    const aths = selAthsForSum();

    return [
        ...yrs.map((yr) => ({
            key: makeDatePillKey("yr", yr),
            kind: "date" as const,
            lvl: "yr" as const,
            val: yr,
            label: String(yr)
        })),
        ...mos.map((mo) => ({
            key: makeDatePillKey("mo", mo),
            kind: "date" as const,
            lvl: "mo" as const,
            val: mo,
            label: formatSummaryMonth(mo)
        })),
        ...dys.map((dy) => ({
            key: makeDatePillKey("dy", dy),
            kind: "date" as const,
            lvl: "dy" as const,
            val: dy,
            label: String(dy)
        })),
        ...aths.map((ath) => ({
            key: makeAuthorPillKey(ath),
            kind: "author" as const,
            author: ath,
            label: ath
        }))
    ];
}


/**
 * Tiny row btn.
 * @param {FiltSumPill} pill
 * @returns {HTMLButtonElement}
 */
function mkFiltSumPillBtn(pill: FiltSumPill): HTMLButtonElement {
    const btn = document.createElement("button");
    const value = document.createElement("span");

    btn.type = "button";
    btn.className = "cal__selPill rss-filters__summaryPill kc-click-header__control";
    btn.dataset.rssFilterSummaryPill = "1";
    btn.dataset.rssFilterSummaryKey = pill.key;
    btn.dataset.rssFilterSummaryKind = pill.kind;
    btn.title = pill.kind === "author"
        ? `Remove author ${pill.label}`
        : `Remove ${pill.label}`;

    if (pill.kind === "date" && pill.lvl && pill.val !== undefined) {
        btn.dataset.calLvl = pill.lvl;
        btn.dataset.calVal = String(pill.val);
    }

    if (pill.kind === "author" && pill.author) {
        btn.dataset.rssFilterSummaryAuthor = pill.author;
    }

    value.className = "cal__selV";
    value.textContent = pill.label;

    btn.appendChild(value);

    return btn;
}


/**
 * Summary cave.
 * @param {HTMLDivElement} shell
 * @returns {HTMLDivElement | null}
 */
function getFiltSumHost(shell: HTMLDivElement): HTMLDivElement | null {
    const host = shell.querySelector("[data-rss-filters-summary]");

    return host instanceof HTMLDivElement ? host : null;
}


/**
 * Clear btn lookup.
 * @param {HTMLDivElement} shell
 * @returns {HTMLButtonElement | null}
 */
function getFiltClrBtn(shell: HTMLDivElement): HTMLButtonElement | null {
    const btn = shell.querySelector("[data-rss-filters-clear-all]");

    return btn instanceof HTMLButtonElement ? btn : null;
}


/**
 * Summary row sync.
 * @param {HTMLDivElement} shell
 * @param {boolean} collapsed
 * @param {boolean} vis
 * @returns {void}
 */
export function syncFiltSum(
    shell: HTMLDivElement,
    collapsed: boolean = shell.dataset.rssFiltersOpen !== "1",
    vis: boolean = true
): void {
    const host = getFiltSumHost(shell);
    const clearBtn = getFiltClrBtn(shell);

    if (!host || !clearBtn) return;

    const pills = collapsed ? mkFiltSumPills() : [];
    const hasPills = pills.length > 0;
    const pending = hasPills && !vis;

    host.replaceChildren(...pills.map((pill) => mkFiltSumPillBtn(pill)));
    host.hidden = !hasPills;
    host.setAttribute("aria-hidden", hasPills && vis ? "false" : "true");

    clearBtn.hidden = !hasPills;
    clearBtn.disabled = pending;
    clearBtn.setAttribute("aria-hidden", hasPills && vis ? "false" : "true");

    shell.dataset.rssFiltersHasSummary = hasPills ? "1" : "0";
    shell.dataset.rssFiltersSummaryPending = pending ? "1" : "0";
}


/**
 * Current summary sync.
 * @returns {void}
 */
export function syncCurFiltSum(): void {
    const shell = document.getElementById("kc-blog-filters");

    if (!(shell instanceof HTMLDivElement)) return;

    syncFiltSum(shell);
}


/**
 * Show the hidden row.
 * @param {HTMLDivElement} shell
 * @returns {void}
 */
export function rvlFiltSum(shell: HTMLDivElement): void {
    const host = getFiltSumHost(shell);
    const clearBtn = getFiltClrBtn(shell);
    const hasPills = shell.dataset.rssFiltersHasSummary === "1";

    shell.dataset.rssFiltersSummaryPending = "0";

    if (!host || !clearBtn || !hasPills) return;

    host.setAttribute("aria-hidden", "false");
    clearBtn.disabled = false;
    clearBtn.setAttribute("aria-hidden", "false");
}

