type KeyboardMods = {
    ctrl: boolean;
    alt: boolean;
    meta: boolean;
    shift: boolean;
    fn: boolean;
};

type ModName = keyof KeyboardMods;

type DesktopPreset = Readonly<{
    keyW: number;
    keyH: number;
    btnGap: number;
    padX: number;
    innerGap: number;
    font: number;
    icon: number;
    radius: number;
}>;

type SendPayload = Readonly<{
    key: string;
    seq: string;
    mods: KeyboardMods;
}>;

type SendFn = (p: SendPayload) => void;

type EnsureCssResult = Readonly<{
    link: HTMLLinkElement;
    injected: boolean;
}>;

declare global {
    interface Window {
        term?: unknown;
    }
}

export class keyboardEmu {
    static MARKER_ID = "keyboard-emu-html-loaded";
    static CSS_LINK_ID = "keyboard-emu-css";
    static DEFAULT_Z_INDEX = 2147483647;
    static HIDDEN_Z = -1;
    static VIEWPORT_OVERLAP_PX = 1;

    static SHIFT_MAP: Readonly<Record<string, string>> = {
        "1": "!",
        "2": "@",
        "3": "#",
        "4": "$",
        "5": "%",
        "6": "^",
        "7": "&",
        "8": "*",
        "9": "(",
        "0": ")",
        "-": "_",
        "=": "+",
        "[": "{",
        "]": "}",
        "\\": "|",
        ";": ":",
        "'": "\"",
        ",": "<",
        ".": ">",
        "/": "?",
        "`": "~"
    };

    static DESKTOP_PRESETS: readonly DesktopPreset[] = [
        { keyW: 44, keyH: 40, btnGap: 8, padX: 12, innerGap: 6, font: 13, icon: 15, radius: 10 },
        { keyW: 42, keyH: 38, btnGap: 7, padX: 11, innerGap: 6, font: 12.5, icon: 14.5, radius: 10 },
        { keyW: 40, keyH: 36, btnGap: 6, padX: 10, innerGap: 5, font: 12, icon: 14, radius: 9 },
        { keyW: 38, keyH: 34, btnGap: 5, padX: 9, innerGap: 5, font: 11.5, icon: 13.5, radius: 9 }
    ];

    /**
     * @param {string} path - Path to resolve relative to the module.
     * @returns {string} A fully resolved URL string or the original path if URL construction fails.
     */
    static __resolveURL(path: string): string {
        try {
            return new URL(path, import.meta.url).toString();
        } catch {
            return path;
        }
    }

    isMobile: boolean;
    htmlUrl: string;
    cssUrl: string;

    opts: unknown;
    zIndex: number;

    bar: HTMLDivElement | null;
    cssLink: HTMLLinkElement | null;
    cssInjected: boolean;

    mods: KeyboardMods;
    send: SendFn | null;

    lastEditable: HTMLElement | null;
    toolbarVisible: boolean;
    skipNextRefocus: boolean;
    suppressNextClick: boolean;

    vv: VisualViewport | null;
    raf: number;
    ro: ResizeObserver | null;

    private __onFocusInBound: (e: FocusEvent) => void;
    private __onFocusOutBound: (e: FocusEvent) => void;
    private __onPointerDownCaptureBound: (e: PointerEvent) => void;
    private __onClickBound: (e: MouseEvent) => void;
    private __onBeforeInputCaptureBound: (e: Event) => void;
    private __onKeyDownCaptureBound: (e: KeyboardEvent) => void;
    private __scheduleBound: () => void;
    private __refocusEditableBound: () => void;
    private __onTouchMoveBound: (e: TouchEvent) => void;
    private __onDocClickCaptureBound: (e: MouseEvent) => void;
    private __onTransitionEndBound: (e: TransitionEvent) => void;

