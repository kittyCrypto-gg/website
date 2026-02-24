type ModalMode = "blocking" | "non-blocking";

type ModalDecoratorInfo = Readonly<{
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
}>;

type ModalDecoratorContext = Readonly<{
    id: string;
    mode: ModalMode;
    readerModeCompatible: boolean;
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
    modalEl: HTMLDivElement;
}>;

const MODAL_CLASS = "modal";
const OVERLAY_CLASS = "modal-overlay";
const NON_BLOCKING_STACK_ID = "non-blocking-modal-stack";
const READER_MODE_INCOMPATIBLE_CLASS = "readerModeIncompatible";

const globalRanInit = new WeakSet<() => void>();

let globalEscInstalled = false;
const globalOpenOrder: string[] = [];
const globalOpenByKey = new Map<string, OpenEntry>();

function ensureGlobalEsc(): void {
    if (globalEscInstalled) return;
    globalEscInstalled = true;

    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        if (event.defaultPrevented) return;

        for (let i = globalOpenOrder.length - 1; i >= 0; i -= 1) {
            const key = globalOpenOrder[i];
            const entry = globalOpenByKey.get(key);
            if (!entry) continue;
            if (!entry.closeOnEscape) continue;
            entry.close();
            return;
        }
    });
}

function ensureCss(cssHref: string): void {
    const sheets = Array.from(document.styleSheets);
    for (const s of sheets) {
        if (!s.href) continue;
        if (s.href.endsWith(cssHref)) return;
    }

    const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']"));
    for (const l of links) {
        if (l.getAttribute("href") === cssHref) return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);
}

function ensureNonBlockingHost(): HTMLDivElement {
    const existing = document.getElementById(NON_BLOCKING_STACK_ID);
    if (existing instanceof HTMLDivElement) return existing;

    const host = document.createElement("div");
    host.id = NON_BLOCKING_STACK_ID;
    document.body.appendChild(host);
    return host;
}

function syncBodyScrollLock(): void {
    for (const entry of globalOpenByKey.values()) {
        if (entry.mode === "blocking") {
            document.body.classList.add("no-scroll");
            return;
        }
    }
    document.body.classList.remove("no-scroll");
}

function bringToFront(key: string): void {
    if (!key) return;

    const idx = globalOpenOrder.indexOf(key);
    if (idx >= 0) globalOpenOrder.splice(idx, 1);
    globalOpenOrder.push(key);

    const base = 10000;
    for (let i = 0; i < globalOpenOrder.length; i += 1) {
        const k = globalOpenOrder[i];
        const entry = globalOpenByKey.get(k);
        if (!entry) continue;

        const overlayZ = base + i * 2;
        const modalZ = base + i * 2 + 1;

        if (entry.overlayEl) entry.overlayEl.style.zIndex = String(overlayZ);
        entry.modalEl.style.zIndex = String(modalZ);
    }
}

function removeFromFront(key: string): void {
    const idx = globalOpenOrder.indexOf(key);
    if (idx < 0) return;
    globalOpenOrder.splice(idx, 1);

    const newTop = globalOpenOrder[globalOpenOrder.length - 1] ?? "";
    if (newTop) bringToFront(newTop);
}

function resolveId(preferredId: string | undefined): string {
    const raw = (preferredId ?? "").trim();
    if (raw) return raw;

    if ("crypto" in window && "randomUUID" in crypto) {
        return `modal-${crypto.randomUUID()}`;
    }

    const r = Math.random().toString(16).slice(2);
    return `modal-${Date.now()}-${r}`;
}

function runDecoratorInitOnce(decorators: readonly ModalDecorator[]): void {
    for (const d of decorators) {
        const cssHref = d.cssHref;
        if (cssHref) ensureCss(cssHref);

        const init = d.init;
        if (!init) continue;
        if (globalRanInit.has(init)) continue;

        globalRanInit.add(init);
        init();
    }
}

function applyPatchDecorators(
    html: string,
    decorators: readonly ModalDecorator[],
    info: ModalDecoratorInfo
): string {
    let out = html;

    for (const d of decorators) {
        const patch = d.patchHtml;
        if (!patch) continue;
        out = patch(out, info);
    }

    return out;
}

export class ModalFactory {
    readonly #factoryToken: string;
    readonly #sessionsById: Map<string, ModalSession>;

    constructor() {
        this.#factoryToken = resolveId("factory");
        this.#sessionsById = new Map<string, ModalSession>();
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
        return this.#sessionsById.get(id) ?? null;
    }

