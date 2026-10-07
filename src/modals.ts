import * as winApi from "./window.ts";
import * as helpers from "./helpers.ts";

type ModalMode = "blocking" | "non-blocking";
type ModalPlacement = "left" | "right" | "top" | "bottom";

type ModalPosition = Readonly<{
    target: string | Element;
    gap?: number;
}>;

type PositionCandidate = Readonly<{
    placement: ModalPlacement;
    space: number;
    required: number;
}>;

type BubbleGeometry = Readonly<{
    radius: number;
    tailLength: number;
    tailHalfWidth: number;
    strokeWidth: number;
}>;

type DecInfo = Readonly<{
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
    windowed: boolean;
}>;

type DecCtx = Readonly<{
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
    windowed: boolean;
    modalEl: HTMLDivElement;
    overlayEl: HTMLDivElement | null;
    close: () => void;
    setHtml: (html: string) => void;
}>;

type Dec = Readonly<{
    cssHref?: string;
    init?: () => void;
    patchHtml?: (html: string, info: DecInfo) => string;
    mount?: (ctx: DecCtx) => void | (() => void);
}>;

type Spec = Readonly<{
    id?: string;
    mode?: ModalMode;

    // default true
    readerModeCompatible?: boolean;

    // default false
    window?: boolean;

    content: string | (() => string);

    modalClassName?: string;
    overlayClassName?: string;

    closeOnEscape?: boolean;
    closeOnOutsideClick?: boolean;

    position?: ModalPosition;
    asTextBubble?: boolean;

    decorators?: readonly Dec[];
}>;

type OpenRec = Readonly<{
    key: string;
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
    closeOnEscape: boolean;
    close: () => void;
    overlayEl: HTMLDivElement | null;
    stackEl: HTMLDivElement;
}>;

const MOD_CLS = "modal";
const OVR_CLS = "modal-overlay";
const NB_STACK_ID = "non-blocking-modal-stack";
const RM_BAD_CLS = "readerModeIncompatible";
const WIN_FRAME_SFX = "-window-frame";
const WIN_STATE_ID_PREF = "modal-window-";

const initsRan = new WeakSet<() => void>();

let escOn = false;
const openZ: string[] = [];
const openByKey = new Map<string, OpenRec>();

/**
 * hooks the global escape handler once.
 * pretty plain, just closes the top one that says escape is fine.
 *
 * @returns {void}
 */
function ensEsc(): void {
    if (escOn) return;
    escOn = true;

    document.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        if (ev.defaultPrevented) return;

        for (let i = openZ.length - 1; i >= 0; i -= 1) {
            const key = openZ[i];
            const rec = openByKey.get(key);
            if (!rec) continue;
            if (!rec.closeOnEscape) continue;

            rec.close();
            return;
        }
    });
}

/**
 * makes sure a css file is around.
 * does a couple of checks first so it doesnt spam duplicate links everywhere.
 *
 * @param {string} href
 * @returns {void}
 */
