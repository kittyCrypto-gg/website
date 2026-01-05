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
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
    `;
    document.head.appendChild(style);
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

function applyFloatingStyles(windowWrapper) {
    Object.assign(windowWrapper.style, {
        position: "absolute",
        zIndex: "9999",
        width: localStorage.getItem("terminal-width") || "50%",
        height: localStorage.getItem("terminal-height") || "",
        resize: "both",
        overflow: "hidden",
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

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    icon.addEventListener("mousedown", e => {
        isDragging = true;
        offsetX = e.clientX - icon.offsetLeft;
        offsetY = e.clientY - icon.offsetTop;
        icon.style.cursor = "grabbing";
    });

    document.addEventListener("mousemove", e => {
        if (!isDragging) return;
        icon.style.left = `${e.clientX - offsetX}px`;
        icon.style.top = `${e.clientY - offsetY}px`;
        localStorage.setItem("term-icon-x", icon.style.left);
        localStorage.setItem("term-icon-y", icon.style.top);
    });

    document.addEventListener("mouseup", () => {
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

    header.addEventListener("mousedown", e => {
        if (!el.classList.contains("floating")) return;
        isDragging = true;
        startX = e.clientX - el.offsetLeft;
        startY = e.clientY - el.offsetTop;
        el.style.cursor = "grabbing";
        e.preventDefault();
    });

    document.addEventListener("mousemove", e => {
        if (!isDragging) return;
        el.style.left = `${e.clientX - startX}px`;
        el.style.top = `${e.clientY - startY}px`;
        localStorage.setItem("terminal-x", el.style.left);
        localStorage.setItem("terminal-y", el.style.top);
    });

    document.addEventListener("mouseup", () => {
        if (!isDragging) return;
        isDragging = false;
        el.style.cursor = "default";
        saveWindowSize(el);
        raf2(fitNow);
    });
}

function attachResizeFitting(windowWrapper, fitNow) {
    const ro = new ResizeObserver(() => raf2(fitNow));
    ro.observe(windowWrapper);

    const onWinResize = () => raf2(fitNow);
    window.addEventListener("resize", onWinResize);

    return () => {
        ro.disconnect();
        window.removeEventListener("resize", onWinResize);
    };
}

/* ============================
   Auto-follow scroll handling
============================ */

function attachScrollTracking(term, followState) {
    const viewport = term.element.querySelector(".xterm-viewport");
    if (!viewport) return null;

    let programmatic = false;

    viewport.addEventListener("scroll", () => {
        if (programmatic) return;

        const atBottom =
            viewport.scrollTop + viewport.clientHeight >=
            viewport.scrollHeight - 2;

        followState.value = atBottom;
    });

    return {
        scrollToBottom() {
            programmatic = true;
            term.scrollToBottom();
            requestAnimationFrame(() => {
                programmatic = false;
            });
        }
    };
}

function wireBasicInput(term, followState, scrollCtl) {
    let line = "";

    const prompt = () => {
        term.write("\r\nkitty@kittycrypto:~$ ");
    };

    term.writeln("YuriGreen Terminal Emulator");
    term.writeln("Type commands locally (no backend attached).");
    term.write("kitty@kittycrypto:~$ ");

    term.onData(data => {
        const code = data.charCodeAt(0);

        if (data === "\r") {
            followState.value = true;
            scrollCtl.scrollToBottom();

            term.writeln("");
            if (line.trim()) term.writeln(`command not found: ${line.trim()}`);
            line = "";
            prompt();
            return;
        }

        if (code === 127) {
            if (!line.length) return;
            line = line.slice(0, -1);
            term.write("\b \b");
            return;
        }

        if (data === "\u0003") {
            term.write("^C");
            line = "";
            prompt();
            return;
        }

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

    if (!terminalWrapper || !shellWrapper || !icon) {
        throw new Error("Missing required terminal elements");
    }

    const windowWrapper = document.createElement("div");
    windowWrapper.id = "terminal-window";

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

    controls.append(closeBtn, toggleViewBtn, floatBtn);
    header.append(controls, title);

    const scrollArea = document.createElement("div");
    scrollArea.id = "terminal-scroll";
    scrollArea.style.overflow = "hidden";

    terminalWrapper.innerHTML = "";
    const termDiv = document.createElement("div");
    termDiv.id = "term";
    terminalWrapper.appendChild(termDiv);

    scrollArea.appendChild(terminalWrapper);
    windowWrapper.append(header, scrollArea);
    shellWrapper.insertBefore(windowWrapper, shellWrapper.firstChild);

    const term = new window.Terminal({ cursorBlink: true, convertEol: true });
    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    const followState = { value: true };
    const scrollCtl = attachScrollTracking(term, followState);

    const fitNow = () => {
        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        fitAddon.fit();
        if (followState.value) scrollCtl.scrollToBottom();
    };

    raf2(fitNow);
    wireBasicInput(term, followState, scrollCtl);

    term.onRender(() => {
        if (followState.value) scrollCtl.scrollToBottom();
    });

    const detachResizeHandlers = attachResizeFitting(windowWrapper, fitNow);

    makeIconDraggable();

    document.addEventListener("mouseup", () => {
        if (windowWrapper.classList.contains("floating")) {
            saveWindowSize(windowWrapper);
            raf2(fitNow);
        }
    });

    return {
        term,
        fitAddon,
        dispose() {
            detachResizeHandlers();
            term.dispose();
        }
    };
}  