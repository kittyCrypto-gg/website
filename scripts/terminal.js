async function checkMobile() {
    while (document.readyState === "loading") {
        await new Promise(resolve => requestAnimationFrame(resolve));
    }

    if (typeof window.MobileDetect === "undefined") {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.min.js";
        script.async = true;
        document.body.appendChild(script);

        await new Promise(resolve => {
            script.onload = resolve;
            script.onerror = resolve;
        });
    }

    const md = new window.MobileDetect(window.navigator.userAgent);
    const isMobile = !!md.mobile();

    return isMobile;
}

function injectScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) return resolve();

        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(s);
    });
}

function injectCssLink(href) {
    const existing = document.querySelector(`link[href="${href}"]`);
    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

async function ensureXtermLoaded() {
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

function raf2(fn) {
    requestAnimationFrame(() => requestAnimationFrame(fn));
}

function safeGetEl(id) {
    return document.getElementById(id);
}

function firstExistingEl(ids) {
    for (const id of ids) {
        const el = safeGetEl(id);
        if (el) return el;
    }
    return null;
}

function applyFloatingStyles(windowWrapper) {
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
    });
}

function applyDockedStyles(windowWrapper) {
    Object.assign(windowWrapper.style, {
        position: "relative",
        zIndex: "",
        width: "100%",
        height: "",
        resize: "",
        overflow: "hidden",
        left: "",
        top: ""
    });
}

function saveWindowSize(windowWrapper) {
    localStorage.setItem("terminal-width", `${windowWrapper.offsetWidth}px`);
    localStorage.setItem("terminal-height", `${windowWrapper.offsetHeight}px`);
}