function ensCss(href: string): void {
    const sheets = Array.from(document.styleSheets);

    for (const sheet of sheets) {
        if (!sheet.href) continue;
        if (sheet.href.endsWith(href)) return;
    }

    const links = Array.from(
        document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']")
    );

    for (const link of links) {
        if (link.getAttribute("href") === href) return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

/**
 * gets the host for non-blocking modals.
 * creates it if needed.
 *
 * @returns {HTMLDivElement}
 */
function ensNbHost(): HTMLDivElement {
    const ex = document.getElementById(NB_STACK_ID);
    if (ex instanceof HTMLDivElement) return ex;

    const host = document.createElement("div");
    host.id = NB_STACK_ID;
    document.body.appendChild(host);
    return host;
}

/**
 * body no-scroll toggler.
 * if any blocking modal is open, body gets locked. otherwise not.
 *
 * @returns {void}
 */
function syncScrl(): void {
    for (const rec of openByKey.values()) {
        if (rec.mode !== "blocking") continue;

        document.body.classList.add("no-scroll");
        return;
    }

    document.body.classList.remove("no-scroll");
}

/**
 * pushes one open modal to the top and redoes z values.
 *
 * @param {string} key
 * @returns {void}
 */
function zTop(key: string): void {
    if (!key) return;

    const idx = openZ.indexOf(key);
    if (idx >= 0) openZ.splice(idx, 1);
    openZ.push(key);

    const base = 10000;

    for (let i = 0; i < openZ.length; i += 1) {
        const zKey = openZ[i];
        const rec = openByKey.get(zKey);
        if (!rec) continue;

        const oZ = base + i * 2;
        const mZ = base + i * 2 + 1;

        if (rec.overlayEl) rec.overlayEl.style.zIndex = String(oZ);
        rec.stackEl.style.zIndex = String(mZ);
    }
}

/**
 * removes a key from the z order and re-stacks whats left.
 *
 * @param {string} key
 * @returns {void}
 */
function zRm(key: string): void {
    const idx = openZ.indexOf(key);
    if (idx < 0) return;

    openZ.splice(idx, 1);

    const top = openZ[openZ.length - 1] ?? "";
    if (!top) return;

    zTop(top);
}

/**
 * id maker.
 * uses the preferred one if you gave it one, otherwise cobbles one together.
 *
 * @param {string | undefined} pref
 * @returns {string}
 */
function mkId(pref: string | undefined): string {
    const raw = (pref ?? "").trim();
    if (raw) return raw;

    if (
        typeof globalThis.crypto !== "undefined" &&
        typeof globalThis.crypto.randomUUID === "function"
    ) {
        return `modal-${globalThis.crypto.randomUUID()}`;
    }

    const rand = Math.random().toString(16).slice(2);
    return `modal-${Date.now()}-${rand}`;
}

/**
 * runs decorator init hooks once each.
 * also makes sure decorator css is loaded.
 *
 * @param {readonly Dec[]} decs
 * @returns {void}
 */
function runInit(decs: readonly Dec[]): void {
    for (const dec of decs) {
        if (dec.cssHref) ensCss(dec.cssHref);

        const init = dec.init;
        if (!init) continue;
        if (initsRan.has(init)) continue;

        initsRan.add(init);
        init();
    }
}

/**
 * lets decorators patch the html in order.
 * one after another, nothing clever.
 *
 * @param {string} html
 * @param {readonly Dec[]} decs
 * @param {DecInfo} info
 * @returns {string}
 */
function patchHtml(
    html: string,
    decs: readonly Dec[],
    info: DecInfo
): string {
    let out = html;

    for (const dec of decs) {
        if (!dec.patchHtml) continue;
        out = dec.patchHtml(out, info);
    }

    return out;
}

/**
 * px parser. not exactly thrilling.
 *
 * @param {string} value
 * @returns {number}
 */
function px(value: string): number {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

/**
 * horizontal box extras from computed style.
 *
 * @param {CSSStyleDeclaration | null} cs
 * @returns {number}
 */
function bx(cs: CSSStyleDeclaration | null): number {
    if (!cs) return 0;
    return px(cs.paddingLeft) + px(cs.paddingRight) + px(cs.borderLeftWidth) + px(cs.borderRightWidth);
}

/**
 * vertical box extras from computed style.
 *
 * @param {CSSStyleDeclaration | null} cs
 * @returns {number}
 */
function by(cs: CSSStyleDeclaration | null): number {
    if (!cs) return 0;
    return px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth);
}

/**
 * outer-ish height helper, margins included.
 *
 * @param {Element | null} el
 * @returns {number}
 */
function oh(el: Element | null): number {
    if (!(el instanceof HTMLElement)) return 0;

    const cs = globalThis.getComputedStyle(el);
    return Math.ceil(el.getBoundingClientRect().height + px(cs.marginTop) + px(cs.marginBottom));
}

/**
 * turns an id into a window title that doesnt look awful.
 * good enough for modal headings anyway.
 *
 * @param {string} id
 * @returns {string}
 */
function winTitle(id: string): string {
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
     * makes a modal blueprint from a spec.
     * not open yet, just ready to be used.
     *
     * @param {Spec} spec
     * @returns {Modal}
     */
    create(spec: Spec): Modal {
        return new Modal(this, spec);
    }

    /**
     * gets the open session for a modal id, if there is one.
     *
     * @param {string} id
     * @returns {ModalSession | null}
     */
    getOpenSession(id: string): ModalSession | null {
        return this.#byId.get(id) ?? null;
    }

    /**
     * open sessions from this factory, all of them.
     *
     * @returns {readonly ModalSession[]}
     */
    listOpenSessions(): readonly ModalSession[] {
        return Array.from(this.#byId.values());
    }

    /** @internal */
    _keyFor(id: string): string {
        return `${this.#tok}::${id}`;
    }

    /** @internal */
    _registerSession(id: string, session: ModalSession): void {
        this.#byId.set(id, session);
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

    readonly #pos: ModalPosition | null;
    readonly #txtBubble: boolean;

    #decs: Dec[];

    constructor(factory: ModalFactory, spec: Spec) {
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

        this.#pos = spec.position ?? null;
        this.#txtBubble = spec.asTextBubble ?? false;

        this.#decs = Array.from(spec.decorators ?? []);
    }

    /**
     * modal id getter.
     *
     * @returns {string}
     */
    get id(): string {
        return this.#id;
    }

    /**
     * current mode getter.
     *
     * @returns {ModalMode}
     */
    get mode(): ModalMode {
        return this.#mode;
    }

    /**
     * changes the mode on the blueprint.
     * useful before opening it.
     *
     * @param {ModalMode} mode
     * @returns {this}
     */
    setMode(mode: ModalMode): this {
        this.#mode = mode;
        return this;
    }

    /**
     * swaps the content html or content producer.
     * if the modal is already open it gets refreshed too.
     *
     * @param {string | (() => string)} content
     * @returns {this}
     */
    setContent(content: string | (() => string)): this {
        this.#cnt = content;

        const sess = this.#fac.getOpenSession(this.#id);
        if (!sess) return this;

        sess.setHtml(this.renderHtml());
        return this;
    }

    /**
     * adds a decorator to the modal.
     * open modal gets refreshed right away.
     *
     * @param {Dec} decorator
     * @returns {this}
     */
    decorate(decorator: Dec): this {
        this.#decs.push(decorator);

        const sess = this.#fac.getOpenSession(this.#id);
        if (!sess) return this;

        sess.setHtml(this.renderHtml());
        return this;
    }

    /**
     * renders the current html after decorator patch passes.
     *
     * @returns {string}
     */
    renderHtml(): string {
        const info: DecInfo = {
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            windowed: this.#win
        };

        const base = typeof this.#cnt === "function" ? this.#cnt() : this.#cnt;

        runInit(this.#decs);
        return patchHtml(base, this.#decs, info);
    }

    /**
     * opens the modal.
     * if it is already open, it just refreshes and comes to the front.
     *
     * @returns {ModalSession}
     */
    open(): ModalSession {
        ensEsc();

        const ex = this.#fac.getOpenSession(this.#id);
        if (ex) {
            ex.setHtml(this.renderHtml());
            ex.bringToFront();
            return ex;
        }

        const sess = new ModalSession({
            factory: this.#fac,
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            windowed: this.#win,
            modalClassName: this.#mCls,
            overlayClassName: this.#oCls,
            closeOnEscape: this.#esc,
            closeOnOutsideClick: this.#out,
            position: this.#pos,
            asTextBubble: this.#txtBubble,
            decorators: this.#decs,
            html: this.renderHtml()
        });

        this.#fac._registerSession(this.#id, sess);
        sess.open();
        return sess;
    }

    /**
     * tells you if this modal is open right now.
     *
     * @returns {boolean}
     */
    isOpen(): boolean {
        return this.#fac.getOpenSession(this.#id) !== null;
    }

    /**
     * closes it if open.
     *
     * @returns {boolean}
     */
    close(): boolean {
        const sess = this.#fac.getOpenSession(this.#id);
        if (!sess) return false;

        sess.close();
        return true;
    }
}

type SessSpec = Readonly<{
    factory: ModalFactory;
    id: string;
    mode: ModalMode;

    readerModeCompatible: boolean;
    windowed: boolean;

    modalClassName: string;
    overlayClassName: string;

    closeOnEscape: boolean;
    closeOnOutsideClick: boolean;

    position: ModalPosition | null;
    asTextBubble: boolean;

    decorators: readonly Dec[];
    html: string;
}>;

type WinMx = Readonly<{
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

    readonly #pos: ModalPosition | null;
    readonly #txtBubble: boolean;

    readonly #decs: readonly Dec[];

    readonly #mEl: HTMLDivElement;
    readonly #fEl: HTMLDivElement | null;
    readonly #sEl: HTMLDivElement;
    readonly #oEl: HTMLDivElement | null;

    readonly #lnEl: HTMLDivElement | null;

    #wh: winApi.WindowHandle | null;
    #sty: HTMLStyleElement | null;
    #raf: number | null;
    #mCln: Array<() => void>;
    #wCln: Array<() => void>;
    #pCln: Array<() => void>;
    #pRaf: number | null;
    #bubbleSvg: SVGSVGElement | null;
    #bubblePath: SVGPathElement | null;
    #wOn: boolean;

    constructor(spec: SessSpec) {
        this.#fac = spec.factory;
        this.#id = spec.id;
        this.#mode = spec.mode;

        this.#rmOk = spec.readerModeCompatible;
        this.#win = spec.windowed;

        this.#esc = spec.closeOnEscape;
        this.#out = spec.closeOnOutsideClick;

        this.#pos = spec.position;
        this.#txtBubble = spec.asTextBubble;

        this.#decs = spec.decorators;

        this.#key = this.#fac._keyFor(this.#id);
        this.#wh = null;
        this.#sty = null;
        this.#raf = null;
        this.#mCln = [];
        this.#wCln = [];
        this.#pCln = [];
        this.#pRaf = null;
        this.#bubbleSvg = null;
        this.#bubblePath = null;
        this.#wOn = false;

        this.#mEl = document.createElement("div");
        this.#mEl.id = this.#id;
        this.#mEl.className = [MOD_CLS, spec.modalClassName].filter(Boolean).join(" ");

        if (this.#mode === "non-blocking" && !this.#win) {
            this.#mEl.classList.add("non-blocking");
        }

        if (this.#pos) {
            this.#mEl.classList.add("modal-positioned");
        }

        if (this.#txtBubble) {
            this.#mEl.classList.add("modal-text-bubble");
        }

        if (this.#win) {
            this.#fEl = document.createElement("div");
            this.#fEl.id = `${this.#id}${WIN_FRAME_SFX}`;
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
            this.#oEl.className = [OVR_CLS, spec.overlayClassName].filter(Boolean).join(" ");
            this.#oEl.appendChild(this.#sEl);
        }

        if (!this.#rmOk) {
            this.#mEl.classList.add(RM_BAD_CLS);
            this.#fEl?.classList.add(RM_BAD_CLS);
            this.#oEl?.classList.add(RM_BAD_CLS);
        }

        this.setHtml(spec.html);
    }

    /**
     * modal id again, but on the live session.
     *
     * @returns {string}
     */
    get id(): string {
        return this.#id;
    }

    /**
     * session mode getter.
     *
     * @returns {ModalMode}
     */
    get mode(): ModalMode {
        return this.#mode;
    }

    /**
     * raw modal element.
     *
     * @returns {HTMLDivElement}
     */
    get modalEl(): HTMLDivElement {
        return this.#mEl;
    }

    /**
     * overlay if this one has one.
     *
     * @returns {HTMLDivElement | null}
     */
    get overlayEl(): HTMLDivElement | null {
        return this.#oEl;
    }

    /**
     * mounts the session into the dom.
     * if already open it just comes forward.
     *
     * @returns {void}
     */
    open(): void {
        if (openByKey.has(this.#key)) {
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

        openByKey.set(this.#key, {
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
        this.#bindPos();
        this.#qSty();
        this.#qPos();
    }

    /**
     * Renders ordinary modal content without a speech-bubble shell.
     *
     * @param {string} html
     * @returns {void}
     */
    #renderPlainContent(html: string): void {
        this.#mEl.innerHTML = html;
        this.#bubbleSvg = null;
        this.#bubblePath = null;
    }

    /**
     * Renders text-bubble content over one SVG shape. The SVG path itself
     * contains both the rounded body and its target-facing tail, so fill and
     * stroke are continuous through the join.
     *
     * @param {string} html
     * @returns {void}
     */
    #renderBubbleContent(html: string): void {
        const svgNs = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(svgNs, "svg");
        const path = document.createElementNS(svgNs, "path");
        const body = document.createElement("div");

        svg.classList.add("modal-text-bubble__shape");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        path.classList.add("modal-text-bubble__path");

        body.className = "modal-text-bubble__body";
        body.innerHTML = html;

        svg.appendChild(path);
        this.#mEl.replaceChildren(svg, body);

        this.#bubbleSvg = svg;
        this.#bubblePath = path;
    }

    /**
     * @param {string} html
     * @returns {void}
     */
    #renderContent(html: string): void {
        if (!this.#txtBubble) {
            this.#renderPlainContent(html);
            return;
        }

        this.#renderBubbleContent(html);
    }

    /**
     * swaps the inner html and remounts decorator hooks.
     *
     * @param {string} html
     * @returns {void}
     */
    setHtml(html: string): void {
        this.#renderContent(html);
        this.#reMnt();
        this.#qSty();
        this.#qPos();
    }

    /**
     * bumps this session to the top.
     *
     * @returns {void}
     */
    bringToFront(): void {
        zTop(this.#key);
    }

    /**
     * closes the session and clears its bits up.
     *
     * @returns {void}
     */
    close(): void {
        const rec = openByKey.get(this.#key);
        if (!rec) return;

        this.#runM();
        this.#runW();
        this.#runPos();

        if (this.#pRaf !== null) {
            globalThis.cancelAnimationFrame(this.#pRaf);
            this.#pRaf = null;
        }

        if (this.#raf !== null) {
            globalThis.cancelAnimationFrame(this.#raf);
            this.#raf = null;
        }

        this.#wh?.dispose();
        this.#wh = null;

        this.#rmSty();

        this.#oEl?.remove();
        if (!this.#oEl) this.#sEl.remove();

        openByKey.delete(this.#key);
        zRm(this.#key);
        syncScrl();

        this.#fac._unregisterSession(this.#id);
    }

    /**
     * re-mount pass after html changes.
     *
     * @returns {void}
     */
    #reMnt(): void {
        if (!openByKey.has(this.#key)) return;
        this.#mnt(true);
    }

    /**
     * runs modal cleanup fns.
     *
     * @returns {void}
     */
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

    /**
     * runs window cleanup fns.
     *
     * @returns {void}
     */
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

    /**
     * mount pass for decorators.
     * when clr is true, old mounts get cleaned first.
     *
     * @param {boolean} clr
     * @returns {void}
     */
    #mnt(clr: boolean = false): void {
        if (clr) this.#runM();

        const ctx: DecCtx = {
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#rmOk,
            windowed: this.#win,
            modalEl: this.#mEl,
            overlayEl: this.#oEl,
            close: () => this.close(),
            setHtml: (html: string) => this.setHtml(html)
        };

        for (const dec of this.#decs) {
            if (!dec.mount) continue;

            const cln = dec.mount(ctx);
            if (typeof cln !== "function") continue;

            this.#mCln.push(cln);
        }
    }


    /**
     * Resolves the optional anchor target for a positioned modal.
     *
     * @returns {Element | null}
     */
    #posTarget(): Element | null {
        if (!this.#pos) return null;

        const target = this.#pos.target;

        if (typeof target === "string") {
            return document.querySelector(target);
        }

        return target.isConnected
            ? target
            : null;
    }

    /**
     * Cancels listeners and observers used by target-following modals.
     *
     * @returns {void}
     */
    #runPos(): void {
        for (const fn of this.#pCln) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }

        this.#pCln = [];
    }

    /**
     * Queues one viewport-position sync.
     *
     * @returns {void}
     */
    #qPos(): void {
        if (!this.#pos) return;
        if (!this.#mEl.isConnected) return;
        if (this.#pRaf !== null) return;

        this.#pRaf = globalThis.requestAnimationFrame(() => {
            this.#pRaf = null;
            this.#syncPos();
        });
    }

    /**
     * Returns the current visible viewport bounds.
     *
     * VisualViewport is used when available so zooming and mobile browser
     * chrome do not leave an anchored callout off-screen.
     *
     * @returns {{ left: number; top: number; right: number; bottom: number }}
     */
    #viewportBounds(): {
        left: number;
        top: number;
        right: number;
        bottom: number;
    } {
        const viewport = window.visualViewport;
        const left = viewport?.offsetLeft ?? 0;
        const top = viewport?.offsetTop ?? 0;
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;

        return {
            left,
            top,
            right: left + width,
            bottom: top + height
        };
    }

    /**
     * Chooses whichever side gives the callout the healthiest fit in the
     * current viewport. No direction is preferred or hard-coded.
     *
     * @param {DOMRect} targetRect
     * @param {DOMRect} modalRect
     * @param {{ left: number; top: number; right: number; bottom: number }} viewport
     * @param {number} gap
     * @returns {ModalPlacement}
     */
    #bestPlacement(
        targetRect: DOMRect,
        modalRect: DOMRect,
        viewport: {
            left: number;
            top: number;
            right: number;
            bottom: number;
        },
        gap: number
    ): ModalPlacement {
        const candidates: PositionCandidate[] = [
            {
                placement: "left",
                space: targetRect.left - viewport.left,
                required: modalRect.width + gap
            },
            {
                placement: "right",
                space: viewport.right - targetRect.right,
                required: modalRect.width + gap
            },
            {
                placement: "top",
                space: targetRect.top - viewport.top,
                required: modalRect.height + gap
            },
            {
                placement: "bottom",
                space: viewport.bottom - targetRect.bottom,
                required: modalRect.height + gap
            }
        ];

        candidates.sort(
            (a, b) =>
                (b.space - b.required) -
                (a.space - a.required)
        );

        return candidates[0]?.placement ?? "bottom";
    }

    /**
     * Calculates the natural modal origin for one target-facing side.
     *
     * @param {ModalPlacement} placement
     * @param {DOMRect} targetRect
     * @param {DOMRect} modalRect
     * @param {number} gap
     * @returns {{ left: number; top: number }}
     */
    #placementOrigin(
        placement: ModalPlacement,
        targetRect: DOMRect,
        modalRect: DOMRect,
        gap: number
    ): {
        left: number;
        top: number;
    } {
        const targetX =
            targetRect.left +
            targetRect.width / 2;

        const targetY =
            targetRect.top +
            targetRect.height / 2;

        const origins: Record<ModalPlacement, {
            left: number;
            top: number;
        }> = {
            left: {
                left: targetRect.left - modalRect.width - gap,
                top: targetY - modalRect.height / 2
            },
            right: {
                left: targetRect.right + gap,
                top: targetY - modalRect.height / 2
            },
            top: {
                left: targetX - modalRect.width / 2,
                top: targetRect.top - modalRect.height - gap
            },
            bottom: {
                left: targetX - modalRect.width / 2,
                top: targetRect.bottom + gap
            }
        };

        return origins[placement];
    }

    /**
     * @param {number} value
     * @param {number} min
     * @param {number} max
     * @returns {number}
     */
    #clampPos(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(value, max));
    }

    /**
     * Reads a numeric CSS custom property from the live bubble.
     *
     * @param {string} name
     * @param {number} fallback
     * @returns {number}
     */
    #bubbleCssNumber(name: string, fallback: number): number {
        const raw = globalThis
            .getComputedStyle(this.#mEl)
            .getPropertyValue(name);

        const parsed = Number.parseFloat(raw);

        return Number.isFinite(parsed)
            ? parsed
            : fallback;
    }

    /**
     * Reads the rendered bubble geometry. Radius comes from the actual
     * computed border radius so themes can keep controlling corner shape.
     *
     * @returns {BubbleGeometry}
     */
    #bubbleGeometry(): BubbleGeometry {
        const style = globalThis.getComputedStyle(this.#mEl);
        const radius = Number.parseFloat(style.borderTopLeftRadius);

        return {
            radius: Number.isFinite(radius) ? radius : 12,
            tailLength: this.#bubbleCssNumber(
                "--modal-text-bubble-tail-length",
                13
            ),
            tailHalfWidth: this.#bubbleCssNumber(
                "--modal-text-bubble-tail-half-width",
                12
            ),
            strokeWidth: this.#bubbleCssNumber(
                "--modal-text-bubble-stroke-width",
                1
            )
        };
    }

    /**
     * Builds one continuous path for the rounded bubble body and its tail.
     * The tail uses cubic curves so it leaves the body tangentially rather
     * than looking like a separate hard-edged triangle.
     *
     * @param {number} width
     * @param {number} height
     * @param {ModalPlacement} placement
     * @param {number} pointerX
     * @param {number} pointerY
     * @returns {string}
     */
    #bubblePathD(
        width: number,
        height: number,
        placement: ModalPlacement,
        pointerX: number,
        pointerY: number
    ): string {
        const geometry = this.#bubbleGeometry();
        const inset = Math.max(0.5, geometry.strokeWidth / 2);

        const left = inset;
        const top = inset;
        const right = Math.max(left, width - inset);
        const bottom = Math.max(top, height - inset);

        const radius = Math.max(
            0,
            Math.min(
                geometry.radius,
                (right - left) / 2,
                (bottom - top) / 2
            )
        );

        const maxVerticalHalf = Math.max(
            4,
            (bottom - top - radius * 2 - 12) / 2
        );

        const maxHorizontalHalf = Math.max(
            4,
            (right - left - radius * 2 - 12) / 2
        );

        const verticalHalf = Math.min(
            geometry.tailHalfWidth,
            maxVerticalHalf
        );

        const horizontalHalf = Math.min(
            geometry.tailHalfWidth,
            maxHorizontalHalf
        );

        const minPointerX =
            left +
            radius +
            horizontalHalf +
            6;

        const maxPointerX = Math.max(
            minPointerX,
            right -
            radius -
            horizontalHalf -
            6
        );

        const minPointerY =
            top +
            radius +
            verticalHalf +
            6;

        const maxPointerY = Math.max(
            minPointerY,
            bottom -
            radius -
            verticalHalf -
            6
        );

        const px = this.#clampPos(
            pointerX,
            minPointerX,
            maxPointerX
        );

        const py = this.#clampPos(
            pointerY,
            minPointerY,
            maxPointerY
        );

        const tail = geometry.tailLength;
        const tailControl = tail * 0.42;

        const paths: Record<ModalPlacement, string> = {
            left: [
                `M ${left + radius} ${top}`,
                `H ${right - radius}`,
                `Q ${right} ${top} ${right} ${top + radius}`,
                `V ${py - verticalHalf}`,
                `C ${right + tailControl} ${py - verticalHalf}`,
                `${right + tail} ${py - verticalHalf * 0.34}`,
                `${right + tail} ${py}`,
                `C ${right + tail} ${py + verticalHalf * 0.34}`,
                `${right + tailControl} ${py + verticalHalf}`,
                `${right} ${py + verticalHalf}`,
                `V ${bottom - radius}`,
                `Q ${right} ${bottom} ${right - radius} ${bottom}`,
                `H ${left + radius}`,
                `Q ${left} ${bottom} ${left} ${bottom - radius}`,
                `V ${top + radius}`,
                `Q ${left} ${top} ${left + radius} ${top}`,
                "Z"
            ].join(" "),

            right: [
                `M ${left + radius} ${top}`,
                `H ${right - radius}`,
                `Q ${right} ${top} ${right} ${top + radius}`,
                `V ${bottom - radius}`,
                `Q ${right} ${bottom} ${right - radius} ${bottom}`,
                `H ${left + radius}`,
                `Q ${left} ${bottom} ${left} ${bottom - radius}`,
                `V ${py + verticalHalf}`,
                `C ${left - tailControl} ${py + verticalHalf}`,
                `${left - tail} ${py + verticalHalf * 0.34}`,
                `${left - tail} ${py}`,
                `C ${left - tail} ${py - verticalHalf * 0.34}`,
                `${left - tailControl} ${py - verticalHalf}`,
                `${left} ${py - verticalHalf}`,
                `V ${top + radius}`,
                `Q ${left} ${top} ${left + radius} ${top}`,
                "Z"
            ].join(" "),

            top: [
                `M ${left + radius} ${top}`,
                `H ${right - radius}`,
                `Q ${right} ${top} ${right} ${top + radius}`,
                `V ${bottom - radius}`,
                `Q ${right} ${bottom} ${right - radius} ${bottom}`,
                `H ${px + horizontalHalf}`,
                `C ${px + horizontalHalf} ${bottom + tailControl}`,
                `${px + horizontalHalf * 0.34} ${bottom + tail}`,
                `${px} ${bottom + tail}`,
                `C ${px - horizontalHalf * 0.34} ${bottom + tail}`,
                `${px - horizontalHalf} ${bottom + tailControl}`,
                `${px - horizontalHalf} ${bottom}`,
                `H ${left + radius}`,
                `Q ${left} ${bottom} ${left} ${bottom - radius}`,
                `V ${top + radius}`,
                `Q ${left} ${top} ${left + radius} ${top}`,
                "Z"
            ].join(" "),

            bottom: [
                `M ${left + radius} ${top}`,
                `H ${px - horizontalHalf}`,
                `C ${px - horizontalHalf} ${top - tailControl}`,
                `${px - horizontalHalf * 0.34} ${top - tail}`,
                `${px} ${top - tail}`,
                `C ${px + horizontalHalf * 0.34} ${top - tail}`,
                `${px + horizontalHalf} ${top - tailControl}`,
                `${px + horizontalHalf} ${top}`,
                `H ${right - radius}`,
                `Q ${right} ${top} ${right} ${top + radius}`,
                `V ${bottom - radius}`,
                `Q ${right} ${bottom} ${right - radius} ${bottom}`,
                `H ${left + radius}`,
                `Q ${left} ${bottom} ${left} ${bottom - radius}`,
                `V ${top + radius}`,
                `Q ${left} ${top} ${left + radius} ${top}`,
                "Z"
            ].join(" ")
        };

        return paths[placement];
    }

    /**
     * Syncs the SVG shell to the current rendered bubble rectangle.
     *
     * @param {ModalPlacement} placement
     * @param {number} pointerX
     * @param {number} pointerY
     * @returns {void}
     */
    #syncBubbleShape(
        placement: ModalPlacement,
        pointerX: number,
        pointerY: number
    ): void {
        if (!this.#txtBubble) return;
        if (!this.#bubbleSvg) return;
        if (!this.#bubblePath) return;

        const rect = this.#mEl.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));

        this.#bubbleSvg.setAttribute(
            "viewBox",
            `0 0 ${width} ${height}`
        );

        this.#bubblePath.setAttribute(
            "d",
            this.#bubblePathD(
                width,
                height,
                placement,
                pointerX,
                pointerY
            )
        );
    }

    /**
     * Places an anchored modal on the best available side of its target,
     * clamps the modal to the viewport, then derives the speech-bubble tail
     * position from the target's real viewport coordinates.
     *
     * @returns {void}
     */
    #syncPos(): void {
        const target = this.#posTarget();
        if (!target) return;
        if (!this.#mEl.isConnected) return;

        const targetRect = target.getBoundingClientRect();
        const modalRect = this.#mEl.getBoundingClientRect();
        const viewport = this.#viewportBounds();

        const gap = Math.max(0, this.#pos?.gap ?? 14);
        const viewportPad = 12;
        const pointerPad = 18;

        const placement = this.#bestPlacement(
            targetRect,
            modalRect,
            viewport,
            gap
        );

        const origin = this.#placementOrigin(
            placement,
            targetRect,
            modalRect,
            gap
        );

        const minLeft = viewport.left + viewportPad;
        const maxLeft = Math.max(
            minLeft,
            viewport.right - modalRect.width - viewportPad
        );

        const minTop = viewport.top + viewportPad;
        const maxTop = Math.max(
            minTop,
            viewport.bottom - modalRect.height - viewportPad
        );

        const left = this.#clampPos(
            origin.left,
            minLeft,
            maxLeft
        );

        const top = this.#clampPos(
            origin.top,
            minTop,
            maxTop
        );

        const targetX =
            targetRect.left +
            targetRect.width / 2;

        const targetY =
            targetRect.top +
            targetRect.height / 2;

        const pointerX = this.#clampPos(
            targetX - left,
            pointerPad,
            Math.max(pointerPad, modalRect.width - pointerPad)
        );

        const pointerY = this.#clampPos(
            targetY - top,
            pointerPad,
            Math.max(pointerPad, modalRect.height - pointerPad)
        );

        this.#mEl.dataset.modalPlacement = placement;

        this.#mEl.style.left = `${Math.round(left)}px`;
        this.#mEl.style.top = `${Math.round(top)}px`;
        this.#mEl.style.right = "auto";
        this.#mEl.style.bottom = "auto";

        this.#mEl.style.setProperty(
            "--modal-text-bubble-pointer-x",
            `${Math.round(pointerX)}px`
        );

        this.#mEl.style.setProperty(
            "--modal-text-bubble-pointer-y",
            `${Math.round(pointerY)}px`
        );

        this.#syncBubbleShape(
            placement,
            pointerX,
            pointerY
        );
    }

    /**
     * Watches the anchor and viewport so a positioned modal follows its
     * target through scrolling, resizing and layout changes.
     *
     * @returns {void}
     */
    #bindPos(): void {
        this.#runPos();

        const target = this.#posTarget();
        if (!target) return;

        const queue = (): void => this.#qPos();

        globalThis.addEventListener("resize", queue);
        globalThis.addEventListener("scroll", queue, true);

        this.#pCln.push(() => {
            globalThis.removeEventListener("resize", queue);
            globalThis.removeEventListener("scroll", queue, true);
        });

        if (typeof ResizeObserver === "undefined") {
            this.#qPos();
            return;
        }

        const observer = new ResizeObserver(queue);

        observer.observe(target);
        observer.observe(this.#mEl);

        this.#pCln.push(() => observer.disconnect());

        const viewport = window.visualViewport;

        viewport?.addEventListener("resize", queue);
        viewport?.addEventListener("scroll", queue);

        this.#pCln.push(() => {
            viewport?.removeEventListener("resize", queue);
            viewport?.removeEventListener("scroll", queue);
        });

        this.#qPos();
    }

    /**
     * picks the element the window api should mount into.
     *
     * @returns {HTMLElement}
     */
    #host(): HTMLElement {
        return this.#oEl ?? ensNbHost();
    }

    /**
     * builds the window api options for this session.
     *
     * @returns {winApi.WindowApiOptions}
     */
    #mkWinOpts(): winApi.WindowApiOptions {
        const host = this.#host();

        return {
            id: `${WIN_STATE_ID_PREF}${this.#id}`,
            title: winTitle(this.#id),
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

    /**
     * mounts the window wrapper when this modal is windowed.
     *
     * @returns {void}
     */
    #ensWin(): void {
        if (this.#wOn) return;
        if (!this.#fEl || !this.#lnEl) return;

        this.#wOn = true;

        try {
            this.#wh = winApi.mountWindow(this.#fEl, this.#mkWinOpts());
            this.#qSty();
        } catch (err: unknown) {
            console.warn("Modal window mounting failed:", this.#id, err);
            this.#rmSty();
            return;
        }

        if (!openByKey.has(this.#key)) return;
        if (!this.#fEl.isConnected) return;

        this.#bndCls();
    }

    /**
     * queues a style sync on a couple of frames.
     * a bit belt-and-braces but helps after layout settles.
     *
     * @returns {void}
     */
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

    /**
     * updates the window sizing style tag.
     *
     * @returns {void}
     */
    #syncSty(): void {
        if (!this.#win) return;
        if (!this.#mEl.isConnected) return;

        const sz = this.#calcMx();
        const ms = `#${helpers.escapeCssIdentifier(this.#id)}`;
        const fs = this.#fEl ? `#${helpers.escapeCssIdentifier(this.#fEl.id)}` : "";
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

    /**
     * works out modal and frame max sizes from the live dom.
     *
     * @returns {WinMx | null}
     */
    #calcMx(): WinMx | null {
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

    /**
     * removes the temp style tag if it exists.
     *
     * @returns {void}
     */
    #rmSty(): void {
        this.#sty?.remove();
        this.#sty = null;
    }

    /**
     * steals the window close button click so it closes this session properly.
     *
     * @returns {void}
     */
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
 * handy decorator helper.
 * binds one event to all matching bits inside the modal.
 *
 * @param {string} selector
 * @param {K} eventName
 * @param {(ev: HTMLElementEventMap[K], ctx: DecCtx) => void} fn
 * @returns {Dec}
 */
export function onModalEvent<K extends keyof HTMLElementEventMap>(
    selector: string,
    eventName: K,
    fn: (ev: HTMLElementEventMap[K], ctx: DecCtx) => void
): Dec {
    return {
        mount: (ctx) => {
            const nodes = Array.from(ctx.modalEl.querySelectorAll(selector));
            const els = nodes.filter((node): node is HTMLElement => node instanceof HTMLElement);

            if (!els.length) return;

            const onEvt = (ev: Event): void => {
                fn(ev as HTMLElementEventMap[K], ctx);
            };

            for (const el of els) {
                el.addEventListener(eventName, onEvt);
            }

            return () => {
                for (const el of els) {
                    el.removeEventListener(eventName, onEvt);
                }
            };
        }
    };
}

/**
 * tiny close helper.
 * click matching thing, modal goes away.
 *
 * @param {string} selector
 * @returns {Dec}
 */
export function closeOnClick(selector: string): Dec {
    return onModalEvent(selector, "click", (_ev, ctx) => ctx.close());
}

/**
 * Shared factory.
 */
export const factory = new ModalFactory();