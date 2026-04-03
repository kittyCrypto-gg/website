import { render2Frag } from "./reactHelpers.tsx";

export type CalLvl = "yr" | "mo" | "dy";

export type CalSel = Readonly<{
    yrs: ReadonlySet<number>;
    mos: ReadonlySet<number>;
    dys: ReadonlySet<number>;
}>;

export type CalCtx = Readonly<{
    yr?: number;
    mo?: number;
    dy?: number;
}>;

export type CalHasArg = Readonly<{
    lvl: CalLvl;
    val: number;
    sel: CalSel;
    ctx: CalCtx;
}>;

export type CalHasFn = (arg: CalHasArg) => boolean;

export type CalCfg = Readonly<{
    host: HTMLElement;
    yrs: readonly number[];
    mos?: readonly number[];
    dys?: readonly number[];
    ttl?: string;
    now?: Date;
    has?: CalHasFn;
    onChg?: (sel: CalSel) => void;
}>;

type CalSct = "yrs" | "mos" | "dys";

type SelInp = Readonly<{
    yrs?: readonly number[];
    mos?: readonly number[];
    dys?: readonly number[];
}>;

type DyPad = Readonly<{
    kind: "pad";
    key: string;
}>;

type DyBtn = Readonly<{
    kind: "dy";
    key: string;
    yr: number;
    mo: number;
    dy: number;
    sel: boolean;
    has: boolean;
}>;

type DyCell = DyPad | DyBtn;

type DyCalVw = Readonly<{
    kind: "cal";
    key: string;
    ttl: string;
    wk: readonly string[];
    cells: readonly DyCell[];
}>;

type DyGridItm = Readonly<{
    key: string;
    dy: number;
    sel: boolean;
    has: boolean;
}>;

type DyGridVw = Readonly<{
    kind: "grid";
    ttl: string;
    cnt: number;
    items: readonly DyGridItm[];
}>;

type DyVw = DyCalVw | DyGridVw;

type CalVw = Readonly<{
    ttl: string;
    rootOpen: boolean;
    hasSel: boolean;
    yrs: readonly number[];
    mos: readonly number[];
    sel: CalSel;
    open: Readonly<Record<CalSct, boolean>>;
    canMos: boolean;
    canDys: boolean;
    dyVw: DyVw | null;
}>;

/**
 * @returns {readonly number[]}
 */
function mkMos(): readonly number[] {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
}

/**
 * @returns {readonly string[]}
 */
function mkWk(): readonly string[] {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
}

/**
 * @param {Iterable<number>} src
 * @returns {Set<number>}
 */
function mkSet(src: Iterable<number>): Set<number> {
    return new Set<number>(src);
}

/**
 * @param {Iterable<number>} yrs
 * @param {Iterable<number>} mos
 * @param {Iterable<number>} dys
 * @returns {CalSel}
 */
