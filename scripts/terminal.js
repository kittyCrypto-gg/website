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

function injectTerminalStyles() {
    if (document.getElementById("terminal-inline-styles")) return;

    const style = document.createElement("style");
    style.id = "terminal-inline-styles";
    style.textContent = `
        html, body {
        margin: 0;
            padding: 0;
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            background: black;
        }

        #term {
            width: 100vw;
            height: 100vh;
        }
    `;
    document.head.appendChild(style);
}

async function ensureXtermLoaded() {
    // If your page already includes xterm.js, this will be a no-op.
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

function applyFloatingStyles(windowWrapper) {
    Object.assign(windowWrapper.style, {
        position: "absolute",
        zIndex: "9999",
        width: localStorage.getItem("terminal-width") || "50%",
        height: localStorage.getItem("terminal-height") || "",
        resize: "both",
        overflow: "auto",
        left: localStorage.getItem("terminal-x") || "10px",
        top: localStorage.getItem("terminal-y") || "10px"
    });
}

function applyDockedStyles(windowWrapper) {
    Object.assign(windowWrapper.style, {
        position: "relative",
        zIndex: "",
        width: "100%",
        height: "",
        resize: "",
        overflow: "",
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

function makeTermDragWPrnt(el, fitNow) {
    const header = el.querySelector("#terminal-header");
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;

    header.addEventListener("mousedown", (e) => {
        if (!el.classList.contains("floating")) return;

        isDragging = true;
        startX = e.clientX - el.offsetLeft;
        startY = e.clientY - el.offsetTop;
        el.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        const x = e.clientX - startX;
        const y = e.clientY - startY;

        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.transform = "none";

        localStorage.setItem("terminal-x", el.style.left);
        localStorage.setItem("terminal-y", el.style.top);

        localStorage.setItem("term-icon-x", el.style.left);
        localStorage.setItem("term-icon-y", el.style.top);
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;

        isDragging = false;
        el.style.cursor = "default";
        saveWindowSize(el);

        if (typeof fitNow === "function") raf2(fitNow);
    });
}

function attachResizeFitting(windowWrapper, fitNow) {
    if (!windowWrapper) return () => { };

    const ro = new ResizeObserver(() => {
        if (typeof fitNow !== "function") return;
        raf2(fitNow);
    });

    ro.observe(windowWrapper);

    const onWinResize = () => {
        if (typeof fitNow !== "function") return;
        raf2(fitNow);
    };

    window.addEventListener("resize", onWinResize);

    return () => {
        ro.disconnect();
        window.removeEventListener("resize", onWinResize);
    };
}

function wireBasicInput(term) {
    // Minimal local echo so the terminal looks alive without any backend.
    let line = "";

    const prompt = () => {
        term.write("\r\nkitty@kittycrypto:~$ ");
    };

    term.writeln("YuriGreen Terminal Emulator");
    term.writeln("Type commands locally (no backend attached).");
    term.write("kitty@kittycrypto:~$ ");

    term.onData((data) => {
        const code = data.charCodeAt(0);

        // Enter
        if (data === "\r") {
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

export async function setupTerminalWindow() {
    injectTerminalStyles();
    await ensureXtermLoaded();

    const terminalWrapper = safeGetEl("terminal-wrapper");
    const shellWrapper = safeGetEl("shell-wrapper");
    const icon = safeGetEl("term-icon");

    if (!terminalWrapper) throw new Error("Missing element: #terminal-wrapper");
    if (!shellWrapper) throw new Error("Missing element: #shell-wrapper");
    if (!icon) throw new Error("Missing element: #term-icon");

    // Build the "window" shell
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
    title.textContent = "YuriGreen Terminal Emulator — /home/kitty/";

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

    // Insert window into banner wrapper
    shellWrapper.insertBefore(windowWrapper, shellWrapper.firstChild);

    // Icon setup
    icon.src = "/images/terminal.svg";
    icon.alt = "Terminal icon";
    icon.title = "Double-click to open terminal";

    // Create terminal
    const term = new window.Terminal({
        cursorBlink: true,
        convertEol: true
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    const fitNow = () => {
        // Fit can throw if element is display:none, so guard by size.
        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        fitAddon.fit();
    };

    raf2(fitNow);
    wireBasicInput(term);

    // Keep xterm fitting correct across float/resize
    const detachResizeHandlers = attachResizeFitting(windowWrapper, fitNow);

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
            raf2(fitNow);
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
            makeTermDragWPrnt(windowWrapper, fitNow);
            localStorage.setItem("terminal-floating", "true");
            raf2(fitNow);
            return;
        }

        applyDockedStyles(windowWrapper);
        localStorage.removeItem("terminal-floating");
        raf2(fitNow);
    });

    // Restore floating/docked state
    if (localStorage.getItem("terminal-floating") === "true") {
        windowWrapper.classList.add("floating");
        applyFloatingStyles(windowWrapper);
        makeTermDragWPrnt(windowWrapper, fitNow);
    } else {
        applyDockedStyles(windowWrapper);
    }

    // Restore icon position and enable drag
    makeIconDraggable();

    // Restore closed state
    if (localStorage.getItem("terminal-closed") === "true") {
        windowWrapper.style.display = "none";
        icon.style.display = "inline-block";
    }

    // Restore minimised state
    if (localStorage.getItem("terminal-minimised") === "true") {
        terminalWrapper.style.display = "none";
        floatBtn.classList.add("hidden");
    } else {
        floatBtn.classList.remove("hidden");
        raf2(fitNow);
    }

    // Icon double-click opens terminal window
    icon.addEventListener("dblclick", () => {
        windowWrapper.style.display = "block";
        terminalWrapper.style.display = "block";
        icon.style.display = "none";

        localStorage.removeItem("terminal-closed");
        localStorage.removeItem("terminal-minimised");

        if (localStorage.getItem("terminal-floating") === "true") {
            windowWrapper.classList.add("floating");
            applyFloatingStyles(windowWrapper);
            setTimeout(() => makeTermDragWPrnt(windowWrapper, fitNow));
        }

        raf2(fitNow);
    });

    // Persist size when user finishes resizing (browser-native resize handle)
    const onMouseUp = () => {
        if (!windowWrapper.classList.contains("floating")) return;
        saveWindowSize(windowWrapper);
        raf2(fitNow);
    };

    document.addEventListener("mouseup", onMouseUp);

    // Return a tiny handle in case you want to dispose later
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