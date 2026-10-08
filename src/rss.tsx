import React from "react";
import { Clusteriser } from "./clusterise.ts";
import * as cfg from "./config.ts";
import { render2Frag, render2Mkup } from "./reactHelpers.tsx";
import { CalCtrl, type CalHasArg, type CalSel } from "./calendar.tsx";
import * as helpers from "./helpers.ts";
import * as icons from "./icons.tsx";
import { atchRssComments, initRssComments, mkRssCommentSlug } from "./rssComments.ts";
import {
    findByPstRef,
    getReqJumpId,
    getReqPstRef,
    mkPstSegShareUrl,
    mkPstShareUrl,
    mkPsts,
    mkPstsRefs,
    mkPstsSel,
    prsRss
} from "./rss/postModel.ts";
import {
    isBlogPth,
    isDirectRssPth,
    isResourcePth,
    pstsForCurPage
} from "./rss/routing.ts";
import { ensureRssRuntimeDependencies } from "./rss/dependencies.ts";
import { waitForDomReady } from "./helpers/dom.ts";
import { hglPstCode } from "./rss/codeBlocks.ts";
import {
    AuthorFilter,
    EmptyBlk,
    PstCard
} from "./rss/views.tsx";
import {
    DEFAULT_UNSELECTED_AUTHORS,
    filterPostsByAuthor,
    filterPostsByDate,
    flattenCalendarSelection,
    formatSummaryMonth,
    getPostAuthors,
    makeAuthorOptions,
    makeAuthorPillKey,
    makeCalendarHasFn,
    makeCalendarSelection,
    makeDatePillKey,
    makeDefaultAuthorOff,
    makeInitialCalendarSelection,
    makeYearOptions
} from "./rss/filterModel.ts";
import {
    adjScrHgt,
    calcExpHgt,
    ensBlogWrap,
    ensCalSlot,
    qPstHgt,
    setDynScr,
    trgAdjOnTgl,
    wireCmntLyt,
    wireHvr
} from "./rss/layout.ts";
import {
    queuePendingReveal,
    revealPendingPosts
} from "./rss/reveal.ts";
import {
    cfgPstLks,
    wireSegShares,
    wireShareBtns
} from "./rss/segmentInteractions.ts";

declare global {
    namespace JSX {
        interface Element extends React.ReactElement { }
        interface IntrinsicElements {
            [elemName: string]: Record<string, unknown>;
        }
    }
}

import type {
    AthMenuRs,
    FiltRs,
    FiltSumKnd,
    FiltSumPill,
    PillSnap,
    Pst,
    RssItm,
} from "./rss/types.ts";

const RSS_RESOURCE_TITLE_PREFIX = "${resource}";

const RSS_FILT_CHILD_PILL_SEL = [
    ".cal .cal__selPill[data-cal-lvl][data-cal-val]",
    ".rss-author-filter__btn[data-rss-author][data-on='1']"
].join(",");

const RSS_FILT_SUM_PILL_SEL =
    ".rss-filters__summaryPill[data-rss-filter-summary-key]";

let blogClstr: Clusteriser | null = null;
let calCtl: CalCtrl | null = null;
let allPsts: readonly Pst[] = [];
let authorOff: Set<string> = makeDefaultAuthorOff();
let athMenuOpen = false;

let curCalSel: CalSel = makeCalendarSelection([], [], []);

/**
 * layout nudge, kinda blunt.
 * @returns {void}
 */
