import { CalendarBase } from "./CalendarBase.ts";
import { dyCnt, ro, selOf, setOf } from "./model.ts";
import type { CalCtx, CalHasFn, CalLvl, CalSel, SelInp } from "./types.ts";

export abstract class CalendarSelection extends CalendarBase {
    /**
     * Current selection snapshot.
     * @returns {CalSel}
     */
    getSel(): CalSel {
        return {
            yrs: ro(this.selYrs),
            mos: ro(this.selMos),
            dys: ro(this.selDys)
        };
    }


    /**
     * Replaces the has-content fn and refreshes the ui.
     * @param {CalHasFn} has
     * @returns {void}
     */
    setHas(has: CalHasFn): void {
        this.hasFn = has;
        this.sanSel();
        this.rnd();
        this.emit();
    }


    /**
     * Sets parts of the selection directly.
     * @param {SelInp} nxt
     * @returns {void}
     */
    setSel(nxt: SelInp): void {
        if (nxt.yrs) this.selYrs = setOf(nxt.yrs);
        if (nxt.mos) this.selMos = setOf(nxt.mos);
        if (nxt.dys) this.selDys = setOf(this.fltDys(nxt.dys));

        this.sanSel();
        this.rnd();
        this.emit();
    }


    /**
     * Raw delegated has() call with explicit sel + ctx.
     * @param {CalLvl} lvl
     * @param {number} val
     * @param {CalSel} sel
     * @param {CalCtx} ctx
     * @returns {boolean}
     */
    protected rawHas(lvl: CalLvl, val: number, sel: CalSel, ctx: CalCtx): boolean {
        return this.hasFn({
            lvl,
            val,
            sel,
            ctx
        });
    }


    /**
     * Convenience has() using the current selection.
     * @param {CalLvl} lvl
     * @param {number} val
     * @param {CalCtx} ctx
     * @returns {boolean}
     */
    has(lvl: CalLvl, val: number, ctx: CalCtx = {}): boolean {
        return this.rawHas(lvl, val, this.getSel(), ctx);
    }


    /**
     * Reset back to the seeded selection.
     * @returns {void}
     */
    rst(): void {
        this.seedSel();
        this.rnd();
        this.emit();
    }


    /**
     * Clears everything.
     * @returns {void}
     */
    clr(): void {
        this.selYrs.clear();
        this.selMos.clear();
        this.selDys.clear();
        this.sanSel();
        this.rnd();
        this.emit();
    }


    /**
     * Re-sanitise and redraw without emitting.
     * @returns {void}
     */
    refresh(): void {
        this.sanSel();
        this.rnd();
    }


    /**
     * Picks the underlying bag for a level.
     * @param {CalLvl} lvl
     * @returns {Set<number>}
     */
    protected bag(lvl: CalLvl): Set<number> {
        if (lvl === "yr") return this.selYrs;
        if (lvl === "mo") return this.selMos;
        return this.selDys;
    }


    /**
     * Filters day values against allowed-day cfg when needed.
     * @param {Iterable<number>} src
     * @returns {readonly number[]}
     */
    protected fltDys(src: Iterable<number>): readonly number[] {
        const vals = Array.from(src);
        if (!this.alwDys) return vals;

        return vals.filter((dy) => this.alwDys?.has(dy) ?? false);
    }


    /**
     * Visible years that actually have content under the current has fn.
     * @returns {readonly number[]}
     */
    protected visYrs(): readonly number[] {
        return this.allYrs.filter((yr) =>
            this.rawHas("yr", yr, selOf([yr], [], []), { yr })
        );
    }


    /**
     * Visible months for the given year set.
     * @param {Iterable<number>} yrs
     * @returns {readonly number[]}
     */
    protected visMos(yrs: Iterable<number>): readonly number[] {
        const yrBag = new Set<number>(yrs);
        if (yrBag.size === 0) return [];

        const yrSel = Array.from(yrBag);

        return this.allMos.filter((mo) =>
            this.rawHas("mo", mo, selOf(yrSel, [mo], []), { mo })
        );
    }


