declare global {
    interface Window {
        __DEBUG_PANEL__?: DebugPanel;
    }
}

export { };

type DebugType = "log" | "error" | "warn" | "info";

type DebugEmojiMap = Readonly<Record<DebugType, string>>;

type DebugPanel = Readonly<{
    /**
     * @param {unknown} msg - Optional message or object to display.
     * @returns {void} This method displays the debug panel and optionally sets its content to the provided message. The message can be of any type, and if it's an object, it will be stringified for display. The panel is made visible by adding a CSS class, and the content is updated accordingly.
     */
    show: (msg?: unknown) => void;
    hide: () => void;
    clear: () => void;
    el: HTMLDivElement;
}>;

type ConsoleMethod = (...args: unknown[]) => void;

type ConsoleOrig = Readonly<{
    log: ConsoleMethod;
    error: ConsoleMethod;
    warn: ConsoleMethod;
    info: ConsoleMethod;
    clear: () => void;
}>;

function isErrorLike(value: unknown): value is Error {
    return value instanceof Error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} value - Any value to serialise for display.
 * @returns {string} A string representation of the input value, suitable for display in the debug panel. The function handles various types of input, including primitives, objects, and errors. For objects, it attempts to stringify them as JSON with indentation for readability. If the value is an error or cannot be stringified, it falls back to using the default string conversion. This ensures that all types of values can be represented as a string without causing issues in the debug panel.
 */
function safeStringify(value: unknown): string {
    if (isErrorLike(value)) return value.stack || value.toString();
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return String(value);
    if (typeof value === "bigint") return String(value);
    if (typeof value === "symbol") return String(value);
    if (typeof value === "function") return String(value);
    if (value === null) return "null";
    if (typeof value === "undefined") return "undefined";

    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function setupDebugPanel(): DebugPanel {
    if (window.__DEBUG_PANEL__) return window.__DEBUG_PANEL__!;

    const debugDiv = document.createElement("div");
    debugDiv.className = "debug";
    debugDiv.style.fontFamily = "monospace, monospace";

    const isDebugEnabled = (): boolean =>
        new URLSearchParams(window.location.search).get("debug") === "true";

    function injectDiv(): void {
        document.body.appendChild(debugDiv);
        debugDiv.classList.remove("visible");
        if (isDebugEnabled()) {
            debugDiv.classList.add("visible");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectDiv);
    } else {
        injectDiv();
    }

    const EMOJI: DebugEmojiMap = {
        log: "📝",
        error: "❌",
        warn: "⚠️",
        info: "ℹ️"
    };

    /**
     * @param {string} msg - Formatted message text.
     * @param {DebugType} type - Console method type.
     * @returns {string} A formatted string that includes an emoji corresponding to the debug type, a timestamp of when the message was logged, and the message itself. The format is designed to enhance readability in the debug panel by providing visual cues (emojis) and temporal context (timestamps) for each log entry. The function ensures that the debug output is both informative and visually distinct based on the type of message being logged.
     */
    function format(msg: string, type: DebugType = "log"): string {
        const time = new Date().toLocaleTimeString();
        return `${EMOJI[type] || EMOJI.log} [${time}] ${msg}`;
    }

    const orig: ConsoleOrig = {
        log: console.log.bind(console) as ConsoleMethod,
        error: console.error.bind(console) as ConsoleMethod,
        warn: console.warn.bind(console) as ConsoleMethod,
        info: console.info.bind(console) as ConsoleMethod,
        clear: console.clear.bind(console),
    };

    // Proxy console methods
    (["log", "error", "warn", "info"] as const).forEach((type) => {
        console[type] = (...args: unknown[]): void => {
            orig[type](...args);

            const msg = args.map((a) => {
                if (typeof a === "object" && a !== null) {
                    return isErrorLike(a) ? (a.stack || a.toString()) : safeStringify(a);
                }
                return String(a);
            }).join(" ");

            if (isDebugEnabled()) {
                debugDiv.classList.add("visible");
                debugDiv.textContent += (debugDiv.textContent ? "\n" : "") + format(msg, type);
                debugDiv.scrollTop = debugDiv.scrollHeight;
            }
        };
    });

    // Proxy clear
    console.clear = (): void => {
        orig.clear();
        debugDiv.textContent = "";
    };

    // Catch global errors and rejections!
    window.addEventListener("error", (event: ErrorEvent) => {
        const err = event.error as unknown;
        const message =
            err
                ? (isErrorLike(err) ? (err.stack || err.toString()) : safeStringify(err))
                : event.message;

        console.error("Uncaught Error:", message);
    });

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
        console.error("Unhandled Promise Rejection:", (event as unknown as { reason?: unknown }).reason);
    });

    const panel: DebugPanel = {
        /**
         * @param {unknown} msg - Optional message or object to display.
         * @returns {void} This method displays the debug panel and optionally sets its content to the provided message. The message can be of any type, and if it's an object, it will be stringified for display. The panel is made visible by adding a CSS class, and the content is updated accordingly.
         */
        show: (msg: unknown = ""): void => {
            debugDiv.classList.add("visible");
            debugDiv.textContent = typeof msg === "object" ? safeStringify(msg) : String(msg);
        },
        hide: (): void => {
            debugDiv.classList.remove("visible");
            debugDiv.textContent = "";
        },
        clear: (): void => {
            debugDiv.textContent = "";
        },
        el: debugDiv
    };

    window.__DEBUG_PANEL__ = panel;
    return panel;
}

function propagateDebugParamInLinks(): void {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("debug") !== "true") return;

    document.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
        const href = link.getAttribute("href");
        if (
            !href ||
            href.startsWith("http") ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.includes("debug=true")
        ) return;

        const [base, suffix] = href.split(/([?#].*)/);
        const joiner = suffix && suffix.startsWith("?") ? "&" : "?";
        link.setAttribute("href", base + joiner + "debug=true" + (suffix || ""));
    });
}

setupDebugPanel();
propagateDebugParamInLinks();