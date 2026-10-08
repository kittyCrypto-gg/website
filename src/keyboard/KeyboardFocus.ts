import { nextFrame } from "../helpers.js";
import { KeyboardFoundation } from "./KeyboardFoundation.ts";
import { KeyboardLayout } from "./KeyboardLayout.ts";

/** Editable focus tracking and toolbar visibility transitions. */
export class KeyboardFocus extends KeyboardLayout {
    /**
     * Says whether an element counts as editable for this tool.
     * @param {unknown} el
     * @returns {boolean}
     */
    __isEditable(el: unknown): boolean {
        if (!(el instanceof HTMLElement)) return false;
        if (el.isContentEditable) return true;
        if (el instanceof HTMLTextAreaElement) return true;

        if (el instanceof HTMLInputElement) {
            const t = (el.type || "").toLowerCase();

            return ![
                "button",
                "submit",
                "reset",
                "checkbox",
                "radio",
                "range",
                "file",
                "color",
                "date",
                "datetime-local",
                "month",
                "time",
                "week"
            ].includes(t);
        }

        return false;
    }


    /**
     * Refocuses the last editable if it still exists.
     * @returns {void}
     */
    __refocusEditable(): void {
        const el = this.lastEditable;
        if (!el) return;
        if (!document.contains(el)) return;

        try {
            el.focus({ preventScroll: true });
        } catch {
            el.focus();
        }
    }


    /**
     * Blurs the active editable if one is focused.
     * @returns {void}
     */
    __blurActiveEditable(): void {
        const a = document.activeElement;
        if (!(this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(a)) return;

        try {
            (a as HTMLElement).blur();
        } catch {
        }
    }


    /**
     * Applies the visible/hidden state to the toolbar.
     * @param {boolean} visible
     * @returns {void}
     */
    __setVis(visible: boolean): void {
        const bar = this.bar!;
        const wasVisible = this.toolbarVisible;

        this.toolbarVisible = visible;

        if (!visible) {
            bar.classList.add("kb-hidden");
            bar.style.pointerEvents = "none";
            (bar as unknown as { inert: boolean }).inert = true;
        }

        if (!visible && !wasVisible) {
            bar.style.setProperty("--toolbar-z", String(KeyboardFoundation.HIDDEN_Z));
        }

        if (!visible) return;

        bar.style.setProperty("--toolbar-z", String(this.zIndex));
        bar.style.pointerEvents = "auto";
        (bar as unknown as { inert: boolean }).inert = false;

        window.requestAnimationFrame(() => {
            if (!this.bar || !this.toolbarVisible) return;

            this.bar.classList.remove("kb-hidden");
            this.__schedule();
        });
    }


    /**
     * Shows the toolbar if it is not already showing.
     * @returns {void}
     */
    __show(): void {
        if (this.toolbarVisible) return;
        this.__setVis(true);
        this.__schedule();
    }


    /**
     * Hides the toolbar and clears mods.
     * @returns {void}
     */
    __hide(): void {
        if (!this.toolbarVisible) return;
        this.__setVis(false);
        this.__clearMods();
    }


    /**
     * Re-checks visibility after focus has settled a frame later.
     * @returns {Promise<void>}
     */
    async __syncVisFromActive(): Promise<void> {
        await nextFrame();

        const a = document.activeElement;
        if ((this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(a)) {
            this.lastEditable = a as HTMLElement;
            this.__show();
            return;
        }

        this.__hide();
    }


    /**
     * Focusin handler.
     * shows the toolbar when an editable gains focus.
     * @param {FocusEvent} e
     * @returns {void}
     */
    __onFocusIn(e: FocusEvent): void {
        const t = e.target;
        if (!(this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(t)) return;

        this.lastEditable = t as HTMLElement;
        this.__show();
    }


    /**
     * Reveals the toolbar on a real pointer interaction with an allowed editable.
     * This covers an editable that was already programmatically focused at startup.
     * @param {PointerEvent} e
     * @returns {void}
     */
    __onEditablePointerDown(e: PointerEvent): void {
        const t = e.target;
        if (!(this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(t)) return;

        this.lastEditable = t as HTMLElement;
        this.__show();
    }


    /**
     * Focusout handler.
     * lets the next frame decide if toolbar should stay.
     * @param {FocusEvent} _e
     * @returns {void}
     */
    __onFocusOut(_e: FocusEvent): void {
        void this.__syncVisFromActive();
    }

}
