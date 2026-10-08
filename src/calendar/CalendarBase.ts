import * as helpers from "../helpers.ts";
import { mos, ordNums, ordYrs, setOf } from "./model.ts";
import type { CalCfg, CalHasFn, CalLvl, CalSct, CalSel } from "./types.ts";

export abstract class CalendarBase {

    protected readonly host: HTMLElement;
    protected readonly ttl: string;
    protected readonly now: Date;
    protected readonly hnd: (ev: Event) => void;
    protected readonly keyHnd: (ev: KeyboardEvent) => void;
    protected readonly allYrs: number[];
    protected readonly allMos: number[];
    protected readonly alwDys: Set<number> | null;
    protected selYrs: Set<number>;
    protected selMos: Set<number>;
    protected selDys: Set<number>;
    protected hasFn: CalHasFn;
    protected onChg: ((sel: CalSel) => void) | null;
    protected opn: Record<CalSct, boolean>;
    protected rootOpen: boolean;
    protected isOn: boolean;


    protected abstract seedSel(): void;
    protected abstract rnd(): void;
    protected abstract emit(): void;
    protected abstract tglRoot(): void;
    protected abstract tglSct(section: CalSct): void;
    protected abstract tglVal(level: CalLvl, value: number): void;
    abstract rst(): void;
    abstract clr(): void;

    /**
     * Sets the controller up and wires the event handlers.
     * @param {CalCfg} cfg
     */
    constructor(cfg: CalCfg) {
        const now = cfg.now ?? new Date();

        this.host = cfg.host;
        this.ttl = cfg.ttl ?? "Browse by date";
        this.now = now;

        this.allYrs = ordYrs(cfg.yrs);
        this.allMos = ordNums(cfg.mos ?? mos());
        this.alwDys = cfg.dys ? setOf(cfg.dys) : null;

        this.selYrs = setOf([]);
        this.selMos = setOf([]);
        this.selDys = setOf([]);

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

        /**
         * Main click handler. Looks for whatever data attr got clicked and routes it.
         * @param {Event} ev
         * @returns {void}
         */
        this.hnd = (ev: Event): void => {
            const trg = ev.target;
            if (!(trg instanceof Element)) return;

            if (trg.closest<HTMLElement>("[data-cal-act='rst']")) {
                ev.preventDefault();
                ev.stopPropagation();
                this.rst();
                return;
            }

            if (trg.closest<HTMLElement>("[data-cal-act='clr']")) {
                ev.preventDefault();
                ev.stopPropagation();
                this.clr();
                return;
            }

            if (trg.closest<HTMLElement>("[data-cal-root-toggle]")) {
                ev.preventDefault();
                ev.stopPropagation();
                this.tglRoot();
                return;
            }

            const sctBtn = trg.closest<HTMLElement>("[data-cal-sct]");
            const sctKey = sctBtn?.dataset.calSct as CalSct | undefined;

            if (sctBtn && !sctKey) return;

            if (sctBtn && sctKey) {
                ev.preventDefault();
                ev.stopPropagation();
                this.tglSct(sctKey);
                return;
            }

            const itm = trg.closest<HTMLElement>("[data-cal-lvl][data-cal-val]");
            const lvl = itm?.dataset.calLvl as CalLvl | undefined;
            const raw = itm?.dataset.calVal ?? "";
            const val = Number(raw);

            if (itm && (!lvl || Number.isNaN(val))) return;

            if (itm && lvl) {
                ev.preventDefault();
                ev.stopPropagation();
                this.tglVal(lvl, val);
                return;
            }

            const rootHdr = trg.closest<HTMLElement>("[data-cal-root-header]");
            if (rootHdr && helpers.eventHasBlockedControl(ev)) return;

            if (rootHdr) {
                this.tglRoot();
                return;
            }

            const sctHdr = trg.closest<HTMLElement>("[data-cal-sct-header]");
            const headerKey =
                sctHdr?.dataset.calSctHeader as CalSct | undefined;

            if (sctHdr && helpers.eventHasBlockedControl(ev)) return;
            if (sctHdr && !headerKey) return;
            if (sctHdr && headerKey) this.tglSct(headerKey);
        };

        /**
         * Keyboard handler for row headers only.
         * @param {KeyboardEvent} ev
         * @returns {void}
         */
        this.keyHnd = (ev: KeyboardEvent): void => {
            const trg = ev.target;
            if (!(trg instanceof HTMLElement)) return;
            if (ev.key !== "Enter" && ev.key !== " ") return;

            if (trg.matches("[data-cal-root-header]")) {
                ev.preventDefault();
                this.tglRoot();
                return;
            }

            if (!trg.matches("[data-cal-sct-header]")) return;

            const key = trg.dataset.calSctHeader as CalSct | undefined;
            if (!key) return;

            ev.preventDefault();
            this.tglSct(key);
        };
    }


    /**
     * Mounts the thing and emits initial sel.
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
     * Unhooks listeners and wipes the host.
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

}
