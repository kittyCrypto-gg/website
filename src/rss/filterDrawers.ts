import * as helpers from "../helpers.ts";
import { adjScrHgt } from "./layout.ts";
import { aplyBlogLyt } from "./postRender.tsx";
import { mkFiltBtn, mkFiltClearBtn, renderTglIco, rvlFiltSum, syncFiltSum } from "./filterSummary.ts";
import { colPillRects, flyPills } from "./pillFlight.ts";
import { clrAllSumFilt, hdlSumPillClick } from "./filterActions.ts";
import { rssState } from "./runtimeState.ts";
import type { AthMenuRs, FiltRs } from "./types.ts";

const RSS_FILT_CHILD_PILL_SEL = [
    ".cal .cal__selPill[data-cal-lvl][data-cal-val]",
    ".rss-author-filter__btn[data-rss-author][data-on='1']"
].join(",");
const RSS_FILT_SUM_PILL_SEL = ".rss-filters__summaryPill[data-rss-filter-summary-key]";

/**
 * Tiny shell lookup.
 * @param {HTMLDivElement} shell
 * @returns {FiltRs | null}
 */
function getFiltRs(shell: HTMLDivElement): FiltRs | null {
    const body = shell.querySelector(".rss-filters__body");
    const btn = shell.querySelector("[data-rss-filters-toggle]");
    const hdr = shell.querySelector("[data-rss-filters-header]");

    if (!(body instanceof HTMLDivElement)) return null;
    if (!(btn instanceof HTMLButtonElement)) return null;
    if (!(hdr instanceof HTMLElement)) return null;

    return {
        shell,
        body,
        btn,
        hdr
    };
}


/**
 * Tiny author lookup, because yes.
 * @param {HTMLElement} root
 * @returns {AthMenuRs | null}
 */
function getAthRs(root: HTMLElement): AthMenuRs | null {
    const body = root.querySelector(".rss-author-filter__body");
    const btn = root.querySelector("[data-rss-author-menu-tgl]");
    const hdr = root.querySelector("[data-rss-author-menu-hdr]");

    if (!(body instanceof HTMLDivElement)) return null;
    if (!(btn instanceof HTMLButtonElement)) return null;
    if (!(hdr instanceof HTMLElement)) return null;

    return {
        root,
        body,
        btn,
        hdr
    };
}


/**
 * Layout bump after drawers move.
 * @returns {void}
 */
export function afterDrawerMove(): void {
    window.requestAnimationFrame(() => {
        aplyBlogLyt();
        adjScrHgt();
    });
}


/**
 * Opens the filter cave, or shuts it.
 * @param {HTMLDivElement} shell
 * @param {boolean} opn
 * @returns {void}
 */
function setFiltOpn(shell: HTMLDivElement, opn: boolean): void {
    const rs = getFiltRs(shell);
    if (!rs) return;
    if (rs.shell.dataset.rssFiltersMigrating === "1") return;

    rs.shell.dataset.rssFiltersMigrating = "1";

    const from = colPillRects(
        rs.shell,
        opn ? RSS_FILT_SUM_PILL_SEL : RSS_FILT_CHILD_PILL_SEL
    );

    rs.shell.dataset.rssFiltersChildPending = "1";

    if (!opn) {
        syncFiltSum(rs.shell, true, false);
    }

    helpers.animateCollapsibleOpen({
        root: rs.shell,
        body: rs.body,
        header: rs.hdr,
        toggle: rs.btn,
        open: opn,
        renderIcon: renderTglIco,
        rootDatasetKey: "rssFiltersOpen",
        collapseLabel: "Collapse filters",
        expandLabel: "Expand filters",
        collapseTitle: "Collapse filters",
        expandTitle: "Expand filters",
        onLayout: afterDrawerMove
    });

    window.requestAnimationFrame(() => {
        const to = colPillRects(
            rs.shell,
            opn ? RSS_FILT_CHILD_PILL_SEL : RSS_FILT_SUM_PILL_SEL
        );

        const done = flyPills(from, to);

        if (opn) {
            syncFiltSum(rs.shell, false);
        }

        void done.then(() => {
            if (!opn) {
                rvlFiltSum(rs.shell);
            }

            rs.shell.dataset.rssFiltersChildPending = "0";
            rs.shell.dataset.rssFiltersMigrating = "0";
            afterDrawerMove();
        });
    });
}


/**
 * Opens the author drawer thing.
 * @param {HTMLElement} root
 * @param {boolean} opn
 * @returns {void}
 */
export function setAthOpn(root: HTMLElement, opn: boolean): void {
    const rs = getAthRs(root);
    if (!rs) return;

    rssState.athMenuOpen = opn;

    helpers.animateCollapsibleOpen({
        root: rs.root,
        body: rs.body,
        header: rs.hdr,
        toggle: rs.btn,
        open: opn,
        renderIcon: renderTglIco,
        rootDatasetKey: "rssAuthorOpen",
        collapseLabel: "Collapse author filters",
        expandLabel: "Expand author filters",
        collapseTitle: "Collapse author filters",
        expandTitle: "Expand author filters",
        onLayout: afterDrawerMove
    });
}


