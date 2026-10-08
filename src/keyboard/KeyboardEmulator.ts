import { KeyboardInput } from "./KeyboardInput.ts";
import type { SendCb, SendMsg } from "./types.ts";

declare global {
    interface Window { term?: unknown; }
}

/** Public keyboard API and installation/teardown lifecycle. */
export class keyboardEmu extends KeyboardInput {
    /**
     * Switches mobile mode and redoes labels/layout.
     * @param {unknown} v
     * @returns {void}
     */
    setIsMobile(v: unknown): void {
        this.isMobile = !!v;
        if (!this.bar) return;

        this.__setLabels(this.bar);
        this.__schedule();
    }


    /**
     * Installs the toolbar and wires it to the allowed editables.
     * Yeah this one does a lot.
     * @param {unknown} options
     * @param {unknown} targets
     * @returns {Promise<this>}
     */
    async install(options?: unknown, targets?: unknown): Promise<this> {
        const opts = options || {};
        this.opts = opts;

        /**
         * Picks the first defined value from a bunch of possibles.
         * @param {...unknown[]} values
         * @returns {unknown | null}
         */
        const firstDef = (...values: readonly unknown[]): unknown | null => {
            for (const v of values) {
                if (v !== undefined) return v;
            }

            return null;
        };

        const optsRec = opts as Record<string, unknown>;

        const allowRaw = firstDef(
            targets,
            optsRec["targets"],
            optsRec["target"],
            optsRec["allowed"],
            optsRec["allow"],
            optsRec["editables"],
            optsRec["editable"]
        );

        const allowed = (() => {
            if (!allowRaw) return [];
            if (Array.isArray(allowRaw)) return allowRaw;
            if (allowRaw instanceof Element) return [allowRaw];

            if (typeof allowRaw === "object" && typeof (allowRaw as { length?: unknown }).length === "number") {
                try {
                    return Array.from(allowRaw as ArrayLike<unknown>);
                } catch {
                    return [];
                }
            }

            return [];
        })()
            .filter((x): x is Element => x instanceof Element);

        const baseIsEditable = keyboardEmu.prototype.__isEditable.bind(this);
        const allowedSet = new Set<Element>(allowed);

        (this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable = (el: unknown): boolean => {
            if (!baseIsEditable(el)) return false;
            if (!allowedSet.size) return false;
            if (!(el instanceof Element)) return false;

            for (const a of allowedSet) {
                if (a === el) return true;
                if (typeof a.contains === "function" && a.contains(el)) return true;
            }

            return false;
        };

        const zIndex = typeof optsRec["zIndex"] === "number"
            ? (optsRec["zIndex"] as number)
            : keyboardEmu.DEFAULT_Z_INDEX;
        this.zIndex = zIndex;

        const existing = document.getElementById("keyboard-emu");
        if (existing) existing.remove();

        const existingCss = document.getElementById(keyboardEmu.CSS_LINK_ID);
        if (
            existingCss &&
            existingCss.tagName === "LINK" &&
            existingCss.getAttribute("data-owner") === "keyboard-emu"
        ) {
            existingCss.remove();
        }

        const bar = document.createElement("div");
        this.bar = bar;

        bar.id = "keyboard-emu";
        bar.setAttribute("role", "toolbar");
        bar.setAttribute("aria-label", "Terminal keys");
        bar.classList.add("kb-hidden");

        // Keep the dynamically-mounted keyboard completely outside layout and
        // paint until both its stylesheet and markup are ready. Without this,
        // startup focus/CSS timing can flash the raw keyboard for a frame.
        bar.style.display = "none";
        bar.style.setProperty("--toolbar-z", String(keyboardEmu.HIDDEN_Z));
        document.body.appendChild(bar);

        const cssResult = this.__hasCss(bar) ? null : this.__ensCss();
        this.cssLink = cssResult?.link ?? null;
        this.cssInjected = cssResult?.injected ?? false;

        const cssReady = cssResult ? this.__waitCss(cssResult.link) : Promise.resolve();
        await Promise.all([
            cssReady,
            this.__injHtml(bar)
        ]);
        this.__setLabels(bar);

        this.mods = { ctrl: false, alt: false, meta: false, shift: false, fn: false };
        this.__syncBtns();

        const sendCandidate = optsRec["send"];
        this.send =
            typeof sendCandidate === "function"
                ? (sendCandidate as SendCb)
                : (p: SendMsg): void => {
                    const t = (window as unknown as { term?: unknown }).term;
                    if (t && typeof (t as { write?: unknown }).write === "function") {
                        (t as { write: (seq: string) => void }).write(p.seq);
                    }
                };

        this.lastEditable = null;
        this.toolbarVisible = false;

        document.addEventListener("focusin", this.__onFocusInBound, true);
        document.addEventListener("focusout", this.__onFocusOutBound, true);

        const initialActive = document.activeElement;
        const initialEditable =
            (this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(initialActive);

        if (initialEditable) this.lastEditable = initialActive as HTMLElement;

        // CSS is now ready, so exposing the fixed hidden shell cannot affect
        // document flow. Installation always finishes hidden: startup focus is
        // allowed to settle without painting the keyboard. The first genuine
        // focus or pointer interaction with an allowed editable reveals it.
        bar.style.removeProperty("display");
        this.__setVis(false);
        document.addEventListener("pointerdown", this.__onEditablePointerDownBound, true);

        for (const b of bar.querySelectorAll("button")) b.tabIndex = -1;

        bar.addEventListener("touchmove", this.__onTouchMoveBound, { passive: false });
        bar.addEventListener("pointerdown", this.__onPointerDownCaptureBound, { capture: true, passive: false });
        bar.addEventListener("click", this.__onClickBound);
        bar.addEventListener("transitionend", this.__onTransitionEndBound);

        this.suppressNextClick = false;

        document.addEventListener("beforeinput", this.__onBeforeInputCaptureBound, true);
        document.addEventListener("keydown", this.__onKeyDownCaptureBound, true);

        this.vv = window.visualViewport || null;
        this.raf = 0;

        this.ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.__schedule()) : null;
        if (this.ro) {
            this.ro.observe(document.documentElement);
            this.ro.observe(bar);
        }

        if (this.vv) {
            this.vv.addEventListener("resize", this.__scheduleBound);
            this.vv.addEventListener("scroll", this.__scheduleBound);
        }

        window.addEventListener("resize", this.__scheduleBound, { passive: true });
        window.addEventListener("scroll", this.__scheduleBound, { passive: true });
        window.addEventListener("orientationchange", this.__scheduleBound);

        this.__schedule();

        document.addEventListener("click", this.__onDocClickCaptureBound, true);

        return this;
    }


    /**
     * Replaces the send callback if the value is callable.
     * @param {unknown} fn
     * @returns {void}
     */
    setSend(fn: unknown): void {
        if (typeof fn === "function") this.send = fn as SendCb;
    }


    /**
     * Shows or hides the toolbar.
     * @param {boolean} v
     * @returns {void}
     */
    setVisible(v: boolean): void {
        if (!this.bar) return;
        if (v) this.__show();
        else this.__hide();
    }


    /**
     * Tears the whole thing down and removes listeners.
     * @returns {void}
     */
    destroy(): void {
        const bar = this.bar;
        if (!bar) return;

        if (this.vv) {
            this.vv.removeEventListener("resize", this.__scheduleBound);
            this.vv.removeEventListener("scroll", this.__scheduleBound);
        }

        window.removeEventListener("resize", this.__scheduleBound);
        window.removeEventListener("scroll", this.__scheduleBound);
        window.removeEventListener("orientationchange", this.__scheduleBound);
        document.removeEventListener("beforeinput", this.__onBeforeInputCaptureBound, true);
        document.removeEventListener("keydown", this.__onKeyDownCaptureBound, true);

        document.removeEventListener("focusin", this.__onFocusInBound, true);
        document.removeEventListener("focusout", this.__onFocusOutBound, true);
        document.removeEventListener("pointerdown", this.__onEditablePointerDownBound, true);

        bar.removeEventListener("pointerdown", this.__onPointerDownCaptureBound, true);
        bar.removeEventListener("click", this.__onClickBound);
        bar.removeEventListener("touchmove", this.__onTouchMoveBound);
        bar.removeEventListener("transitionend", this.__onTransitionEndBound);

        if (this.ro) this.ro.disconnect();
        if (this.raf) window.cancelAnimationFrame(this.raf);

        bar.remove();

        if (this.cssInjected && this.cssLink && this.cssLink.isConnected) {
            this.cssLink.remove();
        }

        this.bar = null;
        this.vv = null;
        this.ro = null;
        this.raf = 0;

        document.removeEventListener("click", this.__onDocClickCaptureBound, true);
    }

}
