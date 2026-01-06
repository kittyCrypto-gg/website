let term = null;

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
    return !!md.mobile();
}

function cssVar(name) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
}

function buildXtermTheme() {
    return {
        foreground: cssVar("--banner-green"),
        background: cssVar("--term-bg"),
        cursor: cssVar("--banner-green")
    };
}

const themeObserver = new MutationObserver(() => {
    if (!term) return;
    term.setOption("theme", buildXtermTheme());
});

themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
});

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

function attachScrollTracking(termInstance, followState) {
    const ctl = {
        _viewport: null,
        _programmatic: false,

        _resolveViewport() {
            if (!termInstance.element) return null;
            const vp = termInstance.element.querySelector(".xterm-viewport");
            if (vp) this._viewport = vp;
            return this._viewport;
        },

        _atBottom(vp) {
            return vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2;
        },

        scrollToBottom() {
            this._programmatic = true;
            termInstance.scrollToBottom();
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

    if (!ctl.wire()) {
        raf2(() => {
            ctl.wire();
        });
    }

    return ctl;
}

function wireBasicInput(termInstance, followState, scrollCtl) {
    let line = "";

    const prompt = () => {
        termInstance.write("\r\nkitty@kittycrypto:~$ ");
        scrollCtl.maybeScroll();
    };

    termInstance.writeln("YuriGreen Terminal Emulator");
    termInstance.writeln("Type commands locally (no backend attached).");
    termInstance.write("kitty@kittycrypto:~$ ");
    scrollCtl.maybeScroll();

    termInstance.onData((data) => {
        const code = data.charCodeAt(0);

        if (data === "\r") {
            scrollCtl.forceFollowAndScroll();

            termInstance.writeln("");
            if (line.trim().length > 0) termInstance.writeln(`command not found: ${line.trim()}`);
            line = "";
            prompt();
            return;
        }

        if (code === 127) {
            if (line.length === 0) return;
            line = line.slice(0, -1);
            termInstance.write("\b \b");
            return;
        }

        if (data === "\u0003") {
            termInstance.write("^C");
            line = "";
            prompt();
            return;
        }

        if (code >= 32) {
            line += data;
            termInstance.write(data);
        }
    });
}

function attachWebSocketTransport(termInstance, scrollCtl) {
    const wsUrl = `wss://bash.kittycrypto.gg`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    ws.addEventListener("open", () => {
        scrollCtl.forceFollowAndScroll();

        setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send("nekofetch\r");
            }
        }, 50);
    });

    ws.addEventListener("message", (ev) => {
        if (typeof ev.data === "string") {
            termInstance.write(ev.data);
        } else {
            const text = new TextDecoder().decode(ev.data);
            termInstance.write(text);
        }
        scrollCtl.maybeScroll();
    });

    ws.addEventListener("close", () => {
        termInstance.writeln("\r\n[disconnected]");
        scrollCtl.forceFollowAndScroll();
    });

    ws.addEventListener("error", () => {
        termInstance.writeln("\r\n[connection error]");
        scrollCtl.forceFollowAndScroll();
    });

    termInstance.onData(data => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    return ws;
}

export async function setupTerminalModule() {
    await ensureXtermLoaded();

    const terminalWrapper = safeGetEl("terminal-wrapper");
    const shellWrapper = firstExistingEl(["shell-wrapper", "banner-wrapper"]);
    const icon = safeGetEl("term-icon");

    if (!terminalWrapper) throw new Error("Missing element: #terminal-wrapper");
    if (!shellWrapper) throw new Error("Missing element: #shell-wrapper or #banner-wrapper");
    if (!icon) throw new Error("Missing element: #term-icon");

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

    term = new window.Terminal({
        cursorBlink: true,
        convertEol: true,
        fontSize: isMobile ? 8 : 14,
        theme: buildXtermTheme()
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    const followState = { value: true };
    const scrollCtl = attachScrollTracking(term, followState);

    // Wire backend transport early so fitNow can safely reference it
    //wireBasicInput(term, followState, scrollCtl);
    const ws = attachWebSocketTransport(term, scrollCtl);

    // Forward xterm resize events to backend PTY
    term.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "resize", cols, rows }));
        }
    });

    // Fit scheduling (prevents spam fits from multiple events)
    let fitScheduled = false;

    const fitNow = () => {
        if (windowWrapper.style.display === "none") return;
        if (terminalWrapper.style.display === "none") return;

        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        fitAddon.fit();

        // After fitting, push the authoritative cols/rows to the backend PTY
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "resize",
                cols: term.cols,
                rows: term.rows
            }));
        }

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

    const fitNowRef = { fitNow };

    if (typeof term.onRender === "function") {
        term.onRender(() => {
            scrollCtl.maybeScroll();
        });
    } else {
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

    const detachResizeHandlers = attachSafeResizeFitting(scheduleFit);

    makeTermDragWPrnt(windowWrapper, fitNowRef);
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

    // Initial fit (and PTY resize) once visible
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

    const onMouseUp = () => {
        if (!windowWrapper.classList.contains("floating")) return;
        saveWindowSize(windowWrapper);
        scheduleFit();
    };
    document.addEventListener("mouseup", onMouseUp);

    return {
        term,
        fitAddon,
        dispose: () => {
            detachResizeHandlers();
            document.removeEventListener("mouseup", onMouseUp);
            term.dispose();
        }
    };
}