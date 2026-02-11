type MobileDetectInstance = Readonly<{
    mobile: () => unknown;
}>;

type MobileDetectCtor = new (userAgent: string) => MobileDetectInstance;

type XtermResizeEvent = Readonly<{
    cols: number;
    rows: number;
}>;

type XtermTerminal = Readonly<{
    element?: HTMLElement | null;
    cols: number;
    rows: number;

    loadAddon: (addon: unknown) => void;
    open: (parent: HTMLElement) => void;

    write: (data: string, callback?: () => void) => void;
    writeln: (data: string, callback?: () => void) => void;

    scrollToBottom: () => void;

    onData: (handler: (data: string) => void) => unknown;
    onResize: (handler: (e: XtermResizeEvent) => void) => unknown;

    onRender?: (handler: () => void) => unknown;

    dispose: () => void;
}>;

type XtermTerminalCtor = new (options: Record<string, unknown>) => XtermTerminal;

type XtermFitAddon = Readonly<{
    fit: () => void;
}>;

type XtermFitAddonCtor = new () => XtermFitAddon;

declare global {
    interface Window {
        MobileDetect?: MobileDetectCtor;

        Terminal?: XtermTerminalCtor;

        FitAddon?: Readonly<{
            FitAddon: XtermFitAddonCtor;
        }>;
    }
}

type FollowState = {
    value: boolean;
};

type ScrollTrackingController = Readonly<{
    scrollToBottom: () => void;
    maybeScroll: () => void;
    forceFollowAndScroll: () => void;
}>;

type SessionTokenResult = Readonly<{
    token: string;
    isNew: boolean;
}>;

type WebSocketTransportOptions = Readonly<{
    onOpen?: (socket: WebSocket) => void;
    connectRef?: () => void;
}>;

type WebUiTheme = "dark" | "light";

export type TerminalModule = Readonly<{
    term: XtermTerminal;
    fitAddon: XtermFitAddon;
    sendSeq: (seq: string) => void;
    setWebUiTheme: (theme: WebUiTheme) => void;
    dispose: () => void;
}>;

function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @returns {Promise<void>} Resolves on the next animation frame.
 */
function nextFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

/**
 * @returns {Promise<boolean>} True if MobileDetect considers the UA mobile, else false.
 */
async function checkMobile(): Promise<boolean> {
    while (document.readyState === "loading") {
        await nextFrame();
    }

    if (!window.MobileDetect) {
        const script = document.createElement("script");
        script.src = "https://kittycrypto.gg/external?src=https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.js";
        script.async = true;
        document.body.appendChild(script);

        await new Promise<void>((resolve) => {
            script.onload = () => resolve();
            script.onerror = () => resolve();
        });
    }

    const Ctor = window.MobileDetect;
    if (!Ctor) return false;

    const md = new Ctor(window.navigator.userAgent);
    const mobileValue = md.mobile();
    return !!mobileValue;
}

/**
 * @param {string} src - Script URL.
 * @returns {Promise<void>} Resolves when the script is present and loaded.
 */
function injectScript(src: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
        if (existing) {
            resolve();
            return;
        }

        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(s);
    });
}

/**
 * @param {string} href - Stylesheet URL.
 * @returns {void} Nothing.
 */
