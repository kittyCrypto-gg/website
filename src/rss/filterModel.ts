import type { CalHasArg, CalSel } from "../calendar.tsx";
import type { AthOpt, Pst } from "./types.ts";

export const DEFAULT_UNSELECTED_AUTHORS = new Set<string>([
    "autoKitty"
]);

export function makeDefaultAuthorOff(): Set<string> {
    return new Set<string>(DEFAULT_UNSELECTED_AUTHORS);
}

export function hasCalendarSelection(sel: CalSel): boolean {
    return sel.yrs.size > 0 || sel.mos.size > 0 || sel.dys.size > 0;
}

export function makeCalendarSelection(
    yrs: Iterable<number>,
    mos: Iterable<number>,
    dys: Iterable<number>
): CalSel {
    return {
        yrs: new Set<number>(yrs),
        mos: new Set<number>(mos),
        dys: new Set<number>(dys)
    };
}

export function flattenCalendarSelection(
    sel: CalSel
): Readonly<{ yrs: number[]; mos: number[]; dys: number[] }> {
    return {
        yrs: Array.from(sel.yrs),
        mos: Array.from(sel.mos),
        dys: Array.from(sel.dys)
    };
}

function makeDefaultYearSelection(psts: readonly Pst[]): CalSel {
    const nowYr = new Date().getFullYear();
    const yrs = Array.from(
        new Set<number>(
            psts
                .map((pst) => pst.yr)
                .filter((yr) => Number.isFinite(yr) && yr > 0)
        )
    ).sort((left, right) => right - left);

    if (yrs.length === 0) {
        return makeCalendarSelection([], [], []);
    }

    return makeCalendarSelection(
        [yrs.includes(nowYr) ? nowYr : yrs[0]],
        [],
        []
    );
}

export function makeInitialCalendarSelection(
    psts: readonly Pst[],
    current: CalSel
): CalSel {
    return hasCalendarSelection(current)
        ? current
        : makeDefaultYearSelection(psts);
}

export function formatSummaryMonth(mo: number): string {
    return new Date(2000, mo - 1, 1).toLocaleString(
        "en-GB",
        { month: "short" }
    );
}

export function makeDatePillKey(
    lvl: "yr" | "mo" | "dy",
    val: number
): string {
    return "date:" + lvl + ":" + String(val);
}

export function makeAuthorPillKey(author: string): string {
    return "author:" + author;
}

export function makeYearOptions(psts: readonly Pst[]): number[] {
    const nowYr = new Date().getFullYear();
    const src = new Set<number>([nowYr]);

    psts.forEach((pst) => {
        if (Number.isNaN(pst.yr)) return;
        src.add(pst.yr);
    });

    return Array.from(src).sort((a, b) => b - a);
}

function matchesPost(pst: Pst, sel: CalSel): boolean {
    const yrOk = sel.yrs.size === 0 || sel.yrs.has(pst.yr);
    const moOk = sel.mos.size === 0 || sel.mos.has(pst.mo);
    const dyOk = sel.dys.size === 0 || sel.dys.has(pst.dy);

    return yrOk && moOk && dyOk;
}

export function filterPostsByDate(
    psts: readonly Pst[],
    sel: CalSel
): readonly Pst[] {
    return psts.filter((pst) => matchesPost(pst, sel));
}

export function filterPostsByAuthor(
    psts: readonly Pst[],
    off: ReadonlySet<string>
): readonly Pst[] {
    return psts.filter((pst) => !off.has(pst.ath));
}

export function getPostAuthors(
    psts: readonly Pst[]
): ReadonlySet<string> {
    return new Set<string>(psts.map((pst) => pst.ath));
}

export function makeAuthorOptions(
    psts: readonly Pst[],
    off: ReadonlySet<string>
): readonly AthOpt[] {
    const counts = new Map<string, number>();

    psts.forEach((pst) => {
        counts.set(pst.ath, (counts.get(pst.ath) ?? 0) + 1);
    });

    return Array.from(counts.entries())
        .map(([ath, cnt]) => ({
            ath,
            cnt,
            on: !off.has(ath)
        }))
        .sort((a, b) => a.ath.localeCompare(b.ath));
}

export function makeCalendarHasFn(
    psts: readonly Pst[]
): (arg: CalHasArg) => boolean {
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
