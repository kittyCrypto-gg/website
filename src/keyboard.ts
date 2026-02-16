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
     * @returns {string} A fully resolved URL string based on the provided path and the module's location. The function attempts to create a new URL object using the given path and the current module's URL as the base. If successful, it returns the absolute URL as a string. If the URL construction fails (e.g., due to an invalid path), it falls back to returning the original path string. This method is useful for resolving resource paths in a way that is compatible with various module bundlers and environments.
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

    /**
     * @param {boolean} isMobile - Whether the device is mobile.
     * @param {string} htmlUrl - Keyboard HTML URL.
     * @param {string} cssUrl - Keyboard CSS URL.
     */
    constructor(isMobile?: unknown, htmlUrl?: unknown, cssUrl?: unknown) {
        this.isMobile = !!isMobile;

        this.htmlUrl = typeof htmlUrl === "string" && htmlUrl !== ""
            ? keyboardEmu.__resolveURL(htmlUrl)
            : keyboardEmu.__resolveURL("../keyboard.html");

        this.cssUrl = typeof cssUrl === "string" && cssUrl !== ""
            ? keyboardEmu.__resolveURL(cssUrl)
            : keyboardEmu.__resolveURL("../styles/modules/keyboard.css");

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
    }

    /**
     * @param {boolean} v - Mobile flag.
     * @returns {void} This method updates the internal state of the keyboard emulator to reflect whether it is being used on a mobile device. It also adjusts the styling of the toolbar accordingly by setting CSS custom properties for padding and applying responsive labels. Finally, it schedules a re-render of the toolbar to ensure that the changes take effect visually. This allows the keyboard emulator to adapt its appearance and behavior based on the device type, providing an optimized user experience for both mobile and desktop users.
     */
    setIsMobile(v: unknown): void {
        this.isMobile = !!v;
        if (!this.bar) return;
        this.bar.style.setProperty("--outer-pad-x", this.isMobile ? "6px" : "8px");
        this.bar.style.setProperty("--outer-pad-y", this.isMobile ? "6px" : "8px");
        this.__applyResponsiveLabels(this.bar);
        this.__schedule();
    }

    /**
     * @param {unknown} options - Installation options.
     * @param {unknown} targets - Allowed targets / editables.
     */
    async install(options?: unknown, targets?: unknown): Promise<this> {
        const opts = options || {};
        this.opts = opts;

        /**
         * @param {unknown[]} values - Values to check in order.
         */
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

        const zIndex = typeof optsRecord["zIndex"] === "number" ? (optsRecord["zIndex"] as number) : keyboardEmu.DEFAULT_Z_INDEX;
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

        bar.style.setProperty("--toolbar-z", String(zIndex));
        bar.style.setProperty("--outer-pad-x", this.isMobile ? "6px" : "8px");
        bar.style.setProperty("--outer-pad-y", this.isMobile ? "6px" : "8px");

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
        this.toolbarVisible = true;

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

        this.suppressNextClick = false;
        bar.addEventListener("pointerdown", this.__onPointerDownCaptureBound, { capture: true, passive: false });
        bar.addEventListener("click", this.__onClickBound);

        document.addEventListener("beforeinput", this.__onBeforeInputCaptureBound, true);
        document.addEventListener("keydown", this.__onKeyDownCaptureBound, true);

        this.vv = window.visualViewport || null;
        this.raf = 0;

        this.ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => this.__schedule()) : null;
        if (this.ro) this.ro.observe(document.documentElement);

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
     * @returns {void} This method sets the function that will be called to send key events from the keyboard emulator. The provided function should accept a payload containing the key, its corresponding escape sequence, and the current modifier states. If the input is a valid function, it is assigned to the `send` property of the instance; otherwise, the `send` property remains unchanged. This allows users of the keyboard emulator to define custom behavior for how key events are transmitted, such as sending them to a terminal emulator or handling them in a specific way within an application.
     */
    setSend(fn: unknown): void {
        if (typeof fn === "function") this.send = fn as SendFn;
    }

    /**
     * @param {boolean} v - Visibility flag.
     * @returns
     */
    setVisible(v: boolean): void {
        if (!this.bar) return;
        if (v) this.__showToolbar();
        else this.__hideToolbar();
    }

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

        if (this.ro) this.ro.disconnect();

        if (this.raf) window.cancelAnimationFrame(this.raf);
        bar.remove();

        if (this.cssInjected && this.cssLink && this.cssLink.isConnected) this.cssLink.remove();

        this.bar = null;
        this.vv = null;
        this.ro = null;
        this.raf = 0;

        document.removeEventListener("click", this.__onDocClickCaptureBound, true);

        return;
    }

    /**
     * @param e - Click event.
     * @returns {void} This method handles click events on the document to prevent unintended interactions when the keyboard emulator is active. If the `suppressNextClick` flag is set, it prevents the default action and stops the propagation of the click event. This is useful for scenarios where a click might trigger an unwanted behavior, such as refocusing an input element or interacting with other UI elements while the user is trying to use the on-screen keyboard. After handling the event, it resets the `suppressNextClick` flag to ensure that only one click is suppressed at a time.
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

    __nextFrame(): Promise<void> {
        return new Promise<void>((resolve) => {
            window.requestAnimationFrame(() => resolve());
        });
    }

    /**
     * @param id - Element id.
     * @returns {Promise<void>} A promise that resolves when an element with the specified id is present in the DOM. The method continuously checks for the presence of the element by its id and waits for the next animation frame if it is not found. This is useful for ensuring that certain elements are loaded and available before performing operations that depend on them, such as attaching event listeners or manipulating their properties. The promise resolves once the element is detected in the DOM, allowing subsequent code to safely interact with it.
     */
    async __waitForElementById(id: string): Promise<void> {
        while (!document.getElementById(id)) {
            await this.__nextFrame();
        }
    }

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
     * @returns {Promise<void>} This method fetches the HTML content for the keyboard emulator from the specified URL and injects it into the provided toolbar element. It first performs a fetch request to retrieve the HTML content, checking for a successful response. If the fetch is successful, it reads the response as text and sets it as the innerHTML of the toolbar. The toolbar is then appended to the document body. Finally, the method waits for a specific marker element (identified by `keyboardEmu.MARKER_ID`) to be present in the DOM before resolving, ensuring that the HTML content has been fully loaded and parsed before any further operations are performed on it.
     */
    async __injectKeyboardHTML(bar: HTMLDivElement): Promise<void> {
        const res = await fetch(this.htmlUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Failed to load keyboard_interface.html (${res.status})`);

        const html = await res.text();
        bar.innerHTML = html;

        document.body.appendChild(bar);
        await this.__waitForElementById(keyboardEmu.MARKER_ID);
    }

    /**
     * @param {HTMLDivElement} bar - Toolbar element.
     * @returns {void} This method updates the text content of elements within the toolbar based on the current device type (mobile or desktop). It searches for elements that have both `data-mobile-text` and `data-desktop-text` attributes, and sets their text content to the appropriate value depending on whether the `isMobile` flag is true or false. This allows the keyboard emulator to display different labels for keys or buttons that are more suitable for mobile or desktop users, enhancing the user experience by providing contextually relevant information on the toolbar.
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
     * @returns {number} The clamped value, which will be between the specified minimum and maximum. If the input value `n` is less than the minimum, the function returns the minimum. If `n` is greater than the maximum, it returns the maximum. Otherwise, it returns `n` unchanged. This is a common utility function used to ensure that a value stays within a defined range, preventing it from exceeding specified bounds.
     */
    __clamp(n: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, n));
    }

    /**
     * @param {string} name - CSS variable name.
     * @param {number} v - Pixel value.
     * @returns {void} This method sets a CSS custom property (variable) on the toolbar element with a pixel value. The `name` parameter specifies the name of the CSS variable to set, and the `v` parameter is the numeric value that will be converted to a string with "px" units. The method formats the value to two decimal places for precision and updates the toolbar's style accordingly. This allows for dynamic adjustments of the toolbar's appearance based on calculated dimensions or user interactions, ensuring that the layout remains consistent and visually appealing across different devices and screen sizes.
     */
    __setPxVar(name: string, v: number): void {
        this.bar!.style.setProperty(name, `${v.toFixed(2)}px`);
    }

    /**
     * @param {unknown} el - Candidate element.
     * @returns {boolean} This method checks if a given element is considered editable, meaning it can receive text input from the user. It returns true if the element is content editable, a textarea, or an input element of certain types (excluding buttons, checkboxes, radios, and other non-text inputs). The method first verifies that the input is an instance of HTMLElement, then checks for content editability and specific tag types to determine if the element can be interacted with as an editable field. This is useful for the keyboard emulator to decide when to show or hide itself based on the user's focus on editable elements.
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
     * @returns {void} This method applies the visibility state to the toolbar element. If the `visible` parameter is true, it sets the toolbar's opacity to 1, enables pointer events, and sets its z-index to the configured value. If `visible` is false, it sets the opacity to 0, disables pointer events, and moves it behind other elements by setting a negative z-index. Additionally, it uses the `inert` attribute to make the toolbar non-interactive when hidden, preventing it from receiving focus or being interacted with by assistive technologies. This ensures that the toolbar behaves appropriately based on its visibility state, providing a seamless user experience.
     */
    __applyVisibility(visible: boolean): void {
        this.toolbarVisible = visible;
        this.bar!.style.opacity = visible ? "1" : "0";
        this.bar!.style.pointerEvents = visible ? "auto" : "none";
        this.bar!.style.setProperty("--toolbar-z", visible ? String(this.zIndex) : String(keyboardEmu.HIDDEN_Z));
        (this.bar as unknown as { inert: boolean }).inert = !visible;
    }

    __showToolbar(): void {
        if (this.toolbarVisible) return;
        this.__applyVisibility(true);
        this.__schedule();
    }

    __hideToolbar(): void {
        if (!this.toolbarVisible) return;
        this.__applyVisibility(false);
        this.__clearMods();
    }

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
     * @returns {void} This method handles focus events on the document to determine when to show the keyboard emulator toolbar. When an element receives focus, it checks if the focused element is considered editable using the `__isEditable` method. If the element is editable, it updates the `lastEditable` property to reference the newly focused element and calls the `__showToolbar` method to make the toolbar visible. If the focused element is not editable, it does nothing, allowing the toolbar to remain hidden. This ensures that the keyboard emulator only appears when the user is interacting with elements that can receive text input, providing a context-sensitive user experience.
     */
    __onFocusIn(e: FocusEvent): void {
        const t = e.target;
        if (!(this as unknown as { __isEditable: (el: unknown) => boolean }).__isEditable(t)) return;
        this.lastEditable = t as HTMLElement;
        this.__showToolbar();
    }

    /**
     * @param {FocusEvent} _e - Focus event.
     * @returns {void} This method handles focus out events on the document to determine when to hide the keyboard emulator toolbar. When an element loses focus, it triggers an update to check the currently active element after a short delay (using `requestAnimationFrame`) to see if it is still an editable element. If the new active element is not editable, it calls the `__hideToolbar` method to hide the toolbar. This ensures that the keyboard emulator only remains visible when the user is focused on an editable element, providing a clean and intuitive user interface that responds appropriately to user interactions.
     */
    __onFocusOut(_e: FocusEvent): void {
        void this.__updateVisibilityFromActive();
    }

    __applyStackingIfNeeded(): void {
        const buttons = this.bar!.querySelectorAll<HTMLButtonElement>("button");

        for (const btn of buttons) {
            btn.classList.remove("stacked");

            const icon = btn.querySelector<HTMLElement>(".key-icon");
            const text = btn.querySelector<HTMLElement>(".key-text");
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

    __fitToWidthMobile(): void {
        const cs = getComputedStyle(this.bar!);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const w = this.bar!.clientWidth - padL - padR;
        if (!w || !Number.isFinite(w)) return;

        const btnGap = this.__clamp(w * 0.010, 2, 6);

        const minKeyW = 28;
        const maxKeyW = 46;
        const cols = 7;
        const keyW = this.__clamp((w - ((cols - 1) * btnGap)) / cols, minKeyW, maxKeyW);

        const keyH = this.__clamp(keyW * 0.92, 30, 44);

        const font = this.__clamp(keyW * 0.30, 10.5, 13.0);
        const icon = this.__clamp(font * 1.08, 11.5, 15.0);
        const padX = this.__clamp(keyW * 0.18, 6, 10);
        const radius = this.__clamp(keyW * 0.22, 8, 10);
        const innerGap = this.__clamp(keyW * 0.10, 3, 6);

        this.__setPxVar("--key-w", keyW);
        this.__setPxVar("--key-h", keyH);
        this.__setPxVar("--btn-gap", btnGap);
        this.__setPxVar("--pad-x", padX);
        this.__setPxVar("--inner-gap", innerGap);
        this.__setPxVar("--font-size", font);
        this.__setPxVar("--icon-size", icon);
        this.__setPxVar("--radius", radius);
    }

    __fitToWidthDesktop(): void {
        const cs = getComputedStyle(this.bar!);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const available = this.bar!.clientWidth - padL - padR;
        const grid = this.bar!.querySelector<HTMLElement>(".key-grid");

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

    __fitToWidth(): void {
        if (this.isMobile) this.__fitToWidthMobile();
        else this.__fitToWidthDesktop();
    }

    __fitFnRowToWidth(): void {
        const wrap = this.bar!.querySelector<HTMLElement>(".fn-grid-wrap");
        const grid = this.bar!.querySelector<HTMLElement>(".fn-grid");
        if (!wrap || !grid) return;

        if (!this.toolbarVisible || !this.mods.fn) {
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
     * @returns {number} The xterm modifier parameter based on the provided keyboard modifier state. The function calculates the modifier parameter by starting with a base value of 1 and adding specific values for each active modifier key: Shift adds 1, Alt adds 2, Ctrl adds 4, and Meta adds 8. This results in a unique number that represents the combination of active modifiers, which can be used in escape sequences to indicate the state of modifier keys when sending key events to a terminal emulator.
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
     * @returns {string} The control character corresponding to the given input character. If the input character is a space, it returns the null character (0x00). If the character is an uppercase or lowercase letter (A-Z or a-z), it converts it to uppercase and returns the corresponding control character by subtracting 64 from its ASCII code. For specific punctuation characters, it returns their respective control characters based on standard ASCII control character mappings. If the input character does not match any of these cases, it returns an empty string. This function is used to determine the control character that should be sent when a key is pressed with the Ctrl modifier in the keyboard emulator.
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
     * @returns {string} The character resulting from applying the Shift modifier to the given input character. If the input character is a lowercase letter (a-z), it converts it to uppercase by subtracting 32 from its ASCII code. For specific punctuation characters, it returns their respective shifted characters based on standard keyboard layouts (e.g., '1' becomes '!', '2' becomes '@', etc.). If the input character does not match any of these cases, it checks a predefined mapping (`keyboardEmu.SHIFT_MAP`) for additional characters that may have shifted counterparts. If no mapping is found, it returns the original character unchanged. This function is used to determine the character that should be sent when a key is pressed with the Shift modifier in the keyboard emulator.
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
     * @returns {string} The escape sequence corresponding to the given key and modifier state. The function handles various special keys (such as Escape, Enter, Backspace, Delete, Tab, Arrow keys, and Function keys) and generates the appropriate escape sequences based on the active modifiers. For regular character keys, it applies the Shift modifier if necessary and then applies the Ctrl and Alt modifiers to generate the final sequence. If the key does not match any recognized patterns or if the combination of key and modifiers does not produce a valid sequence, it returns an empty string. This method is essential for translating user interactions with the on-screen keyboard into the correct input sequences that can be sent to a terminal emulator or other applications.
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

    __syncButtons(): void {
        /**
         * @param {ModName} name - Modifier name.
         * @returns {void} This function updates the visual state of a modifier key button in the toolbar based on the current state of the modifier. It takes the name of the modifier (e.g., "ctrl", "alt", "meta", "shift", "fn") as an argument, finds the corresponding button element in the toolbar using a data attribute, and then toggles the "sticky-on" class and updates
         */
        const set = (name: ModName): void => {
            const b = this.bar!.querySelector<HTMLButtonElement>(`button[data-mod="${name}"]`);
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

        this.bar!.classList.toggle("fn-on", !!this.mods.fn);

        if (!this.mods.fn) {
            const grid = this.bar!.querySelector<HTMLElement>(".fn-grid");
            if (grid) grid.style.transform = "";
        }

        this.__schedule();
    }

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
     * @returns {void} This method toggles the state of a specified modifier key and updates the corresponding button in the toolbar to reflect the new state. When a modifier key (such as Ctrl, Alt, Meta, Shift, or Fn) is toggled, it changes its boolean value in the `mods` object and then calls the `__syncButtons` method to update the visual appearance of the buttons on the toolbar. This allows users to see which modifier keys are currently active and ensures that the internal state of the keyboard emulator remains consistent with the user's interactions.
     */
    __toggleMod(name: ModName): void {
        this.mods[name] = !this.mods[name];
        this.__syncButtons();
    }

    /**
     * @param {string} key - Key identifier.
     * @returns {void} This method handles the firing of a key event based on the provided key identifier and the current state of modifier keys. It first generates the appropriate escape sequence for the given key and modifiers using the `__seqFor` method. If a valid sequence is returned, it sends the key event using the `send` function, passing an object that includes the key, its corresponding escape sequence, and the current modifier states. If the key is "Escape", it also sets a flag to skip refocusing, blurs any active editable element, and hides the toolbar. Finally, it clears all modifier states to reset the keyboard emulator for the next input. This method is central to translating user interactions with the on-screen keyboard into actionable events that can be processed by a terminal emulator or other applications.
     */
    __fireKey(key: string): void {
        const seq = this.__seqFor(key, this.mods);
        if (!seq) return;

        this.send!({ key, seq, mods: { ...this.mods } });

        if (key === "Escape") {
            this.skipNextRefocus = true;
            this.__blurActiveEditable();
            this.__hideToolbar();
        }

        this.__clearMods();
    }

    /**
     * @param {Element} btn - Button element.
     * @returns {void} This method processes a button press event on the toolbar by determining whether the pressed button corresponds to a modifier key or a regular key. If the button has a `data-mod` attribute, it toggles the state of the corresponding modifier key using the `__toggleMod` method. If the button has a `data-key` attribute, it fires the associated key event using the `__fireKey` method. This allows users to interact with the on-screen keyboard by pressing buttons that represent either modifier keys (like Ctrl, Alt, Shift) or regular keys, and ensures that the appropriate actions are taken based on their input.
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
     * @returns {void} This method handles touch move events on the toolbar to prevent unintended scrolling or other default behaviors when the user interacts with the on-screen keyboard on a mobile device. By calling `e.preventDefault()`, it ensures that touch movements do not cause the page to scroll or trigger other default actions, allowing for a smoother and more controlled user experience when using the keyboard emulator on touch-enabled devices.
     */
    __onTouchMove(e: TouchEvent): void {
        e.preventDefault();
    }

    /**
     * @param {PointerEvent} e - Pointer event.
     * @returns {void} This method handles pointer down events on the toolbar to manage interactions with the on-screen keyboard, particularly on mobile devices. It first checks if the event is a touch event and if the target element is a button within the toolbar. If these conditions are met, it prevents the default behavior and stops the propagation of the event to avoid unintended interactions, such as refocusing input elements or triggering other UI actions. It then processes the button press using the `__handleButtonPress` method. Finally, it schedules a refocus of the last editable element after the current event loop using `requestAnimationFrame`, unless a flag (`skipNextRefocus`) is set to skip this action. This ensures that the keyboard emulator remains responsive and behaves correctly when users interact with it on touch devices.
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
     * @returns {void} This method handles click events on the toolbar to manage interactions with the on-screen keyboard. It checks if a flag (`suppressNextClick`) is set, which indicates that the next click event should be ignored (typically after a pointer down event on touch devices). If the flag is set, it prevents the default action and stops the propagation of the click event to avoid unintended interactions. If the click event is valid, it identifies the button that was clicked and processes it using the `__handleButtonPress` method. Finally, it schedules a refocus of the last editable element after the current event loop using `requestAnimationFrame`, unless a flag (`skipNextRefocus`) is set to skip this action. This ensures that the keyboard emulator remains responsive and behaves correctly when users interact with it using mouse clicks.
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
     * @returns {void} This method handles beforeinput events on the document to capture and process text input from the user when modifier keys are active. It first checks if any modifier keys (Ctrl, Alt, Meta, Shift, Fn) are currently active; if not, it returns early. It also verifies that the event is an instance of `InputEvent`. Depending on the type of input (e.g., inserting text, inserting a line break, deleting content), it generates the appropriate escape sequence using the `__seqFor` method and sends it using the `send` function. After processing the input, it clears the modifier states to reset the keyboard emulator for the next input. This method is crucial for ensuring that text input is correctly captured and translated into the expected sequences when users interact with editable elements while modifiers are active.
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
            this.__clearMods();
            return;
        }

        if (type === "insertLineBreak" || type === "insertParagraph") {
            const seq = this.__seqFor("Enter", this.mods);
            if (!seq) return;
            e.preventDefault();
            e.stopPropagation();
            this.send!({ key: "Enter", seq, mods: { ...this.mods } });
            this.__clearMods();
            return;
        }

        if (type === "deleteContentBackward") {
            const seq = this.__seqFor("Backspace", this.mods);
            if (!seq) return;
            e.preventDefault();
            e.stopPropagation();
            this.send!({ key: this.mods.fn ? "Delete" : "Backspace", seq, mods: { ...this.mods } });
            this.__clearMods();
            return;
        }
    }

    /**
     * @param {KeyboardEvent} e - Keyboard event.
     * @returns {void} This method handles keydown events on the document to capture and process key presses when modifier keys are active. It first checks if any modifier keys (Ctrl, Alt, Meta, Shift, Fn) are currently active; if not, it returns early. It also ignores key presses for the modifier keys themselves. For other keys, it generates the appropriate escape sequence using the `__seqFor` method and sends it using the `send` function. After processing the key press, it clears the modifier states to reset the keyboard emulator for the next input. This method is essential for ensuring that key presses are correctly captured and translated into the expected sequences when users interact with editable elements while modifiers are active.
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
        this.__clearMods();
    }

    __place(): void {
        const h = this.bar!.offsetHeight || 56;
        const bottom = this.vv ? this.vv.offsetTop + this.vv.height : window.innerHeight;

        const w = document.documentElement.clientWidth || window.innerWidth;
        const inset = this.isMobile ? Math.round(this.__clamp(w * 0.02, 6, 14)) : 0;
        const ww = Math.max(0, w - inset * 2);

        this.bar!.style.top = `${bottom - h}px`;
        this.bar!.style.left = `${inset}px`;
        this.bar!.style.width = `${ww}px`;
    }

    __schedule(): void {
        if (!this.bar) return;
        if (this.raf) return;
        this.raf = window.requestAnimationFrame(() => {
            this.raf = 0;
            this.__place();
            this.__fitToWidth();
            this.__fitFnRowToWidth();
            this.__applyStackingIfNeeded();
            this.__place();
        });
    }
}