function injectCssLink(href: string): void {
    const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

/**
 * @returns {Promise<void>} Resolves when xterm.js and fit addon are available on window.
 */
async function ensureXtermLoaded(): Promise<void> {
    const hasTerminal = typeof window.Terminal !== "undefined";
    const hasFit = typeof window.FitAddon !== "undefined";

    injectCssLink("https://cdn.jsdelivr.net/npm/xterm/css/xterm.css");

    if (!hasTerminal) {
        await injectScript("https://cdn.jsdelivr.net/npm/xterm/lib/xterm.js");
    }

    if (!hasFit) {
        await injectScript("https://cdn.jsdelivr.net/npm/xterm-addon-fit/lib/xterm-addon-fit.js");
    }
}

/**
 * @param {() => void} fn - Callback to run after two frames.
 * @returns {void} Nothing.
 */
function raf2(fn: () => void): void {
    window.requestAnimationFrame(() => window.requestAnimationFrame(fn));
}

/**
 * @param {string} id - Element id.
 * @returns {HTMLElement | null} The element if it is an HTMLElement.
 */
function safeGetEl(id: string): HTMLElement | null {
    const el = document.getElementById(id);
    return el instanceof HTMLElement ? el : null;
}

/**
 * @param {readonly string[]} ids - Candidate element ids.
 * @returns {HTMLElement | null} First matching HTMLElement.
 */
function firstExistingEl(ids: readonly string[]): HTMLElement | null {
    for (const id of ids) {
        const el = safeGetEl(id);
        if (el) return el;
    }
    return null;
}

/**
 * @param {HTMLElement} windowWrapper - Terminal window wrapper.
 * @returns {void} Nothing.
 */
function applyFloatingStyles(windowWrapper: HTMLElement): void {
    const w = localStorage.getItem("terminal-width") || "50%";
    const h = localStorage.getItem("terminal-height") || "";
    const left = localStorage.getItem("terminal-x") || localStorage.getItem("term-icon-x") || "10px";
    const top = localStorage.getItem("terminal-y") || localStorage.getItem("term-icon-y") || "10px";

    Object.assign(windowWrapper.style, {
        position: "absolute",
        zIndex: "9999",
        width: w,
        height: h,
        resize: "both",
        overflow: "hidden",
        left,
        top
    } satisfies Partial<CSSStyleDeclaration>);
}

/**
 * @param {HTMLElement} windowWrapper - Terminal window wrapper.
 * @returns {void} Nothing.
 */
function applyDockedStyles(windowWrapper: HTMLElement): void {
    Object.assign(windowWrapper.style, {
        position: "relative",
        zIndex: "",
        width: "100%",
        height: "",
        resize: "",
        overflow: "hidden",
        left: "",
        top: ""
    } satisfies Partial<CSSStyleDeclaration>);
}

/**
 * @param {HTMLElement} windowWrapper - Terminal window wrapper.
 * @returns {void} Nothing.
 */
function saveWindowSize(windowWrapper: HTMLElement): void {
    localStorage.setItem("terminal-width", `${windowWrapper.offsetWidth}px`);
    localStorage.setItem("terminal-height", `${windowWrapper.offsetHeight}px`);
}

/**
 * @returns {void} Nothing.
 */
function makeIconDraggable(): void {
    const iconEl = safeGetEl("term-icon");
    if (!(iconEl instanceof HTMLImageElement)) return;

    const icon = iconEl;

    if (icon.dataset.dragWired === "true") return;
    icon.dataset.dragWired = "true";

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    icon.addEventListener("mousedown", (e: MouseEvent) => {
        isDragging = true;
        offsetX = e.clientX - icon.offsetLeft;
        offsetY = e.clientY - icon.offsetTop;
        icon.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e: MouseEvent) => {
        if (!isDragging) return;

        const x = e.clientX - offsetX;
        const y = e.clientY - offsetY;

        icon.style.left = `${x}px`;
        icon.style.top = `${y}px`;

        localStorage.setItem("term-icon-x", icon.style.left);
        localStorage.setItem("term-icon-y", icon.style.top);
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        icon.style.cursor = "grab";
    });

    const savedX = localStorage.getItem("term-icon-x");
    const savedY = localStorage.getItem("term-icon-y");
    if (savedX) icon.style.left = savedX;
    if (savedY) icon.style.top = savedY;
}

/**
 * @param {HTMLElement} windowWrapper - Terminal window wrapper.
 * @param {() => void} fitNow - Fit callback.
 * @returns {void} Nothing.
 */
function makeTermDragWPrnt(windowWrapper: HTMLElement, fitNow: () => void): void {
    const header = windowWrapper.querySelector("#terminal-header");
    if (!(header instanceof HTMLElement)) return;

    if (header.dataset.dragWired === "true") return;
    header.dataset.dragWired = "true";

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    header.addEventListener("mousedown", (e: MouseEvent) => {
        if (!windowWrapper.classList.contains("floating")) return;

        isDragging = true;
        startX = e.clientX - windowWrapper.offsetLeft;
        startY = e.clientY - windowWrapper.offsetTop;
        windowWrapper.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e: MouseEvent) => {
        if (!isDragging) return;

        const x = e.clientX - startX;
        const y = e.clientY - startY;

        windowWrapper.style.left = `${x}px`;
        windowWrapper.style.top = `${y}px`;
        windowWrapper.style.transform = "none";

        localStorage.setItem("terminal-x", windowWrapper.style.left);
        localStorage.setItem("terminal-y", windowWrapper.style.top);

        localStorage.setItem("term-icon-x", windowWrapper.style.left);
        localStorage.setItem("term-icon-y", windowWrapper.style.top);
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;

        isDragging = false;
        windowWrapper.style.cursor = "default";
        saveWindowSize(windowWrapper);

        raf2(fitNow);
    });
}

/**
 * @param {() => void} fitNow - Fit callback.
 * @returns {() => void} Detach function.
 */
function attachSafeResizeFitting(fitNow: () => void): () => void {
    const onResize = (): void => raf2(fitNow);
    window.addEventListener("resize", onResize);

    const vv = window.visualViewport ?? null;
    const onVVResize = vv ? (): void => raf2(fitNow) : null;

    if (vv && onVVResize) vv.addEventListener("resize", onVVResize);

    return (): void => {
        window.removeEventListener("resize", onResize);
        if (vv && onVVResize) vv.removeEventListener("resize", onVVResize);
    };
}

/**
 * @param {XtermTerminal} term - Xterm terminal instance.
 * @param {FollowState} followState - Follow state reference.
 * @returns {ScrollTrackingController} Scroll tracking controller.
 */
function attachScrollTracking(term: XtermTerminal, followState: FollowState): ScrollTrackingController {
    type InternalController = {
        _viewport: HTMLElement | null;
        _programmatic: boolean;

        _resolveViewport: () => HTMLElement | null;
        _atBottom: (vp: HTMLElement) => boolean;

        scrollToBottom: () => void;
        maybeScroll: () => void;
        forceFollowAndScroll: () => void;

        wire: () => boolean;
    };

    const ctl: InternalController = {
        _viewport: null,
        _programmatic: false,

        _resolveViewport(): HTMLElement | null {
            const root = term.element ?? null;
            if (!root) return null;

            const vp = root.querySelector(".xterm-viewport");
            if (vp instanceof HTMLElement) {
                this._viewport = vp;
                return vp;
            }

            return this._viewport;
        },

        _atBottom(vp: HTMLElement): boolean {
            return vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2;
        },

        scrollToBottom(): void {
            this._programmatic = true;
            term.scrollToBottom();
            window.requestAnimationFrame(() => {
                this._programmatic = false;
            });
        },

        maybeScroll(): void {
            if (!followState.value) return;
            this.scrollToBottom();
        },

        forceFollowAndScroll(): void {
            followState.value = true;
            this.scrollToBottom();
        },

        wire(): boolean {
            const vp = this._resolveViewport();
            if (!vp) return false;

            if (vp.dataset.scrollWired === "true") return true;
            vp.dataset.scrollWired = "true";

            vp.addEventListener("scroll", () => {
                if (this._programmatic) return;
                followState.value = this._atBottom(vp);
            });

            return true;
        }
    };

    if (!ctl.wire()) {
        raf2(() => {
            ctl.wire();
        });
    }

    return {
        scrollToBottom: () => ctl.scrollToBottom(),
        maybeScroll: () => ctl.maybeScroll(),
        forceFollowAndScroll: () => ctl.forceFollowAndScroll()
    };
}

/**
 * @returns {Promise<SessionTokenResult>} Session token and whether it was newly created.
 */
async function getOrCreateSessionToken(): Promise<SessionTokenResult> {
    const key = "kc-session-token";

    const existing = sessionStorage.getItem(key);
    if (existing && existing.length > 0) {
        return { token: existing, isNew: false };
    }

    const res = await fetch("https://srv.kittycrypto.gg/session-token", {
        method: "GET",
        cache: "no-store",
        credentials: "omit"
    });

    if (!res.ok) {
        throw new Error(`Failed to obtain session token (status=${res.status})`);
    }

    const bodyUnknown: unknown = await res.json();
    const token =
        isRecord(bodyUnknown) &&
            typeof bodyUnknown.sessionToken === "string" &&
            bodyUnknown.sessionToken.length > 0
            ? bodyUnknown.sessionToken
            : "";

    if (!token) {
        throw new Error("Session endpoint returned no sessionToken");
    }

    sessionStorage.setItem(key, token);
    return { token, isNew: true };
}

/**
 * @param {XtermTerminal} term - Xterm terminal.
 * @param {ScrollTrackingController} scrollCtl - Scroll controller.
 * @param {WebSocketTransportOptions} opts - Transport options.
 * @returns {Promise<WebSocket>} Connected websocket.
 */
async function attachWebSocketTransport(
    term: XtermTerminal,
    scrollCtl: ScrollTrackingController,
    opts: WebSocketTransportOptions = {}
): Promise<WebSocket> {
    const { token: sessionToken, isNew } = await getOrCreateSessionToken();
    const wsUrl = `wss://bash.kittycrypto.gg/?sessionToken=${encodeURIComponent(sessionToken)}`;

    const onOpen = typeof opts.onOpen === "function" ? opts.onOpen : null;
    const connectRef = typeof opts.connectRef === "function" ? opts.connectRef : null;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
        scrollCtl.forceFollowAndScroll();

        if (onOpen) onOpen(ws);

        if (!isNew) return;

        window.setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send("nekofetch\r");
        }, 50);
    });

    ws.addEventListener("message", (ev: MessageEvent) => {
        if (typeof ev.data === "string") {
            term.write(ev.data);
            scrollCtl.maybeScroll();
            return;
        }

        if (ev.data instanceof ArrayBuffer) {
            const text = new TextDecoder().decode(ev.data);
            term.write(text);
            scrollCtl.maybeScroll();
            return;
        }

        if (ev.data instanceof Blob) {
            void ev.data.arrayBuffer().then((buf) => {
                const text = new TextDecoder().decode(buf);
                term.write(text);
                scrollCtl.maybeScroll();
            });
            return;
        }

        // Unknown payload shape, ignore.
    });

    ws.addEventListener("close", (ev: CloseEvent) => {
        if (ev.code === 4001) {
            sessionStorage.removeItem("kc-session-token");
            term.writeln("\r\n[session ended, reconnecting with a new token…]");
            scrollCtl.forceFollowAndScroll();

            if (connectRef) {
                window.setTimeout(() => {
                    connectRef();
                }, 0);
            }

            return;
        }

        term.writeln("\r\n[disconnected]");
        scrollCtl.forceFollowAndScroll();
    });

    ws.addEventListener("error", () => {
        term.writeln("\r\n[connection error]");
        scrollCtl.forceFollowAndScroll();
    });

    return ws;
}

