import { buildKeySequence } from "./sequences.ts";
import type { ModKey, Mods } from "./types.ts";
import { KeyboardFocus } from "./KeyboardFocus.ts";

/** Modifiers, key sequences, Fn behaviour and send actions. */
export class KeyboardModifiers extends KeyboardFocus {
    /**
     * Builds the terminal sequence for a key and modifier state.
     */
    __seq(key: string, mods: Mods): string {
        return buildKeySequence(key, mods);
    }


    /**
     * Updates pressed states and Fn classes.
     * @returns {void}
     */
    __syncBtns(): void {
        /**
         * Syncs one modifier button.
         * @param {ModKey} name
         * @returns {void}
         */
        const set = (name: ModKey): void => {
            const b = this.bar!.querySelector(`button[data-mod="${name}"]`) as HTMLButtonElement | null;
            if (!b) return;

            const on = this.mods[name];
            b.classList.toggle("sticky-on", on);
            b.setAttribute("aria-pressed", on ? "true" : "false");
        };

        set("ctrl");
        set("alt");
        set("meta");
        set("shift");
        set("fn");

        const bar = this.bar!;
        const hadFnOn = bar.classList.contains("fn-on");

        if (this.mods.fn) {
            bar.classList.remove("fn-exiting");
            bar.classList.add("fn-on");
        }

        if (!this.mods.fn) bar.classList.remove("fn-on");
        if (!this.mods.fn && hadFnOn) bar.classList.add("fn-exiting");

        const shouldResetGrid =
            !this.mods.fn &&
            !bar.classList.contains("fn-exiting");

        const grid = shouldResetGrid
            ? bar.querySelector(".fn-grid") as HTMLElement | null
            : null;

        if (grid) grid.style.transform = "";

        this.__schedule();
    }


    /**
     * Clears one-shot modifiers but leaves Fn alone.
     * @returns {void}
     */
    __clearOneShotMods(): void {
        const hadOneShot = this.mods.ctrl || this.mods.alt || this.mods.meta || this.mods.shift;
        if (!hadOneShot) return;

        this.mods.ctrl = false;
        this.mods.alt = false;
        this.mods.meta = false;
        this.mods.shift = false;
        this.__syncBtns();
    }


    /**
     * Clears all modifiers, Fn included.
     * @returns {void}
     */
    __clearMods(): void {
        this.mods.ctrl = false;
        this.mods.alt = false;
        this.mods.meta = false;
        this.mods.shift = false;
        this.mods.fn = false;
        this.__syncBtns();
    }


    /**
     * Toggles a modifier and refreshes button state.
     * @param {ModKey} name
     * @returns {void}
     */
    __tglMod(name: ModKey): void {
        this.mods[name] = !this.mods[name];
        this.__syncBtns();
    }


    /**
     * Sends one key and clears one-shot mods afterwards.
     * Escape is special and hides the toolbar.
     * @param {string} key
     * @returns {void}
     */
    __fire(key: string): void {
        const seq = this.__seq(key, this.mods);
        if (!seq) return;

        this.send!({ key, seq, mods: { ...this.mods } });

        if (key === "Escape") {
            this.skipNextRefocus = true;
            this.__blurActiveEditable();
            this.__hide();
            return;
        }

        this.__clearOneShotMods();
    }


    /**
     * Handles a toolbar button press.
     * either toggles a mod or fires a key.
     * @param {Element} btn
     * @returns {void}
     */
    __press(btn: Element): void {
        const mod = btn.getAttribute("data-mod");
        if (mod === "ctrl" || mod === "alt" || mod === "meta" || mod === "shift" || mod === "fn") {
            this.__tglMod(mod);
            return;
        }

        const key = btn.getAttribute("data-key");
        if (!key) return;

        this.__fire(key);
    }

}