    /**
     * @returns {readonly ModalSession[]} Open sessions created by this factory.
     */
    listOpenSessions(): readonly ModalSession[] {
        return Array.from(this.#sessionsById.values());
    }

    /** @internal */
    _keyFor(id: string): string {
        return `${this.#factoryToken}::${id}`;
    }

    /** @internal */
    _registerSession(id: string, session: ModalSession): void {
        this.#sessionsById.set(id, session);
    }

    /** @internal */
    _unregisterSession(id: string): void {
        this.#sessionsById.delete(id);
    }
}

export class Modal {
    readonly #factory: ModalFactory;

    readonly #id: string;
    #mode: ModalMode;

    readonly #readerModeCompatible: boolean;

    #content: string | (() => string);

    #modalClassName: string;
    #overlayClassName: string;

    #closeOnEscape: boolean;
    #closeOnOutsideClick: boolean;

    #decorators: ModalDecorator[];

    constructor(factory: ModalFactory, spec: ModalSpec) {
        this.#factory = factory;

        this.#id = resolveId(spec.id);
        this.#mode = spec.mode ?? "blocking";

        this.#readerModeCompatible = spec.readerModeCompatible ?? true;

        this.#content = spec.content;

        this.#modalClassName = spec.modalClassName ?? "";
        this.#overlayClassName = spec.overlayClassName ?? "";

        this.#closeOnEscape = spec.closeOnEscape ?? true;
        this.#closeOnOutsideClick =
            spec.closeOnOutsideClick ?? (this.#mode === "blocking");

        this.#decorators = Array.from(spec.decorators ?? []);
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
        this.#content = content;

        const open = this.#factory.getOpenSession(this.#id);
        if (!open) return this;

        open.setHtml(this.renderHtml());
        return this;
    }

    /**
     * @param {ModalDecorator} decorator - Decorator to add.
     * @returns {this} This modal.
     */
    decorate(decorator: ModalDecorator): this {
        this.#decorators.push(decorator);

        const open = this.#factory.getOpenSession(this.#id);
        if (!open) return this;

        open.setHtml(this.renderHtml());
        return this;
    }

    /**
     * @returns {string} Rendered HTML after patch decorators.
     */
    renderHtml(): string {
        const info: ModalDecoratorInfo = {
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#readerModeCompatible
        };
        const base = typeof this.#content === "function" ? this.#content() : this.#content;

        runDecoratorInitOnce(this.#decorators);
        return applyPatchDecorators(base, this.#decorators, info);
    }

    /**
     * Opens the modal. If already open, it is brought to front and refreshed.
     *
     * @returns {ModalSession} Live session.
     */
    open(): ModalSession {
        ensureGlobalEsc();

        const already = this.#factory.getOpenSession(this.#id);
        if (already) {
            already.setHtml(this.renderHtml());
            already.bringToFront();
            return already;
        }

        const session = new ModalSession({
            factory: this.#factory,
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#readerModeCompatible,
            modalClassName: this.#modalClassName,
            overlayClassName: this.#overlayClassName,
            closeOnEscape: this.#closeOnEscape,
            closeOnOutsideClick: this.#closeOnOutsideClick,
            decorators: this.#decorators,
            html: this.renderHtml()
        });

        this.#factory._registerSession(this.#id, session);
        session.open();
        return session;
    }

    /**
     * @returns {boolean} True if this modal is open.
     */
    isOpen(): boolean {
        return this.#factory.getOpenSession(this.#id) !== null;
    }

    /**
     * Closes this modal if open.
     *
     * @returns {boolean} True if closed.
     */
    close(): boolean {
        const open = this.#factory.getOpenSession(this.#id);
        if (!open) return false;
        open.close();
        return true;
    }
}

type ModalSessionSpec = Readonly<{
    factory: ModalFactory;
    id: string;
    mode: ModalMode;

    readerModeCompatible: boolean;

    modalClassName: string;
    overlayClassName: string;

    closeOnEscape: boolean;
    closeOnOutsideClick: boolean;

    decorators: readonly ModalDecorator[];
    html: string;
}>;

export class ModalSession {
    readonly #factory: ModalFactory;
    readonly #key: string;

    readonly #id: string;
    readonly #mode: ModalMode;

    readonly #readerModeCompatible: boolean;

    readonly #closeOnEscape: boolean;
    readonly #closeOnOutsideClick: boolean;

    readonly #decorators: readonly ModalDecorator[];

    readonly #modalEl: HTMLDivElement;
    readonly #overlayEl: HTMLDivElement | null;

    #mountedCleanups: Array<() => void>;

    constructor(spec: ModalSessionSpec) {
        this.#factory = spec.factory;
        this.#id = spec.id;
        this.#mode = spec.mode;

        this.#readerModeCompatible = spec.readerModeCompatible;

        this.#closeOnEscape = spec.closeOnEscape;
        this.#closeOnOutsideClick = spec.closeOnOutsideClick;
        this.#decorators = spec.decorators;

        this.#key = this.#factory._keyFor(this.#id);
        this.#mountedCleanups = [];

        this.#modalEl = document.createElement("div");
        this.#modalEl.id = this.#id;

        const modalClasses = [MODAL_CLASS, spec.modalClassName].filter(Boolean).join(" ");
        this.#modalEl.className = modalClasses;

        if (this.#mode === "non-blocking") this.#modalEl.classList.add("non-blocking");

        this.#overlayEl = this.#mode === "blocking"
            ? document.createElement("div")
            : null;

        if (this.#overlayEl) {
            this.#overlayEl.id = `modal-overlay-${this.#id}`;
            this.#overlayEl.className = [OVERLAY_CLASS, spec.overlayClassName].filter(Boolean).join(" ");
            this.#overlayEl.appendChild(this.#modalEl);
        }

        if (!this.#readerModeCompatible) {
            this.#modalEl.classList.add(READER_MODE_INCOMPATIBLE_CLASS);
            this.#overlayEl?.classList.add(READER_MODE_INCOMPATIBLE_CLASS);
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
        return this.#modalEl;
    }

    /**
     * @returns {HTMLDivElement | null} Overlay element.
     */
    get overlayEl(): HTMLDivElement | null {
        return this.#overlayEl;
    }

    /**
     * @returns {void} Opens and mounts the session into DOM.
     */
    open(): void {
        if (globalOpenByKey.has(this.#key)) {
            this.bringToFront();
            return;
        }

        if (this.#overlayEl) {
            document.body.appendChild(this.#overlayEl);

            if (this.#closeOnOutsideClick) {
                this.#overlayEl.addEventListener("click", (event: MouseEvent) => {
                    if (event.target !== this.#overlayEl) return;
                    this.close();
                });
            }
        } else {
            const host = ensureNonBlockingHost();
            host.appendChild(this.#modalEl);
        }

        globalOpenByKey.set(this.#key, {
            key: this.#key,
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#readerModeCompatible,
            closeOnEscape: this.#closeOnEscape,
            close: () => this.close(),
            overlayEl: this.#overlayEl,
            modalEl: this.#modalEl
        });

        bringToFront(this.#key);
        syncBodyScrollLock();

        this.#mountDecorators();
    }

    /**
     * @param {string} html - New HTML.
     * @returns {void} Updates HTML and remounts decorator behaviour.
     */
    setHtml(html: string): void {
        this.#modalEl.innerHTML = html;
        this.#remountDecoratorsIfOpen();
    }

    /**
     * @returns {void} Brings this modal to front.
     */
    bringToFront(): void {
        bringToFront(this.#key);
    }

    /**
     * @returns {void} Closes and cleans up.
     */
    close(): void {
        const entry = globalOpenByKey.get(this.#key);
        if (!entry) return;

        this.#runMountedCleanups();

        this.#overlayEl?.remove();
        if (!this.#overlayEl) this.#modalEl.remove();

        globalOpenByKey.delete(this.#key);
        removeFromFront(this.#key);
        syncBodyScrollLock();

        this.#factory._unregisterSession(this.#id);
    }

    #remountDecoratorsIfOpen(): void {
        if (!globalOpenByKey.has(this.#key)) return;
        this.#mountDecorators(true);
    }

    #runMountedCleanups(): void {
        for (const fn of this.#mountedCleanups) {
            try { fn(); } catch { /* ignore */ }
        }
        this.#mountedCleanups = [];
    }

    #mountDecorators(clearFirst: boolean = false): void {
        if (clearFirst) this.#runMountedCleanups();

        const ctx: ModalDecoratorContext = {
            id: this.#id,
            mode: this.#mode,
            readerModeCompatible: this.#readerModeCompatible,
            modalEl: this.#modalEl,
            overlayEl: this.#overlayEl,
            close: () => this.close(),
            setHtml: (html: string) => this.setHtml(html)
        };

        for (const d of this.#decorators) {
            const mount = d.mount;
            if (!mount) continue;

            const cleanup = mount(ctx);
            if (typeof cleanup !== "function") continue;

            this.#mountedCleanups.push(cleanup);
        }
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
            const nodes = Array.from(ctx.modalEl.querySelectorAll(selector));
            const elems = nodes.filter((n): n is HTMLElement => n instanceof HTMLElement);

            if (!elems.length) return;

            const listener = (ev: Event): void => {
                const typed = ev as HTMLElementEventMap[K];
                fn(typed, ctx);
            };

            for (const el of elems) {
                el.addEventListener(eventName, listener);
            }

            return () => {
                for (const el of elems) {
                    el.removeEventListener(eventName, listener);
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