import { CalendarSelection } from "./CalendarSelection.ts";
import { anySel, dyCnt, fstWk, moTtl, selOf, wk } from "./model.ts";
import type { CalVw, DyCalVw, DyCell, DyGridItm, DyGridVw, DyVw } from "./types.ts";

export abstract class CalendarViewModel extends CalendarSelection {
    /**
     * Day view as a real month calendar, only when exactly one year and one month are selected.
     * @returns {DyCalVw | null}
     */
    protected mkDyCalVw(): DyCalVw | null {
        if (this.selYrs.size !== 1 || this.selMos.size !== 1) return null;

        const yr = Array.from(this.selYrs)[0];
        const mo = Array.from(this.selMos)[0];
        const fst = fstWk(yr, mo);
        const cnt = dyCnt(yr, mo);
        const cells: DyCell[] = [];

        for (let ix = 0; ix < fst; ix += 1) {
            cells.push({
                kind: "pad",
                key: `pad-${yr}-${mo}-${ix}`
            });
        }

        const sel = selOf(this.selYrs, this.selMos, []);

        for (let dy = 1; dy <= cnt; dy += 1) {
            cells.push({
                kind: "dy",
                key: `dy-${yr}-${mo}-${dy}`,
                yr,
                mo,
                dy,
                sel: this.selDys.has(dy),
                has: this.rawHas("dy", dy, sel, { yr, mo, dy })
            });
        }

        const rem = cells.length % 7;
        const endPad = rem === 0 ? 0 : 7 - rem;

        for (let ix = 0; ix < endPad; ix += 1) {
            cells.push({
                kind: "pad",
                key: `pad-end-${yr}-${mo}-${ix}`
            });
        }

        return {
            kind: "cal",
            key: `${yr}-${mo}`,
            ttl: moTtl(yr, mo),
            wk: wk(),
            cells
        };
    }


    /**
     * Day view as a flat grid across multiple selected months/years.
     * @returns {DyGridVw | null}
     */
    protected mkDyGridVw(): DyGridVw | null {
        const pairs = this.pairs(this.selYrs, this.selMos);
        if (pairs.length === 0) return null;

        const maxDy = this.maxDy(this.selYrs, this.selMos);
        if (maxDy === 0) return null;

        const items: DyGridItm[] = [];
        const sel = selOf(this.selYrs, this.selMos, []);

        for (let dy = 1; dy <= maxDy; dy += 1) {
            if (this.alwDys && !this.alwDys.has(dy)) continue;

            const has = pairs.some((pair) => {
                if (dy > dyCnt(pair.yr, pair.mo)) return false;

                return this.rawHas("dy", dy, sel, {
                    yr: pair.yr,
                    mo: pair.mo,
                    dy
                });
            });

            items.push({
                key: `dy-grid-${dy}`,
                dy,
                sel: this.selDys.has(dy),
                has
            });
        }

        return {
            kind: "grid",
            ttl: "Days",
            cnt: items.length,
            items
        };
    }


    /**
     * Picks whichever day view shape fits the current selection.
     * @returns {DyVw | null}
     */
    protected mkDyVw(): DyVw | null {
        if (this.selYrs.size === 0 || this.selMos.size === 0) return null;
        if (this.selYrs.size === 1 && this.selMos.size === 1) return this.mkDyCalVw();

        return this.mkDyGridVw();
    }


    /**
     * Builds the full render view model.
     * @returns {CalVw}
     */
    protected mkVw(): CalVw {
        const sel = this.getSel();
        const yrs = this.visYrs();
        const mos = this.visMos(this.selYrs);
        const canMos = this.selYrs.size > 0;
        const canDys = this.selYrs.size > 0 && this.selMos.size > 0;

        return {
            ttl: this.ttl,
            rootOpen: this.rootOpen,
            hasSel: anySel(sel),
            yrs,
            mos,
            sel,
            open: {
                yrs: this.opn.yrs,
                mos: this.opn.mos,
                dys: this.opn.dys
            },
            canMos,
            canDys,
            dyVw: canDys ? this.mkDyVw() : null
        };
    }

}
