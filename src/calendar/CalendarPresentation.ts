import * as helpers from "../helpers.ts";
import { renderTglIco } from "./view.tsx";
import { updateCalendarDom } from "./domPatch.ts";
import { CalendarViewModel } from "./CalendarViewModel.ts";
import type { CalSct } from "./types.ts";

export class CalendarPresentation extends CalendarViewModel {
    /**
     * Toggles the whole root open/closed.
     * @returns {void}
     */
    protected tglRoot(): void {
        const root = this.host.querySelector<HTMLElement>(".cal");
        const hdr = this.host.querySelector<HTMLElement>(".cal__hdr");
        const body = this.host.querySelector<HTMLElement>(".cal__rootBody");
        const btn = this.host.querySelector<HTMLElement>(".cal__rootTgl");

        if (!root || !hdr || !body || !btn) {
            this.rootOpen = !this.rootOpen;
            this.rnd();
            return;
        }

        const nxtOpen = !this.rootOpen;

        helpers.animateCollapsibleOpen({
            root,
            body,
            header: hdr,
            toggle: btn,
            open: nxtOpen,
            renderIcon: renderTglIco,
            collapseLabel: "Collapse filter",
            expandLabel: "Expand filter",
            collapseTitle: "Collapse filter",
            expandTitle: "Expand filter",
            onLayout: null
        });

        this.rootOpen = nxtOpen;
    }


    /**
     * Toggles one section block.
     * @param {CalSct} sct
     * @returns {void}
     */
    protected tglSct(sct: CalSct): void {
        const box = this.host.querySelector<HTMLElement>(`.cal__sct[data-cal-sct-root="${sct}"]`);
        const hdr = box?.querySelector<HTMLElement>(".cal__sctHdr") ?? null;
        const btn = this.host.querySelector<HTMLElement>(`.cal__sctTgl[data-cal-sct="${sct}"]`);
        const body = box?.querySelector<HTMLElement>(".cal__sctBody") ?? null;

        if (!box || !hdr || !btn || !body) {
            this.opn[sct] = !this.opn[sct];
            this.rnd();
            return;
        }

        const nxtOpen = !this.opn[sct];
        const title = hdr.querySelector(".cal__sctTtl")?.textContent ?? "section";

        helpers.animateCollapsibleOpen({
            root: box,
            body,
            header: hdr,
            toggle: btn,
            open: nxtOpen,
            renderIcon: renderTglIco,
            collapseLabel: `Collapse ${title}`,
            expandLabel: `Expand ${title}`,
            collapseTitle: `Collapse ${title}`,
            expandTitle: `Expand ${title}`,
            onLayout: null
        });

        this.opn[sct] = nxtOpen;
    }


    /**
     * Resets max-height styles after a full rerender so the sections match open state.
     * @returns {void}
     */
    protected primeHeights(): void {
        const rootBody = this.host.querySelector<HTMLElement>(".cal__rootBody");
        if (rootBody) {
            rootBody.style.maxHeight = this.rootOpen ? "none" : "0px";
        }

        const scts = Array.from(this.host.querySelectorAll<HTMLElement>(".cal__sct"));

        /**
         * Syncs one section body's max-height to the current open state.
         * @param {HTMLElement} sct
         * @returns {void}
         */
        const syncSct = (sct: HTMLElement): void => {
            const sctKey = sct.dataset.calSctRoot as CalSct | undefined;
            const body = sct.querySelector<HTMLElement>(".cal__sctBody");
            if (!sctKey || !body) return;

            body.style.maxHeight = this.opn[sctKey] ? "none" : "0px";
        };

        scts.forEach(syncSct);
    }


    /**
     * Renders the current view into the host.
     * @returns {void}
     */
    protected rnd(): void {
        updateCalendarDom(this.host, this.mkVw());
        this.primeHeights();
    }

}
