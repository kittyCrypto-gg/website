import { KeyboardFoundation } from "./KeyboardFoundation.ts";
import { KeyboardModifiers } from "./KeyboardModifiers.ts";

/** Pointer/touch events and intercepted hardware/editor key input. */
export class KeyboardInput extends KeyboardModifiers {
    /**
     * Swallows the synthetic click after a handled touch press.
     * @param {MouseEvent} e
     * @returns {void}
     */
    __onDocClickCapture(e: MouseEvent): void {
        if (!this.suppressNextClick) return;

        this.suppressNextClick = false;

        e.preventDefault();
        e.stopPropagation();

        if (typeof e.stopImmediatePropagation === "function") {
            e.stopImmediatePropagation();
        }
    }


    /**
     * Finishes visibility bits after css transitions end.
     * Also tidies the Fn row state when that animation is done.
     * @param {TransitionEvent} e
     * @returns {void}
     */
    __onTransitionEnd(e: TransitionEvent): void {
        const bar = this.bar;
        if (!bar) return;

        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        const isBarTransition =
            target === bar &&
            (e.propertyName === "opacity" || e.propertyName === "transform");

        if (isBarTransition && this.toolbarVisible) {
            bar.style.setProperty("--toolbar-z", String(this.zIndex));
        }

        if (
            isBarTransition &&
            !this.toolbarVisible &&
            bar.classList.contains("kb-hidden")
        ) {
            bar.style.setProperty("--toolbar-z", String(KeyboardFoundation.HIDDEN_Z));
        }

        if (isBarTransition) return;

        if (!target.classList.contains("fn-grid-wrap")) return;
        if (e.propertyName !== "max-height" && e.propertyName !== "opacity" && e.propertyName !== "transform") return;
        if (this.mods.fn) return;
        if (!bar.classList.contains("fn-exiting")) return;

        bar.classList.remove("fn-exiting");
        this.__schedule();
    }


    /**
     * Prevents toolbar touches from scrolling the page underneath.
     * @param {TouchEvent} e
     * @returns {void}
     */
    __onTouchMove(e: TouchEvent): void {
        e.preventDefault();
    }


    /**
     * Handles touch presses while keeping focus on the editable.
     * @param {PointerEvent} e
     * @returns {void}
     */
    __onPointerDownCapture(e: PointerEvent): void {
        if (!this.isMobile) return;
        if (e.pointerType && e.pointerType !== "touch") return;

        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest("button") as HTMLButtonElement | null;
        if (!btn) return;
        if (!this.lastEditable) return;

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
        this.suppressNextClick = true;

        this.__press(btn);

        if (this.skipNextRefocus) {
            this.skipNextRefocus = false;
            return;
        }

        window.requestAnimationFrame(this.__refocusEditableBound);
    }


    /**
     * Handles mouse clicks on toolbar buttons.
     * @param {MouseEvent} e
     * @returns {void}
     */
    __onClick(e: MouseEvent): void {
        const suppressed = this.suppressNextClick;

        if (suppressed) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (
            suppressed &&
            typeof e.stopImmediatePropagation === "function"
        ) e.stopImmediatePropagation();

        if (suppressed) return;

        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest("button") as HTMLButtonElement | null;
        if (!btn) return;

        this.__press(btn);

        if (this.skipNextRefocus) {
            this.skipNextRefocus = false;
            return;
        }

        if (this.lastEditable) window.requestAnimationFrame(this.__refocusEditableBound);
    }


    /**
     * Intercepts beforeinput while modifiers are armed.
     * @param {Event} e
     * @returns {void}
     */
    __onBeforeInputCapture(e: Event): void {
        if (!this.mods.ctrl && !this.mods.alt && !this.mods.meta && !this.mods.shift && !this.mods.fn) return;
        if (!(e instanceof InputEvent)) return;

        const type = e.inputType || "";
        const data = typeof e.data === "string" ? e.data : "";

        const isTextInsert =
            type === "insertText" &&
            data.length === 1;

        const textSequence = isTextInsert
            ? this.__seq(data, this.mods)
            : "";

        if (isTextInsert && !textSequence) return;

        if (isTextInsert) {
            e.preventDefault();
            e.stopPropagation();
            this.send!({
                key: data,
                seq: textSequence,
                mods: { ...this.mods }
            });
            this.__clearOneShotMods();
            return;
        }

        const isLineInsert =
            type === "insertLineBreak" ||
            type === "insertParagraph";

        const lineSequence = isLineInsert
            ? this.__seq("Enter", this.mods)
            : "";

        if (isLineInsert && !lineSequence) return;

        if (isLineInsert) {
            e.preventDefault();
            e.stopPropagation();
            this.send!({
                key: "Enter",
                seq: lineSequence,
                mods: { ...this.mods }
            });
            this.__clearOneShotMods();
            return;
        }

        if (type !== "deleteContentBackward") return;

        const key = this.mods.fn ? "Delete" : "Backspace";
        const seq = this.__seq("Backspace", this.mods);
        if (!seq) return;

        e.preventDefault();
        e.stopPropagation();
        this.send!({ key, seq, mods: { ...this.mods } });
        this.__clearOneShotMods();
    }


    /**
     * Intercepts physical key presses while modifiers are armed.
     * @param {KeyboardEvent} e
     * @returns {void}
     */
    __onKeyDownCapture(e: KeyboardEvent): void {
        if (!this.mods.ctrl && !this.mods.alt && !this.mods.meta && !this.mods.shift && !this.mods.fn) return;

        const k = e.key;
        if (k === "Alt" || k === "Control" || k === "Meta" || k === "Shift") return;

        const seq = this.__seq(k, this.mods);
        if (!seq) return;

        e.preventDefault();
        e.stopPropagation();
        this.send!({ key: k, seq, mods: { ...this.mods } });
        this.__clearOneShotMods();
    }

}