function makeIconDraggable() {
    const icon = safeGetEl("term-icon");
    if (!icon) return;

    if (icon.dataset.dragWired === "true") return;
    icon.dataset.dragWired = "true";

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    icon.addEventListener("mousedown", (e) => {
        isDragging = true;
        offsetX = e.clientX - icon.offsetLeft;
        offsetY = e.clientY - icon.offsetTop;
        icon.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", (e) => {
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

function makeTermDragWPrnt(windowWrapper, fitNowRef) {
    const header = windowWrapper.querySelector("#terminal-header");
    if (!header) return;

    header._fitNowRef = fitNowRef;

    if (header.dataset.dragWired === "true") return;
    header.dataset.dragWired = "true";

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    header.addEventListener("mousedown", (e) => {
        if (!windowWrapper.classList.contains("floating")) return;
        isDragging = true;
        startX = e.clientX - windowWrapper.offsetLeft;
        startY = e.clientY - windowWrapper.offsetTop;
        windowWrapper.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
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

        const ref = header._fitNowRef;
        if (ref && typeof ref.fitNow === "function") raf2(ref.fitNow);
    });
}

function attachSafeResizeFitting(fitNow) {
    const onResize = () => raf2(fitNow);
    window.addEventListener("resize", onResize);

    let vv = null;
    let onVVResize = null;
    if (window.visualViewport) {
        vv = window.visualViewport;
        onVVResize = () => raf2(fitNow);
        vv.addEventListener("resize", onVVResize);
    }

    return () => {
        window.removeEventListener("resize", onResize);
        if (vv && onVVResize) vv.removeEventListener("resize", onVVResize);
    };
}

/* ============================
    Auto-follow scroll handling
============================ */

function attachScrollTracking(term, followState) {
    const ctl = {
        _viewport: null,
        _programmatic: false,

        _resolveViewport() {
            if (!term.element) return null;
            const vp = term.element.querySelector(".xterm-viewport");
            if (vp) this._viewport = vp;
            return this._viewport;
        },

        _atBottom(vp) {
            return vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2;
        },

        scrollToBottom() {
            this._programmatic = true;
            term.scrollToBottom();
            requestAnimationFrame(() => {
                this._programmatic = false;
            });
        },

        maybeScroll() {
            if (!followState.value) return;
            this.scrollToBottom();
        },

        forceFollowAndScroll() {
            followState.value = true;
            this.scrollToBottom();
        },

        wire() {
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

    // Try wiring now, then a couple of frames later (xterm builds DOM after open)
    if (!ctl.wire()) {
        raf2(() => {
            ctl.wire();
        });
    }

    return ctl;
}

function wireBasicInput(term, followState, scrollCtl) {
    let line = "";

    const prompt = () => {
        term.write("\r\nkitty@kittycrypto:~$ ");
        scrollCtl.maybeScroll();
    };

    term.writeln("YuriGreen Terminal Emulator");
    term.writeln("Type commands locally (no backend attached).");
    term.write("kitty@kittycrypto:~$ ");
    scrollCtl.maybeScroll();

    term.onData((data) => {
        const code = data.charCodeAt(0);

        // Enter
        if (data === "\r") {
            // On enter, always go back to the bottom.
            scrollCtl.forceFollowAndScroll();

            term.writeln("");
            if (line.trim().length > 0) term.writeln(`command not found: ${line.trim()}`);
            line = "";
            prompt();
            return;
        }

        // Backspace (DEL)
        if (code === 127) {
            if (line.length === 0) return;
            line = line.slice(0, -1);
            term.write("\b \b");
            return;
        }

        // Ctrl+C
        if (data === "\u0003") {
            term.write("^C");
            line = "";
            prompt();
            return;
        }

        // Printable chars
        if (code >= 32) {
            line += data;
            term.write(data);
        }
    });
}

async function getOrCreateSessionToken() {
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

    const body = await res.json();
    const token =
        body &&
            typeof body.sessionToken === "string" &&
            body.sessionToken.length > 0
            ? body.sessionToken
            : "";

    if (!token) {
        throw new Error("Session endpoint returned no sessionToken");
    }

    sessionStorage.setItem(key, token);
    return { token, isNew: true };
}

async function attachWebSocketTransport(term, scrollCtl, opts = {}) {
    const { token: sessionToken, isNew } = await getOrCreateSessionToken();
    const wsUrl = `wss://bash.kittycrypto.gg/?sessionToken=${encodeURIComponent(sessionToken)}`;

    const onOpen = opts && typeof opts.onOpen === "function" ? opts.onOpen : null;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
        scrollCtl.forceFollowAndScroll();

        if (onOpen) onOpen(ws);

        // Only run nekofetch for a freshly minted token in this tab/session
        if (isNew) {
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send("nekofetch\r");
                }
            }, 50);
        }
    });

    ws.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") {
            term.write(ev.data);
        } else {
            const text = new TextDecoder().decode(ev.data);
            term.write(text);
        }
        scrollCtl.maybeScroll();
    });

    ws.addEventListener("close", () => {
        term.writeln("\r\n[disconnected]");
        scrollCtl.forceFollowAndScroll();
    });

    ws.addEventListener("error", () => {
        term.writeln("\r\n[connection error]");
        scrollCtl.forceFollowAndScroll();
    });

    term.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    return ws;
}