    /**
     * @param {unknown} isMobile - Whether the device is mobile.
     * @param {unknown} htmlUrl - Keyboard HTML URL.
     * @param {unknown} cssUrl - Keyboard CSS URL.
     * @returns {void}
     */
    constructor(isMobile?: unknown, htmlUrl?: unknown, cssUrl?: unknown) {
        this.isMobile = !!isMobile;

        this.htmlUrl = typeof htmlUrl === "string" && htmlUrl !== ""
            ? keyboardEmu.__resolveURL(htmlUrl)
            : keyboardEmu.__resolveURL("/ui/keyboard.html");

        this.cssUrl = typeof cssUrl === "string" && cssUrl !== ""
            ? keyboardEmu.__resolveURL(cssUrl)
            : keyboardEmu.__resolveURL("/styles/modules/keyboard.css");

        this.opts = null;
        this.zIndex = keyboardEmu.DEFAULT_Z_INDEX;

        this.bar = null;
        this.cssLink = null;
        this.cssInjected = false;

        this.mods = { ctrl: false, alt: false, meta: false, shift: false, fn: false };
        this.send = null;

        this.lastEditable = null;
        this.toolbarVisible = true;
        this.skipNextRefocus = false;
        this.suppressNextClick = false;

        this.vv = null;
        this.raf = 0;
        this.ro = null;

        this.__onFocusInBound = this.__onFocusIn.bind(this);
        this.__onFocusOutBound = this.__onFocusOut.bind(this);
        this.__onPointerDownCaptureBound = this.__onPointerDownCapture.bind(this);
        this.__onClickBound = this.__onClick.bind(this);
        this.__onBeforeInputCaptureBound = this.__onBeforeInputCapture.bind(this);
        this.__onKeyDownCaptureBound = this.__onKeyDownCapture.bind(this);
        this.__scheduleBound = this.__schedule.bind(this);
        this.__refocusEditableBound = this.__refocusEditable.bind(this);
        this.__onTouchMoveBound = this.__onTouchMove.bind(this);
        this.__onDocClickCaptureBound = this.__onDocClickCapture.bind(this);
        this.__onTransitionEndBound = this.__onTransitionEnd.bind(this);
    }

    /**
     * @param {unknown} v - Mobile flag.
     * @returns {void} Updates the mobile mode and schedules a reflow.
     */
    setIsMobile(v: unknown): void {
        this.isMobile = !!v;
        if (!this.bar) return;
        this.__applyResponsiveLabels(this.bar);
        this.__schedule();
    }