    /**
     * Cartesian pairs of years x months, in display order.
     * @param {Iterable<number>} yrs
     * @param {Iterable<number>} mos
     * @returns {readonly Readonly<{ yr: number; mo: number }>[]}
     */
    protected pairs(
        yrs: Iterable<number>,
        mos: Iterable<number>
    ): readonly Readonly<{ yr: number; mo: number }>[] {
        const yrVals = Array.from(yrs).sort((a, b) => b - a);
        const moVals = Array.from(mos).sort((a, b) => a - b);
        const out: Array<Readonly<{ yr: number; mo: number }>> = [];

        for (const yr of yrVals) {
            for (const mo of moVals) {
                out.push({ yr, mo });
            }
        }

        return out;
    }


    /**
     * Largest valid day count across the selected year/month pairs.
     * @param {Iterable<number>} yrs
     * @param {Iterable<number>} mos
     * @returns {number}
     */
    protected maxDy(yrs: Iterable<number>, mos: Iterable<number>): number {
        const pairs = this.pairs(yrs, mos);
        let max = 0;

        for (const pair of pairs) {
            const cnt = dyCnt(pair.yr, pair.mo);
            if (cnt > max) max = cnt;
        }

        return max;
    }


    /**
     * Seeds the initial selection from now if possible, else the first visible slots.
     * @returns {void}
     */
    protected seedSel(): void {
        const visYrs = this.visYrs();
        const nowYr = this.now.getFullYear();
        const nowMo = this.now.getMonth() + 1;

        this.selYrs.clear();
        this.selMos.clear();
        this.selDys.clear();

        if (visYrs.length === 0) return;

        const defYr = visYrs.includes(nowYr) ? nowYr : visYrs[0];
        this.selYrs.add(defYr);

        const visMos = this.visMos([defYr]);
        if (visMos.length === 0) return;

        const defMo = visMos.includes(nowMo) ? nowMo : visMos[0];
        this.selMos.add(defMo);
    }


    /**
     * Cleans selection so it only contains values that still make sense.
     * @returns {void}
     */
    protected sanSel(): void {
        const visYrs = new Set<number>(this.visYrs());

        for (const yr of Array.from(this.selYrs)) {
            if (!visYrs.has(yr)) this.selYrs.delete(yr);
        }

        if (this.selYrs.size === 0) {
            this.selMos.clear();
            this.selDys.clear();
            return;
        }

        const visMos = new Set<number>(this.visMos(this.selYrs));

        for (const mo of Array.from(this.selMos)) {
            if (!visMos.has(mo)) this.selMos.delete(mo);
        }

        if (this.selMos.size === 0) {
            this.selDys.clear();
            return;
        }

        const maxDy = this.maxDy(this.selYrs, this.selMos);

        for (const dy of Array.from(this.selDys)) {
            const badByCnt = dy < 1 || dy > maxDy;
            const badByCfg = this.alwDys ? !this.alwDys.has(dy) : false;

            if (badByCnt || badByCfg) this.selDys.delete(dy);
        }
    }


    /**
     * Toggles one value in the current selection.
     * @param {CalLvl} lvl
     * @param {number} val
     * @returns {void}
     */
    protected tglVal(lvl: CalLvl, val: number): void {
        if (lvl === "dy" && this.alwDys && !this.alwDys.has(val)) return;

        const bag = this.bag(lvl);

        if (bag.has(val)) {
            bag.delete(val);
        } else {
            bag.add(val);
        }

        if (lvl === "yr" && this.selYrs.size === 0) {
            this.selMos.clear();
            this.selDys.clear();
        }

        if (lvl === "mo" && this.selMos.size === 0) {
            this.selDys.clear();
        }

        this.sanSel();
        this.rnd();
        this.emit();
    }


    /**
     * Emits selection change if a callback exists.
     * @returns {void}
     */
    protected emit(): void {
        this.onChg?.(this.getSel());
    }

}
