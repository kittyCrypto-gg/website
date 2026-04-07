import * as window from "./window.ts";

type ModalMode = "blocking" | "non-blocking";

type ModalDecoratorInfo = Readonly<{
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
    windowed: boolean;
}>;

type ModalDecoratorContext = Readonly<{
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
    windowed: boolean;
    modalEl: HTMLDivElement;
    overlayEl: HTMLDivElement | null;
    close: () => void;
    setHtml: (html: string) => void;
}>;

type ModalDecorator = Readonly<{
    cssHref?: string;
    init?: () => void;
    patchHtml?: (html: string, info: ModalDecoratorInfo) => string;
    mount?: (ctx: ModalDecoratorContext) => void | (() => void);
}>;

type ModalSpec = Readonly<{
    id?: string;
    mode?: ModalMode;

    // Default true
    readerModeCompatible?: boolean;

    // Default false
    window?: boolean;

    content: string | (() => string);

    modalClassName?: string;
    overlayClassName?: string;

    closeOnEscape?: boolean;
    closeOnOutsideClick?: boolean;

    decorators?: readonly ModalDecorator[];
}>;

type OpenEntry = Readonly<{
    key: string;
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
    closeOnEscape: boolean;
    close: () => void;
    overlayEl: HTMLDivElement | null;
    stackEl: HTMLDivElement;
}>;

const MODAL_CLASS = "modal";
const OVERLAY_CLASS = "modal-overlay";
const NON_BLOCKING_STACK_ID = "non-blocking-modal-stack";
const READER_MODE_INCOMPATIBLE_CLASS = "readerModeIncompatible";
const WINDOW_FRAME_SUFFIX = "-window-frame";
const WINDOW_STATE_ID_PREFIX = "modal-window-";

const ranInit = new WeakSet<() => void>();

let escOn = false;
const openOrd: string[] = [];
const openMap = new Map<string, OpenEntry>();

function ensEsc(): void {
    if (escOn) return;
    escOn = true;

    document.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        if (ev.defaultPrevented) return;

        for (let i = openOrd.length - 1; i >= 0; i -= 1) {
            const k = openOrd[i];
            const e = openMap.get(k);
            if (!e) continue;
            if (!e.closeOnEscape) continue;
            e.close();
            return;
        }
    });
}

function ensCss(href: string): void {
    const ss = Array.from(document.styleSheets);
    for (const s of ss) {
        if (!s.href) continue;
        if (s.href.endsWith(href)) return;
    }

    const ls = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']"));
    for (const l of ls) {
        if (l.getAttribute("href") === href) return;
    }

    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    document.head.appendChild(l);
}

function ensNbHost(): HTMLDivElement {
    const ex = document.getElementById(NON_BLOCKING_STACK_ID);
    if (ex instanceof HTMLDivElement) return ex;

    const host = document.createElement("div");
    host.id = NON_BLOCKING_STACK_ID;
    document.body.appendChild(host);
    return host;
}

function syncScrl(): void {
    for (const e of openMap.values()) {
        if (e.mode === "blocking") {
            document.body.classList.add("no-scroll");
            return;
        }
    }

    document.body.classList.remove("no-scroll");
}

function zTop(key: string): void {
    if (!key) return;

    const i = openOrd.indexOf(key);
    if (i >= 0) openOrd.splice(i, 1);
    openOrd.push(key);

    const base = 10000;
    for (let j = 0; j < openOrd.length; j += 1) {
        const k = openOrd[j];
        const e = openMap.get(k);
        if (!e) continue;

        const oz = base + j * 2;
        const mz = base + j * 2 + 1;

        if (e.overlayEl) e.overlayEl.style.zIndex = String(oz);
        e.stackEl.style.zIndex = String(mz);
    }
}

function zRm(key: string): void {
    const i = openOrd.indexOf(key);
    if (i < 0) return;

    openOrd.splice(i, 1);

    const top = openOrd[openOrd.length - 1] ?? "";
    if (top) zTop(top);
}