/**
 * @returns {Promise<TerminalModule>} Terminal module API.
 */
export async function setupTerminalModule(): Promise<TerminalModule> {
    await ensureXtermLoaded();

    const TerminalCtor = window.Terminal;
    if (!TerminalCtor) throw new Error("xterm.js failed to load (window.Terminal missing)");

    const FitAddonNamespace = window.FitAddon;
    const FitAddonCtor = FitAddonNamespace?.FitAddon;
    if (!FitAddonCtor) throw new Error("xterm fit addon failed to load (window.FitAddon.FitAddon missing)");

    let ws: WebSocket | null = null;
    let reconnecting = false;
    let webUiThemePending: WebUiTheme | null = null;

    /**
     * @param {WebSocket | null} socket - Optional socket override.
     * @returns {void} Nothing.
     */
    const sendPendingWebUiTheme = (socket: WebSocket | null = null): void => {
        const s = socket || ws;
        if (!webUiThemePending) return;
        if (!s || s.readyState !== WebSocket.OPEN) return;

        s.send(JSON.stringify({
            type: "setEnv",
            key: "WEB_UI_THEME",
            value: webUiThemePending
        }));

        webUiThemePending = null;
    };

    /**
     * @param {WebUiTheme} theme - Theme value.
     * @returns {void} Nothing.
     */
    const setWebUiTheme = (theme: WebUiTheme): void => {
        webUiThemePending = theme;
        sendPendingWebUiTheme();
    };

    const terminalWrapper = safeGetEl("terminal-wrapper");
    const shellWrapper = firstExistingEl(["shell-wrapper", "banner-wrapper"]);
    const iconEl = safeGetEl("term-icon");

    if (!terminalWrapper) throw new Error("Missing element: #terminal-wrapper");
    if (!shellWrapper) throw new Error("Missing element: #shell-wrapper or #banner-wrapper");
    if (!(iconEl instanceof HTMLImageElement)) throw new Error("Missing element: #term-icon");

    const icon = iconEl;

    const windowWrapper = document.createElement("div");
    windowWrapper.id = "terminal-window";
    windowWrapper.style.position = "relative";

    const header = document.createElement("div");
    header.id = "terminal-header";

    const controls = document.createElement("div");
    controls.classList.add("window-controls");

    const closeBtn = document.createElement("span");
    closeBtn.classList.add("btn", "close");
    closeBtn.textContent = "🔴";

    const toggleViewBtn = document.createElement("span");
    toggleViewBtn.classList.add("btn", "toggle-view");
    toggleViewBtn.textContent = "🟡";

    const floatBtn = document.createElement("span");
    floatBtn.classList.add("btn", "float");
    floatBtn.textContent = "🟢";

    const title = document.createElement("span");
    title.classList.add("window-title");
    title.textContent = "YuriGreen Terminal Emulator - /home/kitty/";

    controls.appendChild(closeBtn);
    controls.appendChild(toggleViewBtn);
    controls.appendChild(floatBtn);
    header.appendChild(controls);
    header.appendChild(title);

    const scrollArea = document.createElement("div");
    scrollArea.id = "terminal-scroll";

    terminalWrapper.innerHTML = "";
    const termDiv = document.createElement("div");
    termDiv.id = "term";
    terminalWrapper.appendChild(termDiv);

    scrollArea.appendChild(terminalWrapper);
    windowWrapper.appendChild(header);
    windowWrapper.appendChild(scrollArea);

    shellWrapper.insertBefore(windowWrapper, shellWrapper.firstChild);

    icon.src = "/images/terminal.svg";
    icon.alt = "Terminal icon";
    icon.title = "Double-click to open terminal";

    const isMobile = await checkMobile();

    const term = new TerminalCtor({
        cursorBlink: true,
        convertEol: true,
        fontSize: isMobile ? 12 : 14
    });

    const fitAddon = new FitAddonCtor();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    const followState: FollowState = { value: true };
    const scrollCtl = attachScrollTracking(term, followState);

    let fitScheduled = false;

    /**
     * @returns {void} Nothing.
     */
    const fitNow = (): void => {
        if (windowWrapper.style.display === "none") return;
        if (terminalWrapper.style.display === "none") return;

        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        fitAddon.fit();
        scrollCtl.maybeScroll();
    };

    /**
     * @returns {void} Nothing.
     */
    const scheduleFit = (): void => {
        if (fitScheduled) return;

        fitScheduled = true;
        raf2(() => {
            fitScheduled = false;
            fitNow();
        });
    };

    let pendingResize: string | null = null;
    let lastCols = 0;
    let lastRows = 0;

    /**
     * @param {number} cols - Terminal columns.
     * @param {number} rows - Terminal rows.
     * @returns {void} Nothing.
     */
    function sendResize(cols: number, rows: number): void {
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
        if (cols <= 0 || rows <= 0) return;

        if (cols === lastCols && rows === lastRows) return;
        lastCols = cols;
        lastRows = rows;

        const payload = JSON.stringify({ type: "resize", cols, rows });

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            pendingResize = payload;
            return;
        }

        ws.send(payload);
    }

    term.onResize(({ cols, rows }) => {
        sendResize(cols, rows);
    });

    term.onData((data: string) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(data);
    });

    /**
     * @returns {Promise<void>} Resolves once a connection attempt finishes.
     */
    const connectWs = async (): Promise<void> => {
        if (reconnecting) return;
        reconnecting = true;

        try {
            const next = await attachWebSocketTransport(term, scrollCtl, {
                onOpen: (socket: WebSocket) => {
                    sendPendingWebUiTheme(socket);

                    if (pendingResize) {
                        socket.send(pendingResize);
                        pendingResize = null;
                        return;
                    }

                    sendResize(term.cols, term.rows);
                },
                connectRef: () => {
                    void connectWs();
                }
            });

            ws = next;

            ws.addEventListener("open", () => {
                if (!ws) return;

                if (pendingResize) {
                    ws.send(pendingResize);
                    pendingResize = null;
                    return;
                }

                sendResize(term.cols, term.rows);
            });
        } finally {
            reconnecting = false;
        }
    };

    await connectWs();

    if (typeof term.onRender === "function") {
        term.onRender(() => {
            scrollCtl.maybeScroll();
        });
    } else {
        const origWrite = term.write.bind(term);
        const origWriteln = term.writeln.bind(term);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        (term as unknown as { write: (data: string, cb?: () => void) => void }).write = (data: string, cb?: () => void) => {
            origWrite(data, cb);
            raf2(() => scrollCtl.maybeScroll());
        };

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        (term as unknown as { writeln: (data: string, cb?: () => void) => void }).writeln = (data: string, cb?: () => void) => {
            origWriteln(data, cb);
            raf2(() => scrollCtl.maybeScroll());
        };
    }

    const detachResizeHandlers = attachSafeResizeFitting(scheduleFit);

    makeTermDragWPrnt(windowWrapper, fitNow);
    makeIconDraggable();

    if (localStorage.getItem("terminal-floating") === "true") {
        windowWrapper.classList.add("floating");
        applyFloatingStyles(windowWrapper);
    } else {
        applyDockedStyles(windowWrapper);
    }

    if (localStorage.getItem("terminal-closed") === "true") {
        windowWrapper.style.display = "none";
        icon.style.display = "inline-block";
    } else {
        icon.style.display = "none";
    }

    if (localStorage.getItem("terminal-minimised") === "true") {
        terminalWrapper.style.display = "none";
        floatBtn.classList.add("hidden");
    } else {
        terminalWrapper.style.display = "block";
        floatBtn.classList.remove("hidden");
    }

    scheduleFit();

    closeBtn.addEventListener("click", () => {
        windowWrapper.style.display = "none";
        terminalWrapper.style.display = "block";

        localStorage.setItem("terminal-closed", "true");
        localStorage.removeItem("terminal-minimised");

        icon.style.display = "inline-block";
    });

    toggleViewBtn.addEventListener("click", () => {
        const isMinimised = terminalWrapper.style.display === "none";

        if (isMinimised) {
            terminalWrapper.style.display = "block";
            floatBtn.classList.remove("hidden");
            localStorage.removeItem("terminal-minimised");
            scheduleFit();
            return;
        }

        windowWrapper.classList.remove("floating");
        applyDockedStyles(windowWrapper);
        localStorage.removeItem("terminal-floating");

        terminalWrapper.style.display = "none";
        floatBtn.classList.add("hidden");
        localStorage.setItem("terminal-minimised", "true");
    });

    floatBtn.addEventListener("click", () => {
        const isFloating = windowWrapper.classList.toggle("floating");

        if (isFloating) {
            applyFloatingStyles(windowWrapper);
            localStorage.setItem("terminal-floating", "true");
            scheduleFit();
            return;
        }

        applyDockedStyles(windowWrapper);
        localStorage.removeItem("terminal-floating");
        scheduleFit();
    });

    icon.addEventListener("dblclick", () => {
        windowWrapper.style.display = "block";
        terminalWrapper.style.display = "block";
        icon.style.display = "none";

        localStorage.removeItem("terminal-closed");
        localStorage.removeItem("terminal-minimised");

        floatBtn.classList.remove("hidden");

        if (localStorage.getItem("terminal-floating") === "true") {
            windowWrapper.classList.add("floating");
            applyFloatingStyles(windowWrapper);
        } else {
            windowWrapper.classList.remove("floating");
            applyDockedStyles(windowWrapper);
        }

        scheduleFit();
    });

    /**
     * @returns {void} Nothing.
     */
    const onMouseUp = (): void => {
        if (!windowWrapper.classList.contains("floating")) return;
        saveWindowSize(windowWrapper);
        scheduleFit();
    };

    document.addEventListener("mouseup", onMouseUp);

    return {
        term,
        fitAddon,
        sendSeq: (seq: string): void => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(seq);
        },
        setWebUiTheme,
        dispose: (): void => {
            detachResizeHandlers();
            document.removeEventListener("mouseup", onMouseUp);

            try {
                ws?.close();
            } catch {
                // ignore
            }

            term.dispose();
        }
    };
}