/**
 * Wire the wee filter drawer.
 * @param {HTMLDivElement} shell
 * @returns {void}
 */
function wireFilt(shell: HTMLDivElement): void {
    if (shell.dataset.rssFiltersWired === "1") return;

    const rs = getFiltRs(shell);
    if (!rs) return;

    shell.dataset.rssFiltersWired = "1";

    rs.btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        setFiltOpn(shell, shell.dataset.rssFiltersOpen !== "1");
    });

    rs.hdr.addEventListener("click", (ev) => {
        const trg = ev.target;
        if (!(trg instanceof Element)) return;

        const sumPill = trg.closest<HTMLElement>("[data-rss-filter-summary-pill]");
        if (sumPill) {
            ev.preventDefault();
            ev.stopPropagation();

            hdlSumPillClick(sumPill);
            return;
        }

        const clearBtn = trg.closest<HTMLElement>("[data-rss-filters-clear-all]");
        if (clearBtn) {
            ev.preventDefault();
            ev.stopPropagation();

            clrAllSumFilt();
            return;
        }

        if (trg.closest("[data-rss-filters-summary]")) return;
        if (helpers.eventHasBlockedControl(ev)) return;

        setFiltOpn(shell, shell.dataset.rssFiltersOpen !== "1");
    });

    rs.hdr.addEventListener("keydown", (ev) => {
        if (ev.target !== rs.hdr) return;
        if (ev.key !== "Enter" && ev.key !== " ") return;

        ev.preventDefault();
        setFiltOpn(shell, shell.dataset.rssFiltersOpen !== "1");
    });

    syncFiltSum(shell);
}


/**
 * Makes the filter sandwich.
 * @param {HTMLDivElement} cal
 * @returns {HTMLDivElement}
 */
export function ensFiltShell(cal: HTMLDivElement): HTMLDivElement {
    const current = cal.closest(".rss-filters");

    const existingInner = current instanceof HTMLDivElement
        ? current.querySelector(".rss-filters__body-inner")
        : null;

    if (existingInner instanceof HTMLDivElement && !existingInner.contains(cal)) {
        existingInner.prepend(cal);
    }

    if (current instanceof HTMLDivElement && existingInner instanceof HTMLDivElement) {
        wireFilt(current);
        syncFiltSum(current);
        return existingInner;
    }

    const parent = cal.parentElement;
    if (!parent) return cal;

    const shell = document.createElement("div");
    const hdr = document.createElement("div");
    const ttl = document.createElement("h3");
    const summary = document.createElement("div");
    const actions = document.createElement("div");
    const body = document.createElement("div");
    const inner = document.createElement("div");
    const clearBtn = mkFiltClearBtn();
    const btn = mkFiltBtn();

    shell.id = "kc-blog-filters";
    shell.className = "rss-filters";
    shell.dataset.rssFiltersOpen = "0";

    hdr.className = "rss-filters__hdr kc-click-header";
    hdr.dataset.rssFiltersHeader = "1";
    hdr.setAttribute("role", "button");
    hdr.setAttribute("tabindex", "0");
    hdr.setAttribute("aria-expanded", "false");
    hdr.setAttribute("title", "Expand filters");

    ttl.className = "rss-filters__ttl";
    ttl.textContent = "Filters: ";

    summary.className = "rss-filters__summary kc-click-header__control";
    summary.dataset.rssFiltersSummary = "1";
    summary.hidden = true;
    summary.setAttribute("aria-hidden", "true");
    summary.setAttribute("aria-label", "Selected filters");

    actions.className = "rss-filters__hdrActions kc-click-header__actions";
    actions.append(clearBtn, btn);

    body.id = "kc-blog-filters-body";
    body.className = "rss-filters__body";
    body.setAttribute("aria-hidden", "true");

    inner.className = "rss-filters__body-inner";

    hdr.append(ttl, summary, actions);
    body.appendChild(inner);

    parent.insertBefore(shell, cal);
    inner.appendChild(cal);
    shell.append(hdr, body);

    wireFilt(shell);

    return inner;
}


/**
 * Author slot by cal.
 * @param {HTMLDivElement} cal
 * @returns {HTMLDivElement}
 */
export function ensAthSlot(cal: HTMLDivElement): HTMLDivElement {
    const host = ensFiltShell(cal);
    const found = document.getElementById("kc-blog-author-filter");

    if (found instanceof HTMLDivElement && !host.contains(found)) {
        host.appendChild(found);
    }

    if (found instanceof HTMLDivElement) return found;

    const slot = document.createElement("div");

    slot.id = "kc-blog-author-filter";
    slot.className = "rss-author-filter-slot";

    host.appendChild(slot);

    return slot;
}