function mkSel(
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

/**
 * @param {readonly number[]} src
 * @returns {number[]}
 */
function yrOrd(src: readonly number[]): number[] {
    return Array.from(new Set<number>(src)).sort((a, b) => b - a);
}

/**
 * @param {readonly number[]} src
 * @returns {number[]}
 */
function nOrd(src: readonly number[]): number[] {
    return Array.from(new Set<number>(src)).sort((a, b) => a - b);
}

/**
 * @param {number} mo
 * @returns {string}
 */
function moLbl(mo: number): string {
    return new Date(2000, mo - 1, 1).toLocaleString("en-GB", { month: "short" });
}

/**
 * @param {number} yr
 * @param {number} mo
 * @returns {string}
 */
function moTtl(yr: number, mo: number): string {
    return new Date(yr, mo - 1, 1).toLocaleString("en-GB", {
        month: "long",
        year: "numeric"
    });
}

/**
 * @param {number} yr
 * @param {number} mo
 * @returns {number}
 */
function moDyCnt(yr: number, mo: number): number {
    return new Date(yr, mo, 0).getDate();
}

/**
 * @param {number} yr
 * @param {number} mo
 * @returns {number}
 */
function moFstWk(yr: number, mo: number): number {
    return new Date(yr, mo - 1, 1).getDay();
}

/**
 * @param {Set<number>} src
 * @returns {ReadonlySet<number>}
 */
function roSet(src: Set<number>): ReadonlySet<number> {
    return new Set<number>(src);
}

/**
 * @param {CalSel} sel
 * @returns {boolean}
 */
function hasSel(sel: CalSel): boolean {
    return sel.yrs.size > 0 || sel.mos.size > 0 || sel.dys.size > 0;
}

/**
 * @param {CalLvl} lvl
 * @param {number} val
 * @param {boolean} sel
 * @param {boolean} has
 * @param {string} txt
 * @returns {JSX.Element}
 */
function CalItm({
    lvl,
    val,
    sel,
    has,
    txt
}: Readonly<{
    lvl: CalLvl;
    val: number;
    sel: boolean;
    has: boolean;
    txt: string;
}>): JSX.Element {
    return (
        <button
            type="button"
            className="cal__itm"
            data-cal-lvl={lvl}
            data-cal-val={String(val)}
            data-sel={sel ? "1" : "0"}
            data-has={has ? "1" : "0"}
            aria-pressed={sel ? "true" : "false"}
            aria-label={`${txt}, ${has ? "has content" : "empty"}`}
            title={has ? `${txt} has content` : `${txt} is empty`}
        >
            <span className="cal__itmTxt">{txt}</span>
            <span className="cal__itmStat" aria-hidden="true">
                {has ? "•" : "0"}
            </span>
        </button>
    );
}

/**
 * @param {DyCell} cell
 * @returns {JSX.Element}
 */
function CalDyCell({ cell }: Readonly<{ cell: DyCell }>): JSX.Element {
    if (cell.kind === "pad") {
        return <span className="cal__dyPad" aria-hidden="true" />;
    }

    const dtLbl = `${cell.dy} ${moLbl(cell.mo)} ${cell.yr}`;

    return (
        <button
            type="button"
            className="cal__itm cal__itm--dy"
            data-cal-lvl="dy"
            data-cal-val={String(cell.dy)}
            data-cal-yr={String(cell.yr)}
            data-cal-mo={String(cell.mo)}
            data-sel={cell.sel ? "1" : "0"}
            data-has={cell.has ? "1" : "0"}
            aria-pressed={cell.sel ? "true" : "false"}
            aria-label={`${dtLbl}, ${cell.has ? "has content" : "empty"}`}
            title={cell.has ? `${dtLbl} has content` : `${dtLbl} is empty`}
        >
            <span className="cal__itmTxt">{cell.dy}</span>
            <span className="cal__itmStat" aria-hidden="true">
                {cell.has ? "•" : "0"}
            </span>
        </button>
    );
}

/**
 * @param {DyCalVw} vw
 * @returns {JSX.Element}
 */
function CalDyCal({ vw }: Readonly<{ vw: DyCalVw }>): JSX.Element {
    return (
        <section className="cal__mo" aria-label={vw.ttl}>
            <header className="cal__moHdr">
                <h3 className="cal__moTtl">{vw.ttl}</h3>
            </header>

            <div className="cal__wkRow" aria-hidden="true">
                {vw.wk.map((lbl) => (
                    <span key={`${vw.key}-${lbl}`} className="cal__wkItm">
                        {lbl}
                    </span>
                ))}
            </div>

            <div className="cal__dyGrid">
                {vw.cells.map((cell) => (
                    <CalDyCell key={cell.key} cell={cell} />
                ))}
            </div>
        </section>
    );
}

/**
 * @param {DyGridVw} vw
 * @returns {JSX.Element}
 */
function CalDyGrid({ vw }: Readonly<{ vw: DyGridVw }>): JSX.Element {
    return (
        <section className="cal__dyBulk" aria-label={vw.ttl}>
            <header className="cal__moHdr">
                <h3 className="cal__moTtl">{vw.ttl}</h3>
            </header>

            <div className="cal__itmGrid cal__itmGrid--dys">
                {vw.items.map((itm) => (
                    <CalItm
                        key={itm.key}
                        lvl="dy"
                        val={itm.dy}
                        sel={itm.sel}
                        has={itm.has}
                        txt={String(itm.dy)}
                    />
                ))}
            </div>
        </section>
    );
}

/**
 * @param {string} ttl
 * @param {CalSct} sct
 * @param {boolean} open
 * @param {number} cnt
 * @param {JSX.Element | null} body
 * @returns {JSX.Element}
 */
function CalSctBlk({
    ttl,
    sct,
    open,
    cnt,
    body
}: Readonly<{
    ttl: string;
    sct: CalSct;
    open: boolean;
    cnt: number;
    body: JSX.Element | null;
}>): JSX.Element {
    return (
        <section className="cal__sct" data-cal-sct-root={sct} data-open={open ? "1" : "0"}>
            <div className="cal__sctHdr">
                <button
                    type="button"
                    className="cal__sctTgl"
                    data-cal-sct={sct}
                    aria-expanded={open ? "true" : "false"}
                >
                    <span className="cal__sctTtl">{ttl}</span>
                    <span className="cal__sctMeta">
                        <span className="cal__sctCnt">{cnt}</span>
                        <span className="cal__sctIcn">{open ? "−" : "+"}</span>
                    </span>
                </button>
            </div>

            <div className="cal__sctBody" aria-hidden={open ? "false" : "true"}>
                <div className="cal__sctBodyInner">{body}</div>
            </div>
        </section>
    );
}

/**
 * @param {CalSel} sel
 * @param {boolean} showClr
 * @returns {JSX.Element}
 */
function CalSelBar({
    sel,
    showClr
}: Readonly<{
    sel: CalSel;
    showClr: boolean;
}>): JSX.Element {
    const yrs = Array.from(sel.yrs).sort((a, b) => b - a);
    const mos = Array.from(sel.mos).sort((a, b) => a - b);
    const dys = Array.from(sel.dys).sort((a, b) => a - b);

    return (
        <div className="cal__selBar">
            <div className="cal__selGrp">
                {yrs.map((yr) => (
                    <button
                        key={`yr-${yr}`}
                        type="button"
                        className="cal__selPill"
                        data-cal-lvl="yr"
                        data-cal-val={String(yr)}
                        title={`Remove year ${yr}`}
                    >
                        <span className="cal__selV">{yr}</span>
                    </button>
                ))}

                {mos.map((mo) => (
                    <button
                        key={`mo-${mo}`}
                        type="button"
                        className="cal__selPill"
                        data-cal-lvl="mo"
                        data-cal-val={String(mo)}
                        title={`Remove month ${moLbl(mo)}`}
                    >
                        <span className="cal__selV">{moLbl(mo)}</span>
                    </button>
                ))}

                {dys.map((dy) => (
                    <button
                        key={`dy-${dy}`}
                        type="button"
                        className="cal__selPill"
                        data-cal-lvl="dy"
                        data-cal-val={String(dy)}
                        title={`Remove day ${dy}`}
                    >
                        <span className="cal__selV">{dy}</span>
                    </button>
                ))}
            </div>

            <div className="cal__ctlGrp">
                <button type="button" className="cal__rst" data-cal-act="rst">
                    Reset
                </button>

                {showClr ? (
                    <button type="button" className="cal__clr" data-cal-act="clr">
                        Clear all
                    </button>
                ) : null}
            </div>
        </div>
    );
}

/**
 * @param {CalVw} vw
 * @returns {JSX.Element}
 */
function CalRoot({ vw }: Readonly<{ vw: CalVw }>): JSX.Element {
    const yrCnt = vw.sel.yrs.size;
    const moCnt = vw.sel.mos.size;
    const dyCnt = vw.sel.dys.size;

    return (
        <section
            className="cal"
            aria-label="Calendar filters"
            data-open={vw.rootOpen ? "1" : "0"}
        >
            <header
                className="cal__hdr"
                data-cal-act="tgl-root"
                role="button"
                tabIndex={0}
                aria-expanded={vw.rootOpen ? "true" : "false"}
                title={vw.rootOpen ? "Collapse filter" : "Expand filter"}
            >
                <div className="cal__ttlWrap">
                    <span className="cal__eyebrow"></span>
                    <h2 className="cal__ttl">{vw.ttl}</h2>
                </div>

                <span className="cal__rootTgl" aria-hidden="true">
                    {vw.rootOpen ? "↘️" : "➡️"}
                </span>
            </header>

            <CalSelBar sel={vw.sel} showClr={vw.hasSel} />

            <div className="cal__rootBody" aria-hidden={vw.rootOpen ? "false" : "true"}>
                <div className="cal__rootBodyInner">
                    <div className="cal__grid">
                        <CalSctBlk
                            ttl="Years"
                            sct="yrs"
                            open={vw.open.yrs}
                            cnt={yrCnt}
                            body={
                                <div className="cal__itmGrid cal__itmGrid--yrs">
                                    {vw.yrs.map((yr) => (
                                        <CalItm
                                            key={`yr-${yr}`}
                                            lvl="yr"
                                            val={yr}
                                            sel={vw.sel.yrs.has(yr)}
                                            has={true}
                                            txt={String(yr)}
                                        />
                                    ))}
                                </div>
                            }
                        />

                        <CalSctBlk
                            ttl="Months"
                            sct="mos"
                            open={vw.open.mos}
                            cnt={moCnt}
                            body={
                                vw.canMos ? (
                                    <div className="cal__itmGrid cal__itmGrid--mos">
                                        {vw.mos.map((mo) => (
                                            <CalItm
                                                key={`mo-${mo}`}
                                                lvl="mo"
                                                val={mo}
                                                sel={vw.sel.mos.has(mo)}
                                                has={true}
                                                txt={moLbl(mo)}
                                            />
                                        ))}
                                    </div>
                                ) : null
                            }
                        />

                        <CalSctBlk
                            ttl="Days"
                            sct="dys"
                            open={vw.open.dys}
                            cnt={dyCnt}
                            body={
                                vw.canDys && vw.dyVw ? (
                                    vw.dyVw.kind === "cal" ? (
                                        <CalDyCal vw={vw.dyVw} />
                                    ) : (
                                        <CalDyGrid vw={vw.dyVw} />
                                    )
                                ) : null
                            }
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}

export class CalCtrl {
    private readonly host: HTMLElement;
    private readonly ttl: string;
    private readonly now: Date;
    private readonly hnd: (ev: Event) => void;
    private readonly keyHnd: (ev: KeyboardEvent) => void;
    private readonly allYrs: number[];
    private readonly allMos: number[];
    private readonly alwDys: Set<number> | null;
    private selYrs: Set<number>;
    private selMos: Set<number>;
    private selDys: Set<number>;
    private hasFn: CalHasFn;
    private onChg: ((sel: CalSel) => void) | null;
    private opn: Record<CalSct, boolean>;
    private rootOpen: boolean;
    private isOn: boolean;

    constructor(cfg: CalCfg) {
        const now = cfg.now ?? new Date();

        this.host = cfg.host;
        this.ttl = cfg.ttl ?? "Browse by date";
        this.now = now;

        this.allYrs = yrOrd(cfg.yrs);
        this.allMos = nOrd(cfg.mos ?? mkMos());
        this.alwDys = cfg.dys ? mkSet(cfg.dys) : null;

        this.selYrs = mkSet([]);
        this.selMos = mkSet([]);
        this.selDys = mkSet([]);

        this.hasFn = cfg.has ?? (() => false);
        this.onChg = cfg.onChg ?? null;

        this.opn = {
            yrs: true,
            mos: true,
            dys: false
        };

        this.rootOpen = false;
        this.isOn = false;

        this.seedSel();

        this.hnd = (ev: Event): void => {
            const trg = ev.target;
            if (!(trg instanceof Element)) return;

            const rootTgl = trg.closest<HTMLElement>("[data-cal-act='tgl-root']");
            if (rootTgl) {
                this.tglRoot();
                return;
            }

            const rst = trg.closest<HTMLElement>("[data-cal-act='rst']");
            if (rst) {
                this.rst();
                return;
            }

            const clr = trg.closest<HTMLElement>("[data-cal-act='clr']");
            if (clr) {
                this.clr();
                return;
            }

            const sct = trg.closest<HTMLElement>("[data-cal-sct]");
            if (sct) {
                const key = sct.dataset.calSct as CalSct | undefined;
                if (!key) return;

                this.tglSct(key);
                return;
            }

            const itm = trg.closest<HTMLElement>("[data-cal-lvl][data-cal-val]");
            if (!itm) return;

            const lvl = itm.dataset.calLvl as CalLvl | undefined;
            const raw = itm.dataset.calVal ?? "";
            const val = Number(raw);

            if (!lvl || Number.isNaN(val)) return;
            this.tglVal(lvl, val);
        };

        this.keyHnd = (ev: KeyboardEvent): void => {
            const trg = ev.target;
            if (!(trg instanceof Element)) return;

            const rootTgl = trg.closest<HTMLElement>("[data-cal-act='tgl-root']");
            if (!rootTgl) return;
            if (ev.key !== "Enter" && ev.key !== " ") return;

            ev.preventDefault();
            this.tglRoot();
        };
    }

    /**
     * @returns {void}
     */
    init(): void {
        if (!this.isOn) {
            this.host.addEventListener("click", this.hnd);
            this.host.addEventListener("keydown", this.keyHnd);
            this.isOn = true;
        }

        this.host.classList.add("cal-mnt");
        this.rnd();
        this.emit();
    }

    /**
     * @returns {CalSel}
     */
    getSel(): CalSel {
        return {
            yrs: roSet(this.selYrs),
            mos: roSet(this.selMos),
            dys: roSet(this.selDys)
        };
    }

    /**
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
     * @param {SelInp} nxt
     * @returns {void}
     */
    setSel(nxt: SelInp): void {
        if (nxt.yrs) this.selYrs = mkSet(nxt.yrs);
        if (nxt.mos) this.selMos = mkSet(nxt.mos);
        if (nxt.dys) this.selDys = mkSet(this.fltDys(nxt.dys));

        this.sanSel();
        this.rnd();
        this.emit();
    }

    /**
     * @param {CalLvl} lvl
     * @param {number} val
     * @param {CalSel} sel
     * @param {CalCtx} ctx
     * @returns {boolean}
     */
    private rawHas(lvl: CalLvl, val: number, sel: CalSel, ctx: CalCtx): boolean {
        return this.hasFn({
            lvl,
            val,
            sel,
            ctx
        });
    }

    /**
     * @param {CalLvl} lvl
     * @param {number} val
     * @param {CalCtx} [ctx]
     * @returns {boolean}
     */
    has(lvl: CalLvl, val: number, ctx: CalCtx = {}): boolean {
        return this.rawHas(lvl, val, this.getSel(), ctx);
    }

    /**
     * @returns {void}
     */
    rst(): void {
        this.seedSel();
        this.rnd();
        this.emit();
    }

    /**
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
     * @returns {void}
     */
    refresh(): void {
        this.sanSel();
        this.rnd();
    }

    /**
     * @returns {void}
     */
    destroy(): void {
        if (this.isOn) {
            this.host.removeEventListener("click", this.hnd);
            this.host.removeEventListener("keydown", this.keyHnd);
            this.isOn = false;
        }

        this.host.classList.remove("cal-mnt");
        this.host.replaceChildren();
    }

    /**
     * @param {CalLvl} lvl
     * @returns {Set<number>}
     */
    private pickSet(lvl: CalLvl): Set<number> {
        if (lvl === "yr") return this.selYrs;
        if (lvl === "mo") return this.selMos;
        return this.selDys;
    }

    /**
     * @param {Iterable<number>} src
     * @returns {readonly number[]}
     */
    private fltDys(src: Iterable<number>): readonly number[] {
        const vals = Array.from(src);

        if (!this.alwDys) return vals;
        return vals.filter((dy) => this.alwDys?.has(dy) ?? false);
    }

    /**
     * @returns {readonly number[]}
     */
    private mkVisYrs(): readonly number[] {
        return this.allYrs.filter((yr) =>
            this.rawHas("yr", yr, mkSel([yr], [], []), { yr })
        );
    }

    /**
     * @param {Iterable<number>} yrs
     * @returns {readonly number[]}
     */
    private mkVisMos(yrs: Iterable<number>): readonly number[] {
        const yrBag = new Set<number>(yrs);
        if (yrBag.size === 0) return [];

        const yrSel = Array.from(yrBag);

        return this.allMos.filter((mo) =>
            this.rawHas("mo", mo, mkSel(yrSel, [mo], []), { mo })
        );
    }

    /**
     * @param {Iterable<number>} yrs
     * @param {Iterable<number>} mos
     * @returns {readonly Readonly<{ yr: number; mo: number }>[]}
     */
    private mkPairs(
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
     * @param {Iterable<number>} yrs
     * @param {Iterable<number>} mos
     * @returns {number}
     */
    private mkMaxDy(yrs: Iterable<number>, mos: Iterable<number>): number {
        const pairs = this.mkPairs(yrs, mos);
        let max = 0;

        for (const pair of pairs) {
            const cnt = moDyCnt(pair.yr, pair.mo);
            if (cnt > max) max = cnt;
        }

        return max;
    }

    /**
     * @returns {void}
     */
    private seedSel(): void {
        const visYrs = this.mkVisYrs();
        const nowYr = this.now.getFullYear();
        const nowMo = this.now.getMonth() + 1;

        this.selYrs.clear();
        this.selMos.clear();
        this.selDys.clear();

        if (visYrs.length === 0) return;

        const defYr = visYrs.includes(nowYr) ? nowYr : visYrs[0];
        this.selYrs.add(defYr);

        const visMos = this.mkVisMos([defYr]);
        if (visMos.length === 0) return;

        const defMo = visMos.includes(nowMo) ? nowMo : visMos[0];
        this.selMos.add(defMo);
    }

    /**
     * @returns {void}
     */
    private sanSel(): void {
        const visYrs = new Set<number>(this.mkVisYrs());

        for (const yr of Array.from(this.selYrs)) {
            if (!visYrs.has(yr)) this.selYrs.delete(yr);
        }

        if (this.selYrs.size === 0) {
            this.selMos.clear();
            this.selDys.clear();
            return;
        }

        const visMos = new Set<number>(this.mkVisMos(this.selYrs));

        for (const mo of Array.from(this.selMos)) {
            if (!visMos.has(mo)) this.selMos.delete(mo);
        }

        if (this.selMos.size === 0) {
            this.selDys.clear();
            return;
        }

        const maxDy = this.mkMaxDy(this.selYrs, this.selMos);

        for (const dy of Array.from(this.selDys)) {
            const badByCnt = dy < 1 || dy > maxDy;
            const badByCfg = this.alwDys ? !this.alwDys.has(dy) : false;

            if (badByCnt || badByCfg) this.selDys.delete(dy);
        }
    }

    /**
     * @param {HTMLElement} body
     * @param {() => void} setOpenState
     * @param {boolean} open
     * @returns {void}
     */
    private playTgl(body: HTMLElement, setOpenState: () => void, open: boolean): void {
        const onEnd = (ev: TransitionEvent): void => {
            if (ev.target !== body || ev.propertyName !== "max-height") return;
            if (open) {
                body.style.maxHeight = "none";
            }
        };

        if (open) {
            body.style.maxHeight = "0px";
            setOpenState();
            const nxtH = body.scrollHeight;
            body.removeEventListener("transitionend", onEnd);
            body.addEventListener("transitionend", onEnd, { once: true });
            window.requestAnimationFrame(() => {
                body.style.maxHeight = `${nxtH}px`;
            });
            return;
        }

        const curH = body.scrollHeight;
        body.style.maxHeight = `${curH}px`;
        void body.offsetHeight;
        setOpenState();
        window.requestAnimationFrame(() => {
            body.style.maxHeight = "0px";
        });
    }

    /**
     * @returns {void}
     */
    private tglRoot(): void {
        const root = this.host.querySelector<HTMLElement>(".cal");
        const hdr = this.host.querySelector<HTMLElement>(".cal__hdr");
        const body = this.host.querySelector<HTMLElement>(".cal__rootBody");
        const icn = this.host.querySelector<HTMLElement>(".cal__rootTgl");

        if (!root || !hdr || !body || !icn) {
            this.rootOpen = !this.rootOpen;
            this.rnd();
            return;
        }

        const nxtOpen = !this.rootOpen;

        this.playTgl(
            body,
            () => {
                this.rootOpen = nxtOpen;
                root.dataset.open = nxtOpen ? "1" : "0";
                hdr.setAttribute("aria-expanded", nxtOpen ? "true" : "false");
                hdr.setAttribute("title", nxtOpen ? "Collapse filter" : "Expand filter");
                body.setAttribute("aria-hidden", nxtOpen ? "false" : "true");
                icn.textContent = nxtOpen ? "↘️" : "➡️";
            },
            nxtOpen
        );
    }

    /**
     * @param {CalSct} sct
     * @returns {void}
     */
    private tglSct(sct: CalSct): void {
        const box = this.host.querySelector<HTMLElement>(`.cal__sct[data-cal-sct-root="${sct}"]`);
        const btn = this.host.querySelector<HTMLElement>(`.cal__sctTgl[data-cal-sct="${sct}"]`);
        const body = box?.querySelector<HTMLElement>(".cal__sctBody") ?? null;
        const icn = btn?.querySelector<HTMLElement>(".cal__sctIcn") ?? null;

        if (!box || !btn || !body || !icn) {
            this.opn[sct] = !this.opn[sct];
            this.rnd();
            return;
        }

        const nxtOpen = !this.opn[sct];

        this.playTgl(
            body,
            () => {
                this.opn[sct] = nxtOpen;
                box.dataset.open = nxtOpen ? "1" : "0";
                btn.setAttribute("aria-expanded", nxtOpen ? "true" : "false");
                body.setAttribute("aria-hidden", nxtOpen ? "false" : "true");
                icn.textContent = nxtOpen ? "−" : "+";
            },
            nxtOpen
        );
    }

    /**
     * @param {CalLvl} lvl
     * @param {number} val
     * @returns {void}
     */
    private tglVal(lvl: CalLvl, val: number): void {
        if (lvl === "dy" && this.alwDys && !this.alwDys.has(val)) return;

        const bag = this.pickSet(lvl);

        if (bag.has(val)) bag.delete(val);
        else bag.add(val);

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
     * @returns {DyCalVw | null}
     */
    private mkDyCalVw(): DyCalVw | null {
        if (this.selYrs.size !== 1 || this.selMos.size !== 1) return null;

        const yr = Array.from(this.selYrs)[0];
        const mo = Array.from(this.selMos)[0];
        const fst = moFstWk(yr, mo);
        const cnt = moDyCnt(yr, mo);
        const cells: DyCell[] = [];

        for (let ix = 0; ix < fst; ix += 1) {
            cells.push({
                kind: "pad",
                key: `pad-${yr}-${mo}-${ix}`
            });
        }

        const sel = mkSel(this.selYrs, this.selMos, []);

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
            wk: mkWk(),
            cells
        };
    }

    /**
     * @returns {DyGridVw | null}
     */
    private mkDyGridVw(): DyGridVw | null {
        const pairs = this.mkPairs(this.selYrs, this.selMos);
        if (pairs.length === 0) return null;

        const maxDy = this.mkMaxDy(this.selYrs, this.selMos);
        if (maxDy === 0) return null;

        const items: DyGridItm[] = [];
        const sel = mkSel(this.selYrs, this.selMos, []);

        for (let dy = 1; dy <= maxDy; dy += 1) {
            if (this.alwDys && !this.alwDys.has(dy)) continue;

            const has = pairs.some((pair) => {
                if (dy > moDyCnt(pair.yr, pair.mo)) return false;
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
     * @returns {DyVw | null}
     */
    private mkDyVw(): DyVw | null {
        if (this.selYrs.size === 0 || this.selMos.size === 0) return null;

        if (this.selYrs.size === 1 && this.selMos.size === 1) {
            return this.mkDyCalVw();
        }

        return this.mkDyGridVw();
    }

    /**
     * @returns {CalVw}
     */
    private mkVw(): CalVw {
        const sel = this.getSel();
        const yrs = this.mkVisYrs();
        const mos = this.mkVisMos(this.selYrs);
        const canMos = this.selYrs.size > 0;
        const canDys = this.selYrs.size > 0 && this.selMos.size > 0;

        return {
            ttl: this.ttl,
            rootOpen: this.rootOpen,
            hasSel: hasSel(sel),
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

    /**
     * @returns {void}
     */
    private primeHeights(): void {
        const rootBody = this.host.querySelector<HTMLElement>(".cal__rootBody");
        if (rootBody) {
            rootBody.style.maxHeight = this.rootOpen ? "none" : "0px";
        }

        const scts = Array.from(this.host.querySelectorAll<HTMLElement>(".cal__sct"));
        scts.forEach((sct) => {
            const sctKey = sct.dataset.calSctRoot as CalSct | undefined;
            const body = sct.querySelector<HTMLElement>(".cal__sctBody");
            if (!sctKey || !body) return;

            body.style.maxHeight = this.opn[sctKey] ? "none" : "0px";
        });
    }

    /**
     * @returns {void}
     */
    private rnd(): void {
        const frag = render2Frag(<CalRoot vw={this.mkVw()} />);
        this.host.replaceChildren(frag);
        this.primeHeights();
    }

    /**
     * @returns {void}
     */
    private emit(): void {
        this.onChg?.(this.getSel());
    }
}