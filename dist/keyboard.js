export class keyboardEmu {
    static MARKER_ID = "keyboard-emu-html-loaded";
    static CSS_LINK_ID = "keyboard-emu-css";
    static DEFAULT_Z_INDEX = 2147483647;
    static HIDDEN_Z = -1;

    static SHIFT_MAP = {
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

    static DESKTOP_PRESETS = [
        { keyW: 44, keyH: 40, btnGap: 8, padX: 12, innerGap: 6, font: 13, icon: 15, radius: 10 },
        { keyW: 42, keyH: 38, btnGap: 7, padX: 11, innerGap: 6, font: 12.5, icon: 14.5, radius: 10 },
        { keyW: 40, keyH: 36, btnGap: 6, padX: 10, innerGap: 5, font: 12, icon: 14, radius: 9 },
        { keyW: 38, keyH: 34, btnGap: 5, padX: 9, innerGap: 5, font: 11.5, icon: 13.5, radius: 9 }
    ];

    static __resolveURL(path) {
        try {
            return new URL(path, import.meta.url).toString();
        } catch {
            return path;
        }
    }

    constructor(isMobile, htmlUrl, cssUrl) {
        this.isMobile = !!isMobile;

        this.htmlUrl = typeof htmlUrl === "string" && htmlUrl !== ""
            ? keyboardEmu.__resolveURL(htmlUrl)
            : keyboardEmu.__resolveURL("../keyboard.html");

        this.cssUrl = typeof cssUrl === "string" && cssUrl !== ""
            ? keyboardEmu.__resolveURL(cssUrl)
            : keyboardEmu.__resolveURL("../styles/keyboard.css");

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

    setIsMobile(v) {
        this.isMobile = !!v;
        if (!this.bar) return;
        this.bar.style.setProperty("--outer-pad-x", this.isMobile ? "6px" : "8px");
        this.bar.style.setProperty("--outer-pad-y", this.isMobile ? "6px" : "8px");
        this.__applyResponsiveLabels(this.bar);
        this.__schedule();
    }

    async install(options, targets) {
        const opts = options || {};
        this.opts = opts;

        const firstDefined = (...values) => {
            for (const v of values) {
                if (v !== undefined) return v;
            }
            return null;
        };

        const allowRaw = firstDefined(
            targets,
            opts.targets,
            opts.target,
            opts.allowed,
            opts.allow,
            opts.editables,
            opts.editable
        );

        const allowed = (() => {
            if (!allowRaw) return [];
            if (Array.isArray(allowRaw)) return allowRaw;
            if (allowRaw instanceof Element) return [allowRaw];
            if (typeof allowRaw === "object" && typeof allowRaw.length === "number") {
                try {
                    return Array.from(allowRaw);
                } catch {
                    return [];
                }
            }
            return [];
        })()
            .filter((x) => x instanceof Element);

        const baseIsEditable = keyboardEmu.prototype.__isEditable.bind(this);
        const allowedSet = new Set(allowed);

        this.__isEditable = (el) => {
            if (!baseIsEditable(el)) return false;
            if (!allowedSet.size) return false;
            if (!(el instanceof Element)) return false;
            for (const a of allowedSet) {
                if (a === el) return true;
                if (typeof a.contains === "function" && a.contains(el)) return true;
            }
            return false;
        };

        const zIndex = typeof opts.zIndex === "number" ? opts.zIndex : keyboardEmu.DEFAULT_Z_INDEX;
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

        this.send =
            typeof opts.send === "function"
                ? opts.send
                : (p) => {
                    const t = (window).term;
                    if (t && typeof t.write === "function") t.write(p.seq);
                };

        this.lastEditable = null;

        this.toolbarVisible = true;

        document.addEventListener("focusin", this.__onFocusInBound, true);
        document.addEventListener("focusout", this.__onFocusOutBound, true);

        const initialActive = (document.activeElement);
        if (this.__isEditable(initialActive)) {
            this.lastEditable = (initialActive);
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

    setSend(fn) {
        if (typeof fn === "function") this.send = fn;
    }

    setVisible(v) {
        if (!this.bar) return;
        if (v) this.__showToolbar();
        else this.__hideToolbar();
    }

    destroy() {
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

    __onDocClickCapture(e) {
        if (!this.suppressNextClick) return;

        this.suppressNextClick = false;

        e.preventDefault();
        e.stopPropagation();

        if (typeof e.stopImmediatePropagation === "function") {
            e.stopImmediatePropagation();
        }
    }


    __nextFrame() {
        return new Promise((resolve) => {
            window.requestAnimationFrame(() => resolve(undefined));
        });
    }

    async __waitForElementById(id) {
        while (!document.getElementById(id)) {
            await this.__nextFrame();
        }
    }

    __ensureKeyboardCSS() {
        const existing = (document.getElementById(keyboardEmu.CSS_LINK_ID));
        if (existing && existing.tagName === "LINK") return { link: existing, injected: false };

        const link = document.createElement("link");
        link.id = keyboardEmu.CSS_LINK_ID;
        link.rel = "stylesheet";
        link.href = this.cssUrl;
        link.setAttribute("data-owner", "keyboard-emu");
        document.head.appendChild(link);
        return { link, injected: true };
    }

    async __injectKeyboardHTML(bar) {
        const res = await fetch(this.htmlUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Failed to load keyboard_interface.html (${res.status})`);

        const html = await res.text();
        bar.innerHTML = html;

        document.body.appendChild(bar);
        await this.__waitForElementById(keyboardEmu.MARKER_ID);
    }

    __applyResponsiveLabels(bar) {
        const nodes = bar.querySelectorAll("[data-mobile-text][data-desktop-text]");
        for (const el of nodes) {
            const m = el.getAttribute("data-mobile-text") || "";
            const d = el.getAttribute("data-desktop-text") || "";
            el.textContent = this.isMobile ? m : d;
        }
    }

    __clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    __setPxVar(name, v) {
        this.bar.style.setProperty(name, `${v.toFixed(2)}px`);
    }

    __isEditable(el) {
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

    __refocusEditable() {
        const el = this.lastEditable;
        if (!el) return;
        if (!document.contains(el)) return;
        try {
            el.focus({ preventScroll: true });
        } catch {
            el.focus();
        }
    }

    __blurActiveEditable() {
        const a = (document.activeElement);
        if (!this.__isEditable(a)) return;
        try {
            (a).blur();
        } catch {
        }
    }

    __applyVisibility(visible) {
        this.toolbarVisible = visible;
        this.bar.style.opacity = visible ? "1" : "0";
        this.bar.style.pointerEvents = visible ? "auto" : "none";
        this.bar.style.setProperty("--toolbar-z", visible ? String(this.zIndex) : String(keyboardEmu.HIDDEN_Z));
        this.bar.inert = !visible;
    }

    __showToolbar() {
        if (this.toolbarVisible) return;
        this.__applyVisibility(true);
        this.__schedule();
    }

    __hideToolbar() {
        if (!this.toolbarVisible) return;
        this.__applyVisibility(false);
        this.__clearMods();
    }

    async __updateVisibilityFromActive() {
        await this.__nextFrame();
        const a = (document.activeElement);
        if (this.__isEditable(a)) {
            this.lastEditable = (a);
            this.__showToolbar();
            return;
        }
        this.__hideToolbar();
    }

    __onFocusIn(e) {
        const t = (e.target);
        if (!this.__isEditable(t)) return;
        this.lastEditable = (t);
        this.__showToolbar();
    }

    __onFocusOut(_e) {
        void this.__updateVisibilityFromActive();
    }

    __applyStackingIfNeeded() {
        const buttons = this.bar.querySelectorAll("button");

        for (const btn of buttons) {
            btn.classList.remove("stacked");

            const icon = (btn.querySelector(".key-icon"));
            const text = (btn.querySelector(".key-text"));
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

    __fitToWidthMobile() {
        const cs = getComputedStyle(this.bar);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const w = this.bar.clientWidth - padL - padR;
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

    __fitToWidthDesktop() {
        const cs = getComputedStyle(this.bar);
        const padL = parseFloat(cs.paddingLeft) || 0;
        const padR = parseFloat(cs.paddingRight) || 0;
        const available = this.bar.clientWidth - padL - padR;
        const grid = (this.bar.querySelector(".key-grid"));

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

    __fitToWidth() {
        if (this.isMobile) this.__fitToWidthMobile();
        else this.__fitToWidthDesktop();
    }

    __fitFnRowToWidth() {
        const wrap = (this.bar.querySelector(".fn-grid-wrap"));
        const grid = (this.bar.querySelector(".fn-grid"));
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

    __xtermModParam(m) {
        return (
            1 +
            (m.shift ? 1 : 0) +
            (m.alt ? 2 : 0) +
            (m.ctrl ? 4 : 0) +
            (m.meta ? 8 : 0)
        );
    }

    __ctrlify(ch) {
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

    __applyShiftToChar(ch) {
        if (ch.length !== 1) return ch;

        const code = ch.charCodeAt(0);
        if (code >= 97 && code <= 122) return String.fromCharCode(code - 32);

        return keyboardEmu.SHIFT_MAP[ch] || ch;
    }

    __seqFor(key, m) {
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

            const baseMap = {
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

    __syncButtons() {
        const set = (name) => {
            const b = (this.bar.querySelector(`button[data-mod="${name}"]`));
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

        this.bar.classList.toggle("fn-on", !!this.mods.fn);

        if (!this.mods.fn) {
            const grid = (this.bar.querySelector(".fn-grid"));
            if (grid) grid.style.transform = "";
        }

        this.__schedule();
    }

    __clearMods() {
        this.mods.ctrl = false;
        this.mods.alt = false;
        this.mods.meta = false;
        this.mods.shift = false;
        this.mods.fn = false;
        this.__syncButtons();
    }

    __toggleMod(name) {
        this.mods[name] = !this.mods[name];
        this.__syncButtons();
    }

    __fireKey(key) {
        const seq = this.__seqFor(key, this.mods);
        if (!seq) return;

        this.send({ key, seq, mods: { ...this.mods } });

        if (key === "Escape") {
            this.skipNextRefocus = true;
            this.__blurActiveEditable();
            this.__hideToolbar();
        }

        this.__clearMods();
    }

    __handleButtonPress(btn) {
        const mod = btn.getAttribute("data-mod");
        if (mod === "ctrl" || mod === "alt" || mod === "meta" || mod === "shift" || mod === "fn") {
            this.__toggleMod(mod);
            return;
        }

        const key = btn.getAttribute("data-key");
        if (!key) return;

        this.__fireKey(key);
    }

    __onTouchMove(e) {
        e.preventDefault();
    }

    __onPointerDownCapture(e) {
        if (!this.isMobile) return;
        if (e.pointerType && e.pointerType !== "touch") return;

        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest("button");
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

    __onClick(e) {
        if (this.suppressNextClick) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
            return;
        }

        const t = e.target;
        if (!(t instanceof Element)) return;

        const btn = t.closest("button");
        if (!btn) return;

        this.__handleButtonPress(btn);

        if (this.skipNextRefocus) {
            this.skipNextRefocus = false;
            return;
        }

        if (this.lastEditable) window.requestAnimationFrame(this.__refocusEditableBound);
    }

    __onBeforeInputCapture(e) {
        if (!this.mods.ctrl && !this.mods.alt && !this.mods.meta && !this.mods.shift && !this.mods.fn) return;
        if (!(e instanceof InputEvent)) return;

        const type = e.inputType || "";
        const data = typeof e.data === "string" ? e.data : "";

        if (type === "insertText" && data.length === 1) {
            const seq = this.__seqFor(data, this.mods);
            if (!seq) return;
            e.preventDefault();
            e.stopPropagation();
            this.send({ key: data, seq, mods: { ...this.mods } });
            this.__clearMods();
            return;
        }

        if (type === "insertLineBreak" || type === "insertParagraph") {
            const seq = this.__seqFor("Enter", this.mods);
            if (!seq) return;
            e.preventDefault();
            e.stopPropagation();
            this.send({ key: "Enter", seq, mods: { ...this.mods } });
            this.__clearMods();
            return;
        }

        if (type === "deleteContentBackward") {
            const seq = this.__seqFor("Backspace", this.mods);
            if (!seq) return;
            e.preventDefault();
            e.stopPropagation();
            this.send({ key: this.mods.fn ? "Delete" : "Backspace", seq, mods: { ...this.mods } });
            this.__clearMods();
            return;
        }
    }

    __onKeyDownCapture(e) {
        if (!this.mods.ctrl && !this.mods.alt && !this.mods.meta && !this.mods.shift && !this.mods.fn) return;

        const k = e.key;
        if (k === "Alt" || k === "Control" || k === "Meta" || k === "Shift") return;

        const seq = this.__seqFor(k, this.mods);
        if (!seq) return;

        e.preventDefault();
        e.stopPropagation();
        this.send({ key: k, seq, mods: { ...this.mods } });
        this.__clearMods();
    }

    __place() {
        const h = this.bar.offsetHeight || 56;
        const bottom = this.vv ? this.vv.offsetTop + this.vv.height : window.innerHeight;

        const w = document.documentElement.clientWidth || window.innerWidth;
        const inset = this.isMobile ? Math.round(this.__clamp(w * 0.02, 6, 14)) : 0;
        const ww = Math.max(0, w - inset * 2);

        this.bar.style.top = `${bottom - h}px`;
        this.bar.style.left = `${inset}px`;
        this.bar.style.width = `${ww}px`;
    }

    __schedule() {
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