import { KeyboardFoundation } from "./KeyboardFoundation.ts";

/** Keyboard sizing, responsive key grids, viewport placement and scheduling. */
export class KeyboardLayout extends KeyboardFoundation {
    /**
     * Tiny number clamp.
     * @param {number} n
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    __clamp(n: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, n));
    }


    /**
     * Writes a px css var onto the toolbar root.
     * @param {string} name
     * @param {number} v
     * @returns {void}
     */
    __setPxVar(name: string, v: number): void {
        this.bar!.style.setProperty(name, `${v.toFixed(2)}px`);
    }


    /**
     * Adds stacked labels when button content no longer fits in one row.
     * @returns {void}
     */
    __stackIfNeeded(): void {
        const buttons = this.bar!.querySelectorAll<HTMLButtonElement>("button");

        for (const btn of buttons) {
            btn.classList.remove("stacked");

            const icon = btn.querySelector(".key-icon") as HTMLElement | null;
            const text = btn.querySelector(".key-text") as HTMLElement | null;
            if (!icon || !text) continue;

            const cs = getComputedStyle(btn);
            const padL = parseFloat(cs.paddingLeft) || 0;
            const padR = parseFloat(cs.paddingRight) || 0;
            const gap = parseFloat(cs.gap) || parseFloat(cs.columnGap) || 0;

            const available = btn.clientWidth - padL - padR;
            const needed = icon.offsetWidth + gap + Math.ceil(text.scrollWidth);

            if (needed > available + 1) btn.classList.add("stacked");
        }
    }


    /**
     * Fits the keyboard to mobile width.
     * @returns {void}
     */
    __fitMobile(): void {
        const cs = getComputedStyle(this.bar!);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const w = this.bar!.clientWidth - padL - padR;
        if (!w || !Number.isFinite(w)) return;

        const btnGap = this.__clamp(w * 0.01, 2, 6);

        const minKeyW = 28;
        const maxKeyW = 46;
        const cols = 7;
        const keyW = this.__clamp((w - ((cols - 1) * btnGap)) / cols, minKeyW, maxKeyW);

        const keyH = this.__clamp(keyW * 0.92, 30, 44);

        const font = this.__clamp(keyW * 0.3, 10.5, 13);
        const icon = this.__clamp(font * 1.08, 11.5, 15);
        const padX = this.__clamp(keyW * 0.18, 6, 10);
        const radius = this.__clamp(keyW * 0.22, 8, 10);
        const innerGap = this.__clamp(keyW * 0.1, 3, 6);

        this.__setPxVar("--key-w", keyW);
        this.__setPxVar("--key-h", keyH);
        this.__setPxVar("--btn-gap", btnGap);
        this.__setPxVar("--pad-x", padX);
        this.__setPxVar("--inner-gap", innerGap);
        this.__setPxVar("--font-size", font);
        this.__setPxVar("--icon-size", icon);
        this.__setPxVar("--radius", radius);
    }


    /**
     * Fits the keyboard to desktop width using the first preset that works.
     * @returns {void}
     */
    __fitDesk(): void {
        const cs = getComputedStyle(this.bar!);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const available = this.bar!.clientWidth - padL - padR;
        const grid = this.bar!.querySelector(".key-grid") as HTMLElement | null;

        for (const p of KeyboardFoundation.DESKTOP_PRESETS) {
            this.__setPxVar("--key-w", p.keyW);
            this.__setPxVar("--key-h", p.keyH);
            this.__setPxVar("--btn-gap", p.btnGap);
            this.__setPxVar("--pad-x", p.padX);
            this.__setPxVar("--inner-gap", p.innerGap);
            this.__setPxVar("--font-size", p.font);
            this.__setPxVar("--icon-size", p.icon);
            this.__setPxVar("--radius", p.radius);

            if (!grid) return;
            if (grid.scrollWidth <= available + 1) return;
        }
    }


    /**
     * Picks the right width-fit strategy.
     * @returns {void}
     */
    __fit(): void {
        if (this.isMobile) this.__fitMobile();
        else this.__fitDesk();
    }


    /**
     * Scales the Fn row down if it would overflow.
     * @returns {void}
     */
    __fitFn(): void {
        const wrap = this.bar!.querySelector(".fn-grid-wrap") as HTMLElement | null;
        const grid = this.bar!.querySelector(".fn-grid") as HTMLElement | null;
        if (!wrap || !grid) return;

        const isFnRowVisible = this.bar!.classList.contains("fn-on") || this.bar!.classList.contains("fn-exiting");
        if (!this.toolbarVisible || !isFnRowVisible) {
            grid.style.transform = "";
            return;
        }

        const aw = wrap.clientWidth;
        const sw = grid.scrollWidth;

        if (!aw || !sw || !Number.isFinite(aw) || !Number.isFinite(sw)) {
            grid.style.transform = "";
            return;
        }

        const scale = Math.min(1, aw / sw);
        grid.style.transform = scale < 1 ? `scale(${scale})` : "";
    }


    /**
     * Positions the toolbar against the bottom edge of the visual viewport.
     * @returns {void}
     */
    __place(): void {
        const bar = this.bar!;
        const rect = bar.getBoundingClientRect();
        const height = Math.max(0, Math.ceil(rect.height || bar.offsetHeight || 0));
        const bottom = this.vv ? this.vv.offsetTop + this.vv.height : window.innerHeight;

        const width = document.documentElement.clientWidth || window.innerWidth;
        const top = Math.round(bottom - height + KeyboardFoundation.VIEWPORT_OVERLAP_PX);

        bar.style.top = `${top}px`;
        bar.style.left = "0px";
        bar.style.width = `${width}px`;
    }


    /**
     * Schedules a layout pass on the next frame.
     * @returns {void}
     */
    __schedule(): void {
        if (!this.bar) return;
        if (this.raf) return;

        this.raf = window.requestAnimationFrame(() => {
            this.raf = 0;
            this.__fit();
            this.__fitFn();
            this.__stackIfNeeded();
            this.__place();
        });
    }

}