function aplyBlogLyt(): void {
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
 * Render helper for shared collapse wiring.
 * @param {boolean} open
 * @returns {DocumentFragment}
 */
function renderTglIco(open: boolean): DocumentFragment {
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
function mkFiltBtn(): HTMLButtonElement {
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
function mkFiltClearBtn(): HTMLButtonElement {
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
    return makeAuthorOptions(filterPostsByDate(allPsts, curCalSel), authorOff)
        .filter((opt) => opt.on)
        .map((opt) => opt.ath);
}

/**
 * Tiny row pills.
 * @returns {readonly FiltSumPill[]}
 */
function mkFiltSumPills(): readonly FiltSumPill[] {
    const yrs = Array.from(curCalSel.yrs).sort((a, b) => b - a);
    const mos = Array.from(curCalSel.mos).sort((a, b) => a - b);
    const dys = Array.from(curCalSel.dys).sort((a, b) => a - b);
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
function syncFiltSum(
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
function syncCurFiltSum(): void {
    const shell = document.getElementById("kc-blog-filters");

    if (!(shell instanceof HTMLDivElement)) return;

    syncFiltSum(shell);
}

/**
 * Show the hidden row.
 * @param {HTMLDivElement} shell
 * @returns {void}
 */
function rvlFiltSum(shell: HTMLDivElement): void {
    const host = getFiltSumHost(shell);
    const clearBtn = getFiltClrBtn(shell);
    const hasPills = shell.dataset.rssFiltersHasSummary === "1";

    shell.dataset.rssFiltersSummaryPending = "0";

    if (!host || !clearBtn || !hasPills) return;

    host.setAttribute("aria-hidden", "false");
    clearBtn.disabled = false;
    clearBtn.setAttribute("aria-hidden", "false");
}

/**
 * Fly key, ish.
 * @param {HTMLElement} el
 * @returns {string | null}
 */
function getPillFlyKey(el: HTMLElement): string | null {
    const sumKey = el.dataset.rssFilterSummaryKey;
    if (sumKey) return sumKey;

    const ath = el.dataset.rssAuthor;
    if (ath) return makeAuthorPillKey(ath);

    const lvl = el.dataset.calLvl as "yr" | "mo" | "dy" | undefined;
    const rawVal = el.dataset.calVal ?? "";
    const val = Number(rawVal);

    if (!lvl || Number.isNaN(val)) return null;

    return makeDatePillKey(lvl, val);
}

/**
 * Pill spots.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {Map<string, PillSnap>}
 */
function colPillRects(root: ParentNode, sel: string): Map<string, PillSnap> {
    const snaps = new Map<string, PillSnap>();

    Array.from(root.querySelectorAll<HTMLElement>(sel)).forEach((el) => {
        const key = getPillFlyKey(el);
        if (!key || snaps.has(key)) return;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        snaps.set(key, {
            key,
            rect,
            el
        });
    });

    return snaps;
}

/**
 * Css clock thing.
 * @param {string} raw
 * @param {number} fallback
 * @returns {number}
 */
function cssMs(raw: string, fallback: number): number {
    const value = raw.trim();

    if (value.endsWith("ms")) {
        const ms = Number.parseFloat(value);
        return Number.isFinite(ms) ? ms : fallback;
    }

    if (value.endsWith("s")) {
        const sec = Number.parseFloat(value);
        return Number.isFinite(sec) ? sec * 1000 : fallback;
    }

    return fallback;
}

/**
 * Flight timeout.
 * @returns {number}
 */
function pillFlyMs(): number {
    const styles = window.getComputedStyle(document.documentElement);
    const duration = styles.getPropertyValue("--kc-pill-migrate-duration");

    return cssMs(duration, 620) + 160;
}

/**
 * Little flying ghosts.
 * @param {ReadonlyMap<string, PillSnap>} from
 * @param {ReadonlyMap<string, PillSnap>} to
 * @returns {Promise<void>}
 */
async function flyPills(
    from: ReadonlyMap<string, PillSnap>,
    to: ReadonlyMap<string, PillSnap>
): Promise<void> {
    const flights: Promise<void>[] = [];
    const timeoutMs = pillFlyMs();

    from.forEach((snap, key) => {
        const target = to.get(key);
        if (!target) return;

        const ghost = target.el.cloneNode(true);
        if (!(ghost instanceof HTMLElement)) return;

        ghost.classList.add("kc-pill-migrate-fly");
        ghost.removeAttribute("id");

        ghost.style.left = `${snap.rect.left}px`;
        ghost.style.top = `${snap.rect.top}px`;
        ghost.style.width = `${snap.rect.width}px`;
        ghost.style.height = `${snap.rect.height}px`;
        ghost.style.setProperty("--kc-pill-fly-x", `${target.rect.left - snap.rect.left}px`);
        ghost.style.setProperty("--kc-pill-fly-y", `${target.rect.top - snap.rect.top}px`);

        const flight = new Promise<void>((resolve) => {
            let done = false;

            const finish = (): void => {
                if (done) return;

                done = true;
                window.clearTimeout(timer);
                ghost.remove();
                resolve();
            };

            const timer = window.setTimeout(finish, timeoutMs);

            ghost.addEventListener("animationend", finish, { once: true });
            ghost.addEventListener("animationcancel", finish, { once: true });

            document.body.appendChild(ghost);
        });

        flights.push(flight);
    });

    return Promise.all(flights).then(() => undefined);
}

/**
 * Drops a date pill.
 * @param {"yr" | "mo" | "dy"} lvl
 * @param {number} val
 * @returns {void}
 */
function rmSumDtPill(lvl: "yr" | "mo" | "dy", val: number): void {
    const cur = flattenCalendarSelection(curCalSel);
    const next = {
        yrs: lvl === "yr" ? cur.yrs.filter((yr) => yr !== val) : cur.yrs,
        mos: lvl === "mo" ? cur.mos.filter((mo) => mo !== val) : cur.mos,
        dys: lvl === "dy" ? cur.dys.filter((dy) => dy !== val) : cur.dys
    };

    if (calCtl) {
        calCtl.setSel(next);
        syncCurFiltSum();
        return;
    }

    curCalSel = makeCalendarSelection(next.yrs, next.mos, next.dys);
    repaintFiltersAndBlog();
}

/**
 * Repaint the filter mess.
 * @returns {void}
 */
function repaintFiltersAndBlog(): void {
    const rs = ensBlogWrap();
    const authorSlot = document.getElementById("kc-blog-author-filter");

    if (authorSlot instanceof HTMLDivElement) {
        rndAthFilt(authorSlot, allPsts, curCalSel);
    }

    if (rs?.box) {
        rndBlog(rs.box, allPsts, curCalSel, authorOff);
    }

    syncCurFiltSum();
    afterDrawerMove();
}

/**
 * Summary pill click.
 * @param {HTMLElement} pill
 * @returns {void}
 */
function hdlSumPillClick(pill: HTMLElement): void {
    const kind = pill.dataset.rssFilterSummaryKind as FiltSumKnd | undefined;

    const ath = pill.dataset.rssFilterSummaryAuthor;
    if (kind === "author" && !ath) return;

    if (kind === "author") {
        authorOff.add(ath as string);
        repaintFiltersAndBlog();
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
function clrAllSumFilt(): void {
    authorOff = new Set<string>(getPostAuthors(allPsts));

    if (calCtl) {
        calCtl.setSel({
            yrs: [],
            mos: [],
            dys: []
        });
        syncCurFiltSum();
        return;
    }

    curCalSel = makeCalendarSelection([], [], []);
    repaintFiltersAndBlog();
}

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
function afterDrawerMove(): void {
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
function setAthOpn(root: HTMLElement, opn: boolean): void {
    const rs = getAthRs(root);
    if (!rs) return;

    athMenuOpen = opn;

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
function ensFiltShell(cal: HTMLDivElement): HTMLDivElement {
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

    authorOff = new Set<string>(
        Array.from(allAuthors).filter((author) => !targetAuthors.has(author))
    );

    curCalSel = mkPstsSel(tgts);
    queuePendingReveal(Array.from(mkPstsRefs(tgts)), jumpId);
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
    wireShareBtns(pstDiv, allPsts);
    wireSegShares(pstDiv, allPsts);
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
 * Author slot by cal.
 * @param {HTMLDivElement} cal
 * @returns {HTMLDivElement}
 */
function ensAthSlot(cal: HTMLDivElement): HTMLDivElement {
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

/**
 * Turn authors on.
 * @param {ReadonlySet<string>} aths
 * @returns {void}
 */
function selAths(aths: ReadonlySet<string>): void {
    aths.forEach((ath) => {
        authorOff.delete(ath);
    });
}

/**
 * Turn authors off.
 * @param {ReadonlySet<string>} aths
 * @returns {void}
 */
function unselAths(aths: ReadonlySet<string>): void {
    aths.forEach((ath) => {
        authorOff.add(ath);
    });
}

/**
 * Repaint authors.
 * @param {HTMLDivElement} slot
 * @param {readonly Pst[]} psts
 * @param {CalSel} sel
 * @returns {void}
 */
function rndAthFilt(slot: HTMLDivElement, psts: readonly Pst[], sel: CalSel): void {
    const opts = makeAuthorOptions(filterPostsByDate(psts, sel), authorOff);
    const frag = render2Frag(<AuthorFilter opts={opts} opn={athMenuOpen} />);

    slot.replaceChildren(frag);
    syncCurFiltSum();
}

/**
 * Clicks for author filter.
 * @param {HTMLDivElement} slot
 * @param {HTMLDivElement} box
 * @returns {void}
 */
function wireAthFilt(slot: HTMLDivElement, box: HTMLDivElement): void {
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

            const aths = getPostAuthors(filterPostsByDate(allPsts, curCalSel));
            const act = allBtn.dataset.rssAuthorAct;

            act === "clr"
                ? unselAths(aths)
                : selAths(aths);

            rndAthFilt(slot, allPsts, curCalSel);
            rndBlog(box, allPsts, curCalSel, authorOff);
            syncCurFiltSum();
            return;
        }

        const btn = trg.closest<HTMLButtonElement>("[data-rss-author]");
        if (!(btn instanceof HTMLButtonElement)) return;

        const ath = btn.dataset.rssAuthor;
        if (!ath) return;

        authorOff.has(ath)
            ? authorOff.delete(ath)
            : authorOff.add(ath);

        rndAthFilt(slot, allPsts, curCalSel);
        rndBlog(box, allPsts, curCalSel, authorOff);
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

/**
 * Draw the blog list.
 * @param {HTMLDivElement} box
 * @param {readonly Pst[]} psts
 * @param {CalSel} sel
 * @param {ReadonlySet<string>} offAuthors
 * @returns {void}
 */
function rndBlog(
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
function rndResources(box: HTMLDivElement, psts: readonly Pst[]): void {
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
    const initialSel = makeInitialCalendarSelection(psts, curCalSel);

    authorOff = makeDefaultAuthorOff();
    curCalSel = initialSel;
    wireAthFilt(authorSlot, box);

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
            curCalSel = sel;
            rndAthFilt(authorSlot, psts, sel);
            rndBlog(box, psts, sel, authorOff);
            syncCurFiltSum();
        }
    });

    calCtl.init();
    calCtl.setSel(flattenCalendarSelection(initialSel));
    rndAthFilt(authorSlot, psts, curCalSel);
    rndBlog(box, psts, curCalSel, authorOff);
    syncCurFiltSum();
}

/**
 * Non calendar render path.
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
 * Oops screen.
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
    rndAthFilt(authorSlot, psts, curCalSel);
    rndBlog(box, psts, curCalSel, authorOff);
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
    box.innerHTML = "";

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
        allPsts = pstsForCurPage(mkPsts(prsRss(xml)));

        const requestedPostRef = getReqPstRef();
        const requestedJumpId = requestedPostRef ? getReqJumpId() : null;
        const requestedPosts = findByPstRef(allPsts, requestedPostRef);

        if (requestedPosts.length > 0) {
            prepTgts(allPsts, requestedPosts, requestedJumpId);
        }

        if (isResourcePth()) {
            rndResources(box, allPsts);
            return;
        }

        const hasCalendar = cal instanceof HTMLDivElement;

        if (hasCalendar) mntCal(cal, box, allPsts);
        if (hasCalendar && requestedPosts.length > 0) {
            rndTgtsCal(box, cal, allPsts, requestedPosts, requestedJumpId);
        }
        if (hasCalendar) return;

        if (isBlogPth()) {
            rndBlog(box, allPsts, curCalSel, authorOff);
            return;
        }

        rndStd(box, allPsts);
    } catch (err: unknown) {
        rndErr(box, err);
    }
}

void waitForDomReady().then(() => {
    aplyBlogLyt();
    return loadBlog();
});