    /**
     * @param {unknown} options - Installation options.
     * @param {unknown} targets - Allowed targets / editables.
     * @returns {Promise<this>} The current emulator instance.
     */
    async install(options?: unknown, targets?: unknown): Promise<this> {
        const opts = options || {};
        this.opts = opts;

        const firstDefined = (...values: readonly unknown[]): unknown | null => {
            for (const v of values) {
                if (v !== undefined) return v;
            }
            return null;
        };

        const optsRecord = opts as Record<string, unknown>;

        const allowRaw = firstDefined(
            targets,
            optsRecord["targets"],
            optsRecord["target"],
            optsRecord["allowed"],
            optsRecord["allow"],
            optsRecord["editables"],
            optsRecord["editable"]
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

        const zIndex = typeof optsRecord["zIndex"] === "number"
            ? (optsRecord["zIndex"] as number)
            : keyboardEmu.DEFAULT_Z_INDEX;
        this.zIndex = zIndex;

        const existing = document.getElementById("keyboard-emu");
        if (existing) existing.remove();

        const existingCss = document.getElementById(keyboardEmu.CSS_LINK_ID);
        if (existingCss && existingCss.tagName === "LINK" && existingCss.getAttribute("data-owner") === "keyboard-emu") {
            existingCss.remove();
        }

        const { link: cssLink, injected: cssInjected } = this.__ensureKeyboardCSS();
        this.cssLink = cssLink;
        this.cssInjected = cssInjected;

        const bar = document.createElement("div");
        this.bar = bar;

        bar.id = "keyboard-emu";
        bar.setAttribute("role", "toolbar");
        bar.setAttribute("aria-label", "Terminal keys");
        bar.classList.add("kb-hidden");

        bar.style.setProperty("--toolbar-z", String(keyboardEmu.HIDDEN_Z));

        await this.__injectKeyboardHTML(bar);
        this.__applyResponsiveLabels(bar);

        this.mods = { ctrl: false, alt: false, meta: false, shift: false, fn: false };
        this.__syncButtons();

        const sendCandidate = optsRecord["send"];
        this.send =
            typeof sendCandidate === "function"
                ? (sendCandidate as SendFn)
                : (p: SendPayload): void => {
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
        if ((this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(initialActive)) {
            this.lastEditable = initialActive as HTMLElement;
            this.__applyVisibility(true);
        } else {
            this.__applyVisibility(false);
        }

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
     * @param {unknown} fn - Send handler.
     * @returns {void} Sets the send function if the provided value is callable.
     */
    setSend(fn: unknown): void {
        if (typeof fn === "function") this.send = fn as SendFn;
    }

    /**
     * @param {boolean} v - Visibility flag.
     * @returns {void} Shows or hides the toolbar.
     */
    setVisible(v: boolean): void {
        if (!this.bar) return;
        if (v) this.__showToolbar();
        else this.__hideToolbar();
    }

    /**
     * @returns {void} Destroys the keyboard emulator and removes all listeners.
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

        bar.removeEventListener("pointerdown", this.__onPointerDownCaptureBound, true);
        bar.removeEventListener("click", this.__onClickBound);
        bar.removeEventListener("touchmove", this.__onTouchMoveBound);
        bar.removeEventListener("transitionend", this.__onTransitionEndBound);

        if (this.ro) this.ro.disconnect();

        if (this.raf) window.cancelAnimationFrame(this.raf);
        bar.remove();

        if (this.cssInjected && this.cssLink && this.cssLink.isConnected) this.cssLink.remove();

        this.bar = null;
        this.vv = null;
        this.ro = null;
        this.raf = 0;

        document.removeEventListener("click", this.__onDocClickCaptureBound, true);
    }

    /**
     * @param {MouseEvent} e - Click event.
     * @returns {void} Suppresses the synthetic click that follows a handled touch press.
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
     * @param {TransitionEvent} e - Transition event.
     * @returns {void} Finalises visual state changes after toolbar or Fn row animations complete.
     */
    __onTransitionEnd(e: TransitionEvent): void {
        const bar = this.bar;
        if (!bar) return;

        const target = e.target;
        if (!(target instanceof HTMLElement)) return;

        if (target === bar && (e.propertyName === "opacity" || e.propertyName === "transform")) {
            if (this.toolbarVisible) {
                bar.style.setProperty("--toolbar-z", String(this.zIndex));
            } else if (bar.classList.contains("kb-hidden")) {
                bar.style.setProperty("--toolbar-z", String(keyboardEmu.HIDDEN_Z));
            }
            return;
        }

        if (!target.classList.contains("fn-grid-wrap")) return;
        if (e.propertyName !== "max-height" && e.propertyName !== "opacity" && e.propertyName !== "transform") return;
        if (this.mods.fn) return;
        if (!bar.classList.contains("fn-exiting")) return;

        bar.classList.remove("fn-exiting");
        this.__schedule();
    }

    /**
     * @returns {Promise<void>} A promise that resolves on the next animation frame.
     */
    __nextFrame(): Promise<void> {
        return new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    /**
     * @param {string} id - Element id.
     * @returns {Promise<void>} Resolves when an element with the given id exists.
     */
    async __waitForElementById(id: string): Promise<void> {
        while (!document.getElementById(id)) {
            await this.__nextFrame();
        }
    }

    /**
     * @returns {EnsureCssResult} The stylesheet link and whether it was injected by this instance.
     */
    __ensureKeyboardCSS(): EnsureCssResult {
        const existing = document.getElementById(keyboardEmu.CSS_LINK_ID);
        if (existing && existing.tagName === "LINK") return { link: existing as HTMLLinkElement, injected: false };

        const link = document.createElement("link");
        link.id = keyboardEmu.CSS_LINK_ID;
        link.rel = "stylesheet";
        link.href = this.cssUrl;
        link.setAttribute("data-owner", "keyboard-emu");
        document.head.appendChild(link);
        return { link, injected: true };
    }

    /**
     * @param {HTMLDivElement} bar - Toolbar element.
     * @returns {Promise<void>} Loads and injects the keyboard HTML into the toolbar.
     */
    async __injectKeyboardHTML(bar: HTMLDivElement): Promise<void> {
        const res = await fetch(this.htmlUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Failed to load ${this.htmlUrl} (${res.status})`);

        const html = await res.text();
        bar.innerHTML = html;

        document.body.appendChild(bar);
        await this.__waitForElementById(keyboardEmu.MARKER_ID);
    }

    /**
     * @param {HTMLElement} bar - Toolbar element.
     * @returns {void} Applies mobile or desktop text labels to responsive button content.
     */
    __applyResponsiveLabels(bar: HTMLElement): void {
        const nodes = bar.querySelectorAll<HTMLElement>("[data-mobile-text][data-desktop-text]");
        for (const el of nodes) {
            const m = el.getAttribute("data-mobile-text") || "";
            const d = el.getAttribute("data-desktop-text") || "";
            el.textContent = this.isMobile ? m : d;
        }
    }

    /**
     * @param {number} n - Value to clamp.
     * @param {number} min - Minimum.
     * @param {number} max - Maximum.
     * @returns {number} The clamped value.
     */
    __clamp(n: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, n));
    }

    /**
     * @param {string} name - CSS variable name.
     * @param {number} v - Pixel value.
     * @returns {void} Sets a CSS custom property on the toolbar using pixel units.
     */
    __setPxVar(name: string, v: number): void {
        this.bar!.style.setProperty(name, `${v.toFixed(2)}px`);
    }

    /**
     * @param {unknown} el - Candidate element.
     * @returns {boolean} Whether the provided element is editable.
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
     * @returns {void} Refocuses the last known editable element without scrolling if possible.
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
     * @returns {void} Blurs the currently focused editable element if one is active.
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
     * @param {boolean} visible - Visibility flag.
     * @returns {void} Applies the visual and interactive visibility state to the toolbar.
     */
    __applyVisibility(visible: boolean): void {
        const bar = this.bar!;
        const wasVisible = this.toolbarVisible;

        this.toolbarVisible = visible;

        if (visible) {
            bar.style.setProperty("--toolbar-z", String(this.zIndex));
            bar.style.pointerEvents = "auto";
            (bar as unknown as { inert: boolean }).inert = false;

            window.requestAnimationFrame(() => {
                if (!this.bar || !this.toolbarVisible) return;
                this.bar.classList.remove("kb-hidden");
                this.__schedule();
            });

            return;
        }

        bar.classList.add("kb-hidden");
        bar.style.pointerEvents = "none";
        (bar as unknown as { inert: boolean }).inert = true;

        if (!wasVisible) {
            bar.style.setProperty("--toolbar-z", String(keyboardEmu.HIDDEN_Z));
        }
    }

    /**
     * @returns {void} Shows the toolbar if it is currently hidden.
     */
    __showToolbar(): void {
        if (this.toolbarVisible) return;
        this.__applyVisibility(true);
        this.__schedule();
    }

    /**
     * @returns {void} Hides the toolbar and clears all modifier state.
     */
    __hideToolbar(): void {
        if (!this.toolbarVisible) return;
        this.__applyVisibility(false);
        this.__clearMods();
    }

    /**
     * @returns {Promise<void>} Updates toolbar visibility after focus has settled.
     */
    async __updateVisibilityFromActive(): Promise<void> {
        await this.__nextFrame();

        const a = document.activeElement;
        if ((this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(a)) {
            this.lastEditable = a as HTMLElement;
            this.__showToolbar();
            return;
        }

        this.__hideToolbar();
    }

    /**
     * @param {FocusEvent} e - Focus event.
     * @returns {void} Shows the toolbar when an editable element receives focus.
     */
    __onFocusIn(e: FocusEvent): void {
        const t = e.target;
        if (!(this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(t)) return;

        this.lastEditable = t as HTMLElement;
        this.__showToolbar();
    }

    /**
     * @param {FocusEvent} _e - Focus event.
     * @returns {void} Re-evaluates visibility when focus leaves an element.
     */
    __onFocusOut(_e: FocusEvent): void {
        void this.__updateVisibilityFromActive();
    }

    /**
     * @returns {void} Applies stacked labels to buttons whose inline content no longer fits.
     */
    __applyStackingIfNeeded(): void {
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
     * @returns {void} Fits the keyboard to the available mobile width.
     */
    __fitToWidthMobile(): void {
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
     * @returns {void} Fits the keyboard to the available desktop width using the first preset that fits.
     */
    __fitToWidthDesktop(): void {
        const cs = getComputedStyle(this.bar!);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const available = this.bar!.clientWidth - padL - padR;
        const grid = this.bar!.querySelector(".key-grid") as HTMLElement | null;

        for (const p of keyboardEmu.DESKTOP_PRESETS) {
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
     * @returns {void} Chooses the correct width fitting strategy for the current device mode.
     */
    __fitToWidth(): void {
        if (this.isMobile) this.__fitToWidthMobile();
        else this.__fitToWidthDesktop();
    }

    /**
     * @returns {void} Scales the Fn row horizontally if it would overflow the toolbar width.
     */
    __fitFnRowToWidth(): void {
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
     * @param {KeyboardMods} m - Modifier state.
     * @returns {number} The xterm modifier parameter for the provided modifiers.
     */
    __xtermModParam(m: KeyboardMods): number {
        return (
            1 +
            (m.shift ? 1 : 0) +
            (m.alt ? 2 : 0) +
            (m.ctrl ? 4 : 0) +
            (m.meta ? 8 : 0)
        );
    }

    /**
     * @param {string} ch - Character to ctrlify.
     * @returns {string} The control character for the provided input, or an empty string if unsupported.
     */
    __ctrlify(ch: string): string {
        if (ch === " ") return "\x00";

        const c = ch.length ? ch.charCodeAt(0) : 0;

        if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) {
            const upper = c >= 97 ? c - 32 : c;
            return String.fromCharCode(upper - 64);
        }

        if (ch === "@") return "\x00";
        if (ch === "[") return "\x1b";
        if (ch === "\\") return "\x1c";
        if (ch === "]") return "\x1d";
        if (ch === "^") return "\x1e";
        if (ch === "_") return "\x1f";
        if (ch === "?") return "\x7f";

        return "";
    }

    /**
     * @param {string} ch - Single character.
     * @returns {string} The character after applying Shift rules.
     */
    __applyShiftToChar(ch: string): string {
        if (ch.length !== 1) return ch;

        const code = ch.charCodeAt(0);
        if (code >= 97 && code <= 122) return String.fromCharCode(code - 32);

        return keyboardEmu.SHIFT_MAP[ch] || ch;
    }

    /**
     * @param {string} key - Key identifier.
     * @param {KeyboardMods} m - Modifier state.
     * @returns {string} The escape sequence corresponding to the given key and modifiers.
     */
    __seqFor(key: string, m: KeyboardMods): string {
        if (m.fn && key === "Backspace") key = "Delete";

        if (key === "Escape") return "\x1b";

        if (key === "Enter") {
            let s = "\r";
            if (m.alt) s = "\x1b" + s;
            if (m.meta) s = "\x1b" + s;
            return s;
        }

        if (key === "Backspace") return "\x7f";

        if (key === "Delete") {
            const mod = this.__xtermModParam(m);
            return mod === 1 ? "\x1b[3~" : `\x1b[3;${mod}~`;
        }

        if (key === "Tab") {
            let s = "\t";
            if (m.shift) s = "\x1b[Z";
            if (m.ctrl) return "";
            if (m.alt) s = "\x1b" + s;
            if (m.meta) s = "\x1b" + s;
            return s;
        }

        if (/^F(1[0-2]|[1-9])$/.test(key)) {
            const n = parseInt(key.slice(1), 10);
            const mod = this.__xtermModParam(m);
            const plain = mod === 1;

            if (n >= 1 && n <= 4) {
                const code = ["P", "Q", "R", "S"][n - 1];
                return plain ? `\x1bO${code}` : `\x1b[1;${mod}${code}`;
            }

            const baseMap: Record<number, number> = {
                5: 15,
                6: 17,
                7: 18,
                8: 19,
                9: 20,
                10: 21,
                11: 23,
                12: 24
            };

            const base = baseMap[n];
            if (!base) return "";
            return plain ? `\x1b[${base}~` : `\x1b[${base};${mod}~`;
        }

        const mod = this.__xtermModParam(m);
        const plain = mod === 1;

        if (key === "ArrowUp") return plain ? "\x1b[A" : `\x1b[1;${mod}A`;
        if (key === "ArrowDown") return plain ? "\x1b[B" : `\x1b[1;${mod}B`;
        if (key === "ArrowRight") return plain ? "\x1b[C" : `\x1b[1;${mod}C`;
        if (key === "ArrowLeft") return plain ? "\x1b[D" : `\x1b[1;${mod}D`;

        if (key.length === 1) {
            let k = key;

            if (m.shift && !m.ctrl) k = this.__applyShiftToChar(k);

            let s = k;

            if (m.ctrl) {
                const c = this.__ctrlify(k);
                if (!c) return "";
                s = c;
            }

            if (m.alt) s = "\x1b" + s;
            if (m.meta) s = "\x1b" + s;

            return s;
        }

        return "";
    }

    /**
     * @returns {void} Synchronises the visual pressed state of modifier buttons and Fn row classes.
     */
    __syncButtons(): void {
        const set = (name: ModName): void => {
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
        } else {
            bar.classList.remove("fn-on");
            if (hadFnOn) bar.classList.add("fn-exiting");
        }

        if (!this.mods.fn && !bar.classList.contains("fn-exiting")) {
            const grid = bar.querySelector(".fn-grid") as HTMLElement | null;
            if (grid) grid.style.transform = "";
        }

        this.__schedule();
    }

    /**
     * @returns {void} Clears one-shot modifiers while preserving Fn.
     */
    __clearOneShotMods(): void {
        const hadOneShot = this.mods.ctrl || this.mods.alt || this.mods.meta || this.mods.shift;
        if (!hadOneShot) return;

        this.mods.ctrl = false;
        this.mods.alt = false;
        this.mods.meta = false;
        this.mods.shift = false;
        this.__syncButtons();
    }

    /**
     * @returns {void} Clears all modifiers including Fn.
     */
    __clearMods(): void {
        this.mods.ctrl = false;
        this.mods.alt = false;
        this.mods.meta = false;
        this.mods.shift = false;
        this.mods.fn = false;
        this.__syncButtons();
    }

    /**
     * @param {ModName} name - Modifier name.
     * @returns {void} Toggles the named modifier and refreshes button state.
     */
    __toggleMod(name: ModName): void {
        this.mods[name] = !this.mods[name];
        this.__syncButtons();
    }

    /**
     * @param {string} key - Key identifier.
     * @returns {void} Sends the key sequence and clears only one-shot modifiers afterwards.
     */
    __fireKey(key: string): void {
        const seq = this.__seqFor(key, this.mods);
        if (!seq) return;

        this.send!({ key, seq, mods: { ...this.mods } });

        if (key === "Escape") {
            this.skipNextRefocus = true;
            this.__blurActiveEditable();
            this.__hideToolbar();
            return;
        }

        this.__clearOneShotMods();
    }

    /**
     * @param {Element} btn - Button element.
     * @returns {void} Handles modifier toggles and normal key presses for toolbar buttons.
     */
    __handleButtonPress(btn: Element): void {
        const mod = btn.getAttribute("data-mod");
        if (mod === "ctrl" || mod === "alt" || mod === "meta" || mod === "shift" || mod === "fn") {
            this.__toggleMod(mod);
            return;
        }

        const key = btn.getAttribute("data-key");
        if (!key) return;

        this.__fireKey(key);
    }

    /**
     * @param {TouchEvent} e - Touch event.
     * @returns {void} Prevents scroll gestures while touching the toolbar.
     */
    __onTouchMove(e: TouchEvent): void {
        e.preventDefault();
    }

    /**
     * @param {PointerEvent} e - Pointer event.
     * @returns {void} Handles touch presses on toolbar buttons while keeping focus on the editable target.
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

        this.__handleButtonPress(btn);

        if (this.skipNextRefocus) {
            this.skipNextRefocus = false;
            return;
        }

        window.requestAnimationFrame(this.__refocusEditableBound);
    }

    /**
     * @param {MouseEvent} e - Click event.
     * @returns {void} Handles mouse clicks on toolbar buttons.
     */
    __onClick(e: MouseEvent): void {
        if (this.suppressNextClick) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            return;
        }

        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest("button") as HTMLButtonElement | null;
        if (!btn) return;

        this.__handleButtonPress(btn);

        if (this.skipNextRefocus) {
            this.skipNextRefocus = false;
            return;
        }

        if (this.lastEditable) window.requestAnimationFrame(this.__refocusEditableBound);
    }

    /**
     * @param {Event} e - Event.
     * @returns {void} Intercepts text input while modifiers are armed.
     */
    __onBeforeInputCapture(e: Event): void {
        if (!this.mods.ctrl && !this.mods.alt && !this.mods.meta && !this.mods.shift && !this.mods.fn) return;
        if (!(e instanceof InputEvent)) return;

        const type = e.inputType || "";
        const data = typeof e.data === "string" ? e.data : "";

        if (type === "insertText" && data.length === 1) {
            const seq = this.__seqFor(data, this.mods);
            if (!seq) return;

            e.preventDefault();
            e.stopPropagation();
            this.send!({ key: data, seq, mods: { ...this.mods } });
            this.__clearOneShotMods();
            return;
        }

        if (type === "insertLineBreak" || type === "insertParagraph") {
            const seq = this.__seqFor("Enter", this.mods);
            if (!seq) return;

            e.preventDefault();
            e.stopPropagation();
            this.send!({ key: "Enter", seq, mods: { ...this.mods } });
            this.__clearOneShotMods();
            return;
        }

        if (type === "deleteContentBackward") {
            const key = this.mods.fn ? "Delete" : "Backspace";
            const seq = this.__seqFor("Backspace", this.mods);
            if (!seq) return;

            e.preventDefault();
            e.stopPropagation();
            this.send!({ key, seq, mods: { ...this.mods } });
            this.__clearOneShotMods();
        }
    }

    /**
     * @param {KeyboardEvent} e - Keyboard event.
     * @returns {void} Intercepts physical key presses while modifiers are armed.
     */
    __onKeyDownCapture(e: KeyboardEvent): void {
        if (!this.mods.ctrl && !this.mods.alt && !this.mods.meta && !this.mods.shift && !this.mods.fn) return;

        const k = e.key;
        if (k === "Alt" || k === "Control" || k === "Meta" || k === "Shift") return;

        const seq = this.__seqFor(k, this.mods);
        if (!seq) return;

        e.preventDefault();
        e.stopPropagation();
        this.send!({ key: k, seq, mods: { ...this.mods } });
        this.__clearOneShotMods();
    }

    /**
     * @returns {void} Positions the toolbar against the bottom edge of the visual viewport.
     */
    __place(): void {
        const bar = this.bar!;
        const rect = bar.getBoundingClientRect();
        const height = Math.max(0, Math.ceil(rect.height || bar.offsetHeight || 0));
        const bottom = this.vv ? this.vv.offsetTop + this.vv.height : window.innerHeight;

        const width = document.documentElement.clientWidth || window.innerWidth;
        const top = Math.round(bottom - height + keyboardEmu.VIEWPORT_OVERLAP_PX);

        bar.style.top = `${top}px`;
        bar.style.left = "0px";
        bar.style.width = `${width}px`;
    }

    /**
     * @returns {void} Schedules a layout pass on the next animation frame.
     */
    __schedule(): void {
        if (!this.bar) return;
        if (this.raf) return;

        this.raf = window.requestAnimationFrame(() => {
            this.raf = 0;
            this.__fitToWidth();
            this.__fitFnRowToWidth();
            this.__applyStackingIfNeeded();
            this.__place();
        });
    }
}