export async function setupTerminalModule() {
    await ensureXtermLoaded();

    let ws = null;
    let webUiThemePending = null;

    const sendPendingWebUiTheme = (socket) => {
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

    const setWebUiTheme = (theme) => {
        const t = (theme === "dark" || theme === "light") ? theme : null;
        if (!t) return;

        webUiThemePending = t;
        sendPendingWebUiTheme();
    };


    const terminalWrapper = safeGetEl("terminal-wrapper");
    const shellWrapper = firstExistingEl(["shell-wrapper", "banner-wrapper"]);
    const icon = safeGetEl("term-icon");

    if (!terminalWrapper) throw new Error("Missing element: #terminal-wrapper");
    if (!shellWrapper) throw new Error("Missing element: #shell-wrapper or #banner-wrapper");
    if (!icon) throw new Error("Missing element: #term-icon");

    // Build the window shell
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

    // Ensure an xterm container exists and is the only content inside terminalWrapper
    terminalWrapper.innerHTML = "";
    const termDiv = document.createElement("div");
    termDiv.id = "term";
    terminalWrapper.appendChild(termDiv);

    scrollArea.appendChild(terminalWrapper);
    windowWrapper.appendChild(header);
    windowWrapper.appendChild(scrollArea);

    // Insert window into shell wrapper
    shellWrapper.insertBefore(windowWrapper, shellWrapper.firstChild);

    // Icon setup
    icon.src = "/images/terminal.svg";
    icon.alt = "Terminal icon";
    icon.title = "Double-click to open terminal";

    const isMobile = await checkMobile();
    // Create terminal
    const term = new window.Terminal({
        cursorBlink: true,
        convertEol: true,
        fontSize: isMobile ? 12 : 14,
        //theme: buildXtermTheme()
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    // Follow state + scroll controller
    const followState = { value: true };
    const scrollCtl = attachScrollTracking(term, followState);

    // Fit scheduling (prevents spam fits from multiple events)
    let fitScheduled = false;

    const fitNow = () => {
        // Do not fit when hidden
        if (windowWrapper.style.display === "none") return;
        if (terminalWrapper.style.display === "none") return;

        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        fitAddon.fit();
        scrollCtl.maybeScroll();
    };

    const scheduleFit = () => {
        if (fitScheduled) return;
        fitScheduled = true;
        raf2(() => {
            fitScheduled = false;
            fitNow();
        });
    };

    // Provide fit ref for drag wiring without duplicating listeners
    const fitNowRef = { fitNow };

    // Wire input demo
    //wireBasicInput(term, followState, scrollCtl);
    ws = await attachWebSocketTransport(term, scrollCtl, {
        onOpen: () => {
            sendPendingWebUiTheme();
        }
    });

    let pendingResize = null;
    let lastCols = 0;
    let lastRows = 0;

    function sendResize(cols, rows) {
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
        if (cols <= 0 || rows <= 0) return;

        // De-dupe
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

    // Send resize whenever xterm's grid changes
    term.onResize(({ cols, rows }) => {
        sendResize(cols, rows);
    });

    // Flush the first resize once the socket opens
    ws.addEventListener("open", () => {
        if (pendingResize) {
            ws.send(pendingResize);
            pendingResize = null;
        } else {
            // Push current size once connected
            sendResize(term.cols, term.rows);
        }
    });

    // Auto-scroll on render, but only if user is at bottom
    if (typeof term.onRender === "function") {
        term.onRender(() => {
            scrollCtl.maybeScroll();
        });
    } else {
        // Fallback: if onRender is not available, still keep scroll sane after writes
        const origWrite = term.write.bind(term);
        term.write = (data, cb) => {
            origWrite(data, cb);
            raf2(() => scrollCtl.maybeScroll());
        };

        const origWriteln = term.writeln.bind(term);
        term.writeln = (data, cb) => {
            origWriteln(data, cb);
            raf2(() => scrollCtl.maybeScroll());
        };
    }

    // Fit on real viewport resizes only, no ResizeObserver to avoid loops
    const detachResizeHandlers = attachSafeResizeFitting(scheduleFit);

    // Drag wiring
    makeTermDragWPrnt(windowWrapper, fitNowRef);
    makeIconDraggable();

    // Restore window state (floating or docked)
    if (localStorage.getItem("terminal-floating") === "true") {
        windowWrapper.classList.add("floating");
        applyFloatingStyles(windowWrapper);
    } else {
        applyDockedStyles(windowWrapper);
    }

    // Restore closed state
    if (localStorage.getItem("terminal-closed") === "true") {
        windowWrapper.style.display = "none";
        icon.style.display = "inline-block";
    } else {
        icon.style.display = "none";
    }

    // Restore minimised state
    if (localStorage.getItem("terminal-minimised") === "true") {
        terminalWrapper.style.display = "none";
        floatBtn.classList.add("hidden");
    } else {
        terminalWrapper.style.display = "block";
        floatBtn.classList.remove("hidden");
    }

    // Initial fit (only if visible)
    scheduleFit();

    /* ============================
        Button behaviours
    ============================ */

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

        // Minimising forces docked mode, same as your old script
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

    // Icon double-click opens terminal window
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

    // Persist size when user finishes resizing (native resize handle) or after mouse interactions
    const onMouseUp = () => {
        if (!windowWrapper.classList.contains("floating")) return;
        saveWindowSize(windowWrapper);
        scheduleFit();
    };
    document.addEventListener("mouseup", onMouseUp);

    return {
        term,
        fitAddon,
        sendSeq: (seq) => {
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(seq);
        },
        setWebUiTheme,
        dispose: () => {
            detachResizeHandlers();
            document.removeEventListener("mouseup", onMouseUp);
            term.dispose();
        }
    };

}