function mkId(pref: string | undefined): string {
    const raw = (pref ?? "").trim();
    if (raw) return raw;

    if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
        return `modal-${globalThis.crypto.randomUUID()}`;
    }

    const r = Math.random().toString(16).slice(2);
    return `modal-${Date.now()}-${r}`;
}

function runInit(ds: readonly ModalDecorator[]): void {
    for (const d of ds) {
        if (d.cssHref) ensCss(d.cssHref);

        const init = d.init;
        if (!init) continue;
        if (ranInit.has(init)) continue;

        ranInit.add(init);
        init();
    }
}

function patchHtml(
    html: string,
    ds: readonly ModalDecorator[],
    info: ModalDecoratorInfo
): string {
    let out = html;

    for (const d of ds) {
        if (!d.patchHtml) continue;
        out = d.patchHtml(out, info);
    }

    return out;
}

function escCss(v: string): string {
    if (typeof globalThis.CSS !== "undefined" && typeof globalThis.CSS.escape === "function") {
        return globalThis.CSS.escape(v);
    }

    return v.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function px(v: string): number {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

function bx(cs: CSSStyleDeclaration | null): number {
    if (!cs) return 0;
    return px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
}

function by(cs: CSSStyleDeclaration | null): number {
    if (!cs) return 0;
    return px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
}

function oh(el: Element | null): number {
    if (!(el instanceof HTMLElement)) return 0;

    const cs = globalThis.getComputedStyle(el);
    return Math.ceil(el.getBoundingClientRect().height + px(cs.marginTop) + px(cs.marginBottom));
}

/**
 * @param {string} id - Raw modal id.
 * @returns {string} A human-readable window title.
 */
function windowTitleFromId(id: string): string {
    const parts = id
        .trim()
        .replace(/[_-]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return "Modal";

    return parts
        .map((part) => {
            const lower = part.toLowerCase();
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ");
}

export class ModalFactory {
    readonly #tok: string;
    readonly #byId: Map<string, ModalSession>;

    constructor() {
        this.#tok = mkId("factory");
        this.#byId = new Map<string, ModalSession>();
    }

    /**
     * @param {ModalSpec} spec - Modal specification.
     * @returns {Modal} Modal blueprint object.
     */
    create(spec: ModalSpec): Modal {
        return new Modal(this, spec);
    }

    /**
     * @param {string} id - Modal id.
     * @returns {ModalSession | null} Live session if open.
     */
    getOpenSession(id: string): ModalSession | null {
        return this.#byId.get(id) ?? null;
    }

    /**
     * @returns {readonly ModalSession[]} Open sessions created by this factory.
     */
    listOpenSessions(): readonly ModalSession[] {
        return Array.from(this.#byId.values());
    }

    /** @internal */
    _keyFor(id: string): string {
        return `${this.#tok}::${id}`;
    }

    /** @internal */
    _registerSession(id: string, s: ModalSession): void {
        this.#byId.set(id, s);
    }

    /** @internal */
    _unregisterSession(id: string): void {
        this.#byId.delete(id);
    }
}

export class Modal {
    readonly #fac: ModalFactory;

    readonly #id: string;
    #mode: ModalMode;

    readonly #rmOk: boolean;
    readonly #win: boolean;

    #cnt: string | (() => string);

    #mCls: string;
    #oCls: string;

    #esc: boolean;
    #out: boolean;

    #ds: ModalDecorator[];

    constructor(factory: ModalFactory, spec: ModalSpec) {
        this.#fac = factory;

        this.#id = mkId(spec.id);
        this.#mode = spec.mode ?? "blocking";

        this.#rmOk = spec.readerModeCompatible ?? true;
        this.#win = spec.window ?? false;

        this.#cnt = spec.content;

        this.#mCls = spec.modalClassName ?? "";
        this.#oCls = spec.overlayClassName ?? "";

        this.#esc = spec.closeOnEscape ?? true;
        this.#out = spec.closeOnOutsideClick ?? (this.#mode === "blocking");

        this.#ds = Array.from(spec.decorators ?? []);
    }

    /**
     * @returns {string} Modal id.
     */
    get id(): string {
        return this.#id;
    }

    /**
     * @returns {ModalMode} Current mode.
     */
    get mode(): ModalMode {
        return this.#mode;
    }

    /**
     * @param {ModalMode} mode - New mode.
     * @returns {this} This modal.
     */
    setMode(mode: ModalMode): this {
        this.#mode = mode;
        return this;
    }

    /**
     * @param {string | (() => string)} content - HTML or HTML producer.
     * @returns {this} This modal.
     */
    setContent(content: string | (() => string)): this {
        this.#cnt = content;

        const s = this.#fac.getOpenSession(this.#id);
        if (!s) return this;

        s.setHtml(this.renderHtml());
        return this;
    }

    /**
     * @param {ModalDecorator} decorator - Decorator to add.
     * @returns {this} This modal.
     */
    decorate(decorator: ModalDecorator): this {
        this.#ds.push(decorator);

        const s = this.#fac.getOpenSession(this.#id);
        if (!s) return this;

        s.setHtml(this.renderHtml());
        return this;
    }

    /**
     * @returns {string} Rendered HTML after patch decorators.
     */
    renderHtml(): string {
        const info: ModalDecoratorInfo = {
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            windowed: this.#win
        };

        const base = typeof this.#cnt === "function" ? this.#cnt() : this.#cnt;

        runInit(this.#ds);
        return patchHtml(base, this.#ds, info);
    }

    /**
     * Opens the modal. If already open, it is brought to front and refreshed.
     *
     * @returns {ModalSession} Live session.
     */
    open(): ModalSession {
        ensEsc();

        const ex = this.#fac.getOpenSession(this.#id);
        if (ex) {
            ex.setHtml(this.renderHtml());
            ex.bringToFront();
            return ex;
        }

        const s = new ModalSession({
            factory: this.#fac,
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            windowed: this.#win,
            modalClassName: this.#mCls,
            overlayClassName: this.#oCls,
            closeOnEscape: this.#esc,
            closeOnOutsideClick: this.#out,
            decorators: this.#ds,
            html: this.renderHtml()
        });

        this.#fac._registerSession(this.#id, s);
        s.open();
        return s;
    }

    /**
     * @returns {boolean} True if this modal is open.
     */
    isOpen(): boolean {
        return this.#fac.getOpenSession(this.#id) !== null;
    }

    /**
     * Closes this modal if open.
     *
     * @returns {boolean} True if closed.
     */
    close(): boolean {
        const s = this.#fac.getOpenSession(this.#id);
        if (!s) return false;
        s.close();
        return true;
    }
}

type ModalSessionSpec = Readonly<{
    factory: ModalFactory;
    id: string;
    mode: ModalMode;

    readerModeCompatible: boolean;
    windowed: boolean;

    modalClassName: string;
    overlayClassName: string;

    closeOnEscape: boolean;
    closeOnOutsideClick: boolean;

    decorators: readonly ModalDecorator[];
    html: string;
}>;

type Mx = Readonly<{
    mw: number;
    mh: number;
    fw: number;
    fh: number;
}>;

export class ModalSession {
    readonly #fac: ModalFactory;
    readonly #key: string;

    readonly #id: string;
    readonly #mode: ModalMode;

    readonly #rmOk: boolean;
    readonly #win: boolean;

    readonly #esc: boolean;
    readonly #out: boolean;

    readonly #ds: readonly ModalDecorator[];

    readonly #mEl: HTMLDivElement;
    readonly #fEl: HTMLDivElement | null;
    readonly #sEl: HTMLDivElement;
    readonly #oEl: HTMLDivElement | null;

    readonly #lnEl: HTMLDivElement | null;

    #wh: window.WindowHandle | null;
    #sty: HTMLStyleElement | null;
    #raf: number | null;
    #mCln: Array<() => void>;
    #wCln: Array<() => void>;
    #wOn: boolean;

    constructor(spec: ModalSessionSpec) {
        this.#fac = spec.factory;
        this.#id = spec.id;
        this.#mode = spec.mode;

        this.#rmOk = spec.readerModeCompatible;
        this.#win = spec.windowed;

        this.#esc = spec.closeOnEscape;
        this.#out = spec.closeOnOutsideClick;
        this.#ds = spec.decorators;

        this.#key = this.#fac._keyFor(this.#id);
        this.#wh = null;
        this.#sty = null;
        this.#raf = null;
        this.#mCln = [];
        this.#wCln = [];
        this.#wOn = false;

        this.#mEl = document.createElement("div");
        this.#mEl.id = this.#id;
        this.#mEl.className = [MODAL_CLASS, spec.modalClassName].filter(Boolean).join(" ");

        if (this.#mode === "non-blocking" && !this.#win) {
            this.#mEl.classList.add("non-blocking");
        }

        if (this.#win) {
            this.#fEl = document.createElement("div");
            this.#fEl.id = `${this.#id}${WINDOW_FRAME_SUFFIX}`;
            this.#fEl.dataset.modalWindowFrame = "true";
            this.#fEl.appendChild(this.#mEl);
            this.#sEl = this.#fEl;

            this.#lnEl = document.createElement("div");
            this.#lnEl.hidden = true;
            this.#lnEl.setAttribute("aria-hidden", "true");
        } else {
            this.#fEl = null;
            this.#sEl = this.#mEl;
            this.#lnEl = null;
        }

        this.#oEl = this.#mode === "blocking"
            ? document.createElement("div")
            : null;

        if (this.#oEl) {
            this.#oEl.id = `modal-overlay-${this.#id}`;
            this.#oEl.className = [OVERLAY_CLASS, spec.overlayClassName].filter(Boolean).join(" ");
            this.#oEl.appendChild(this.#sEl);
        }

        if (!this.#rmOk) {
            this.#mEl.classList.add(READER_MODE_INCOMPATIBLE_CLASS);
            this.#fEl?.classList.add(READER_MODE_INCOMPATIBLE_CLASS);
            this.#oEl?.classList.add(READER_MODE_INCOMPATIBLE_CLASS);
        }

        this.setHtml(spec.html);
    }

    /**
     * @returns {string} Modal id.
     */
    get id(): string {
        return this.#id;
    }

    /**
     * @returns {ModalMode} Modal mode.
     */
    get mode(): ModalMode {
        return this.#mode;
    }

    /**
     * @returns {HTMLDivElement} Modal element.
     */
    get modalEl(): HTMLDivElement {
        return this.#mEl;
    }

    /**
     * @returns {HTMLDivElement | null} Overlay element.
     */
    get overlayEl(): HTMLDivElement | null {
        return this.#oEl;
    }

    /**
     * @returns {void} Opens and mounts the session into DOM.
     */
    open(): void {
        if (openMap.has(this.#key)) {
            this.bringToFront();
            return;
        }

        if (this.#oEl) {
            document.body.appendChild(this.#oEl);

            if (this.#out) {
                this.#oEl.addEventListener("click", (ev: MouseEvent) => {
                    if (ev.target !== this.#oEl) return;
                    this.close();
                });
            }
        } else {
            ensNbHost().appendChild(this.#sEl);
        }

        openMap.set(this.#key, {
            key: this.#key,
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            closeOnEscape: this.#esc,
            close: () => this.close(),
            overlayEl: this.#oEl,
            stackEl: this.#sEl
        });

        if (this.#win) {
            this.#ensWin();
        }

        zTop(this.#key);
        syncScrl();
        this.#mnt();
        this.#qSty();
    }

    /**
     * @param {string} html - New HTML.
     * @returns {void} Updates HTML and remounts decorator behaviour.
     */
    setHtml(html: string): void {
        this.#mEl.innerHTML = html;
        this.#reMnt();
        this.#qSty();
    }

    /**
     * @returns {void} Brings this modal to front.
     */
    bringToFront(): void {
        zTop(this.#key);
    }

    /**
     * @returns {void} Closes and cleans up.
     */
    close(): void {
        const e = openMap.get(this.#key);
        if (!e) return;

        this.#runM();
        this.#runW();

        if (this.#raf !== null) {
            globalThis.cancelAnimationFrame(this.#raf);
            this.#raf = null;
        }

        this.#wh?.dispose();
        this.#wh = null;

        this.#rmSty();

        this.#oEl?.remove();
        if (!this.#oEl) this.#sEl.remove();

        openMap.delete(this.#key);
        zRm(this.#key);
        syncScrl();

        this.#fac._unregisterSession(this.#id);
    }

    #reMnt(): void {
        if (!openMap.has(this.#key)) return;
        this.#mnt(true);
    }

    #runM(): void {
        for (const fn of this.#mCln) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }
        this.#mCln = [];
    }

    #runW(): void {
        for (const fn of this.#wCln) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }
        this.#wCln = [];
    }

    #mnt(clr: boolean = false): void {
        if (clr) this.#runM();

        const ctx: ModalDecoratorContext = {
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            windowed: this.#win,
            modalEl: this.#mEl,
            overlayEl: this.#oEl,
            close: () => this.close(),
            setHtml: (html: string) => this.setHtml(html)
        };

        for (const d of this.#ds) {
            if (!d.mount) continue;

            const cln = d.mount(ctx);
            if (typeof cln !== "function") continue;

            this.#mCln.push(cln);
        }
    }

    #host(): HTMLElement {
        return this.#oEl ?? ensNbHost();
    }

    #mkWinOpts(): window.WindowApiOptions {
        const host = this.#host();

        return {
            id: `${WINDOW_STATE_ID_PREFIX}${this.#id}`,
            title: windowTitleFromId(this.#id),
            launcher: this.#lnEl,
            closedLnchrDis: "none",
            showCloseBttn: true,
            showMiniBttn: false,
            showFloatBttn: false,
            mountTarget: host,
            floatMntTrgt: host,
            initClosed: false,
            initFloat: true
        };
    }

    #ensWin(): void {
        if (this.#wOn) return;
        if (!this.#fEl || !this.#lnEl) return;

        this.#wOn = true;

        try {
            this.#wh = window.mountWindow(this.#fEl, this.#mkWinOpts());
            this.#qSty();
        } catch (err: unknown) {
            console.warn("Modal window mounting failed:", this.#id, err);
            this.#rmSty();
            return;
        }

        if (!openMap.has(this.#key)) return;
        if (!this.#fEl.isConnected) return;

        this.#bndCls();
    }

    #qSty(): void {
        if (!this.#win) return;
        if (!this.#mEl.isConnected) return;

        if (this.#raf !== null) {
            globalThis.cancelAnimationFrame(this.#raf);
        }

        this.#raf = globalThis.requestAnimationFrame(() => {
            this.#raf = globalThis.requestAnimationFrame(() => {
                this.#raf = null;
                this.#syncSty();
            });
        });
    }

    #syncSty(): void {
        if (!this.#win) return;
        if (!this.#mEl.isConnected) return;

        const sz = this.#calcMx();
        const ms = `#${escCss(this.#id)}`;
        const fs = this.#fEl ? `#${escCss(this.#fEl.id)}` : "";
        const bs = fs ? `${fs} .window-body` : "";
        const rs = fs ? `${fs} [data-window-content-root='true']` : "";

        let css = `${ms} {
  border-radius: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  min-height: 0 !important;
  max-height: 100% !important;
}`;

        if (fs) {
            css += `
${bs} {
  min-height: 0 !important;
}

${rs} {
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
}`;
        }

        if (sz && fs) {
            css = `${ms} {
  border-radius: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  min-height: 0 !important;
  max-width: ${sz.mw}px !important;
  max-height: 100% !important;
}

${fs} {
  max-width: ${sz.fw}px !important;
  max-height: ${sz.fh}px !important;
}

${bs} {
  min-height: 0 !important;
}

${rs} {
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
}`;
        }

        if (!this.#sty) {
            this.#sty = document.createElement("style");
            this.#sty.setAttribute("data-modal-window-style-for", this.#id);
            document.head.appendChild(this.#sty);
        }

        this.#sty.textContent = css;
    }

    #calcMx(): Mx | null {
        if (!this.#mEl.isConnected) return null;

        const mcs = globalThis.getComputedStyle(this.#mEl);

        const mw = Math.ceil(
            this.#mEl.scrollWidth +
            px(mcs.borderLeftWidth) +
            px(mcs.borderRightWidth)
        );

        const mh = Math.ceil(
            this.#mEl.scrollHeight +
            px(mcs.borderTopWidth) +
            px(mcs.borderBottomWidth)
        );

        if (mw <= 0 || mh <= 0) return null;

        let fw = mw;
        let fh = mh;

        if (this.#fEl?.isConnected) {
            const hdr = this.#fEl.querySelector(".window-header");
            const bod = this.#fEl.querySelector(".window-body");
            const root = this.#fEl.querySelector("[data-window-content-root='true']");

            const fcs = globalThis.getComputedStyle(this.#fEl);
            const bcs = bod instanceof HTMLElement ? globalThis.getComputedStyle(bod) : null;
            const rcs = root instanceof HTMLElement ? globalThis.getComputedStyle(root) : null;

            fw = Math.ceil(mw + bx(fcs) + bx(bcs) + bx(rcs));
            fh = Math.ceil(mh + by(fcs) + by(bcs) + by(rcs) + oh(hdr));
        }

        return { mw, mh, fw, fh };
    }

    #rmSty(): void {
        this.#sty?.remove();
        this.#sty = null;
    }

    #bndCls(): void {
        if (!this.#fEl) return;

        this.#runW();

        const btn = this.#fEl.querySelector<HTMLButtonElement>("[data-window-role='close']");
        if (!btn) return;

        const onClick = (ev: MouseEvent): void => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            this.close();
        };

        btn.addEventListener("click", onClick, true);

        this.#wCln.push(() => {
            btn.removeEventListener("click", onClick, true);
        });
    }
}

/**
 * Helper decorator: bind an event to all elements matching selector inside the modal.
 *
 * @param {string} selector - Query selector within modal root.
 * @param {keyof HTMLElementEventMap} eventName - Event name.
 * @param {(ev: HTMLElementEventMap[keyof HTMLElementEventMap], ctx: ModalDecoratorContext) => void} fn - Callback.
 * @returns {ModalDecorator} Decorator.
 */
export function onModalEvent<K extends keyof HTMLElementEventMap>(
    selector: string,
    eventName: K,
    fn: (ev: HTMLElementEventMap[K], ctx: ModalDecoratorContext) => void
): ModalDecorator {
    return {
        mount: (ctx) => {
            const ns = Array.from(ctx.modalEl.querySelectorAll(selector));
            const els = ns.filter((n): n is HTMLElement => n instanceof HTMLElement);

            if (!els.length) return;

            const l = (ev: Event): void => {
                fn(ev as HTMLElementEventMap[K], ctx);
            };

            for (const el of els) {
                el.addEventListener(eventName, l);
            }

            return () => {
                for (const el of els) {
                    el.removeEventListener(eventName, l);
                }
            };
        }
    };
}

/**
 * Helper decorator: closes modal when a matching element is clicked.
 *
 * @param {string} selector - Close button selector.
 * @returns {ModalDecorator} Decorator.
 */
export function closeOnClick(selector: string): ModalDecorator {
    return onModalEvent(selector, "click", (_ev, ctx) => ctx.close());
}

/**
 * Convenience singleton if you only want one factory.
 */
export const modals = new ModalFactory();