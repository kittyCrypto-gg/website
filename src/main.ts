import * as config from "./config.ts";
import { removeExistingById, recreateSingleton } from "./domSingletons.ts";
import { setupTerminalModule } from "./terminal.ts";
import { setupReaderToggle } from "./readerMode.ts";
import * as readAloud from "./readAloud.ts";
import { keyboardEmu } from "./keyboard.ts";
import * as loader from "./loader.ts";
import { loadBanner, scaleBannerToFit, setupTerminalWindow } from "./banner.ts";

type TerminalModule = Readonly<{
    term: Readonly<{
        element: HTMLElement | null;
    }>;
    sendSeq: (seq: string) => void;
    dispose: () => void;
    setWebUiTheme?: (theme: "dark" | "light") => void;
}>;

type KeyboardEmuInstance = Readonly<{
    destroy: () => void;
}>;

type KeyboardEmuCtor = new (
    isMobile: boolean,
    htmlUrl: string,
    cssUrl: string
) => Readonly<{
    install: (
        transport: Readonly<{ send: (payload: Readonly<{ seq: string }>) => void }>,
        inputEl: HTMLTextAreaElement
    ) => Promise<KeyboardEmuInstance>;
}>;

type MainJson = Readonly<{
    headScripts?: readonly string[];
    headerInjections?: readonly string[];
    mainMenu: Record<string, string>;
    header: string;
    footer: string;
    themeToggle: Readonly<{ dark: string; light: string; title?: string }>;
    readerModeToggle: Readonly<{ enable: string; disable: string; title?: string }>;
    readAloudToggle: Readonly<{ enable: string; disable: string; title?: string }>;
}>;

type CookieValue = string | null;

type ServerStatusOk = Readonly<{
    ok: true;
    online: true;
    now: string;
}>;

type ServerStatusResult =
    | Readonly<{ kind: "online"; now: string }>
    | Readonly<{ kind: "offline"; reason: string }>;


/**
 * 
 * @param res Response to read JSON from.
 * @returns json if possible
 */
function readJsonIfAny(res: Response): Promise<unknown> {
    return res.json().catch(() => null);
}

/**
 * 
 * @param v Value to check.
 * @returns whether v is a record (non-null object, not an array)
 */
function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @returns {Promise<ServerStatusResult>} Online/offline status result.
 */
async function fetchServerStatus(timeoutMs: number): Promise<ServerStatusResult> {
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), timeoutMs);

    try {
        const res = await fetch(config.statusEndpointUrl, {
            method: "GET",
            cache: "no-store",
            credentials: "omit",
            signal: ctl.signal,
            headers: { accept: "application/json" }
        });

        if (!res.ok) {
            return { kind: "offline", reason: `status endpoint returned ${res.status}` };
        }

        const bodyUnknown: unknown = await readJsonIfAny(res);

        const looksOk =
            isRecord(bodyUnknown) &&
            bodyUnknown.ok === true &&
            bodyUnknown.online === true &&
            typeof bodyUnknown.now === "string" &&
            bodyUnknown.now.length > 0;

        if (!looksOk) {
            return { kind: "offline", reason: "status endpoint returned unexpected payload" };
        }

        const body = bodyUnknown as ServerStatusOk;
        return { kind: "online", now: body.now };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "unknown error";
        return { kind: "offline", reason: msg };
    } finally {
        window.clearTimeout(t);
    }
}

const params = new URLSearchParams(window.location.search);

let terminalMod: TerminalModule | null = null;
let pendingWebUiTheme: "dark" | "light" | null = null;

/**
 * @param {Document} doc - Document to operate on.
 * @param {string} id - Anchor element id.
 * @returns {HTMLMetaElement} The anchor meta element.
 */
function ensureHeadAnchor(doc: Document, id: string): HTMLMetaElement {
    const existing = doc.getElementById(id);
    if (existing && existing instanceof HTMLMetaElement) return existing;

    if (existing) existing.remove();

    const meta = doc.createElement("meta");
    meta.id = id;
    meta.name = id;
    meta.content = "";
    doc.head.appendChild(meta);
    return meta;
}

/**
 * @param {Node} start - Start anchor node (exclusive).
 * @param {Node} end - End anchor node (exclusive).
 * @returns {void} Nothing.
 */
function clearNodesBetween(start: Node, end: Node): void {
    let n = start.nextSibling;
    while (n && n !== end) {
        const next = n.nextSibling;
        n.parentNode?.removeChild(n);
        n = next;
    }
}

/**
 * @param {Document} doc - Document used to create replacement nodes.
 * @param {Node} node - Parsed node to clone.
 * @returns {Node} A cloned node where script elements are recreated so they execute when inserted.
 */
function cloneHeadInjectionNode(doc: Document, node: Node): Node {
    if (node.nodeType === Node.TEXT_NODE) {
        return doc.createTextNode(node.textContent ?? "");
    }

    if (node.nodeType === Node.COMMENT_NODE) {
        return doc.createComment(node.textContent ?? "");
    }

    if (node instanceof HTMLScriptElement) {
        const script = doc.createElement("script");

        for (const attr of Array.from(node.attributes)) {
            script.setAttribute(attr.name, attr.value);
        }

        script.textContent = node.textContent ?? "";
        return script;
    }

    if (node instanceof HTMLElement) {
        const el = doc.createElement(node.tagName.toLowerCase());

        for (const attr of Array.from(node.attributes)) {
            el.setAttribute(attr.name, attr.value);
        }

        for (const child of Array.from(node.childNodes)) {
            el.appendChild(cloneHeadInjectionNode(doc, child));
        }

        return el;
    }

    return node.cloneNode(true);
}

/**
 * @param {Document} doc - Document to operate on.
 * @param {readonly string[]} injections - HTML snippets to inject into <head>.
 * @returns {void} Nothing.
 */
function applyHeaderInjections(doc: Document, injections: readonly string[]): void {
    const start = ensureHeadAnchor(doc, "kc-header-injections_start");
    const end = ensureHeadAnchor(doc, "kc-header-injections_end");

    if (start.parentNode !== doc.head) doc.head.appendChild(start);
    if (end.parentNode !== doc.head) doc.head.appendChild(end);

    // Ensure correct order (start before end)
    if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
        doc.head.appendChild(end);
    }

    clearNodesBetween(start, end);

    const frag = doc.createDocumentFragment();

    for (const raw of injections) {
        const html = String(raw ?? "").trim();
        if (!html) continue;

        const tpl = doc.createElement("template");
        tpl.innerHTML = html;

        for (const node of Array.from(tpl.content.childNodes)) {
            frag.appendChild(cloneHeadInjectionNode(doc, node));
        }

        frag.appendChild(doc.createTextNode("\n"));
    }

    doc.head.insertBefore(frag, end);
}

/**
 * @param {unknown} v - Value to convert.
 * @returns {string} Sanitised string suitable for an id fragment.
 */
function toSafeIdPart(v: unknown): string {
    return String(v || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * @param {string} prefix - Prefix for id.
 * @param {unknown} value - Value to incorporate.
 * @returns {string} Stable id.
 */
function makeStableId(prefix: string, value: unknown): string {
    const part = toSafeIdPart(value);
    return part ? `${prefix}${part}` : `${prefix}x`;
}

/**
 * @returns {Promise<boolean>} True if considered mobile.
 */
async function checkMobile(): Promise<boolean> {
    const MOBILE_DETECT_CDN =
        "https://kittycrypto.gg/external?src=https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.js";

    if (!("MobileDetect" in window)
        || typeof (window as unknown as { MobileDetect?: unknown }).MobileDetect === "undefined"
    ) {
        await loader.loadScript(MOBILE_DETECT_CDN, { asModule: false });
    }

    const ua = navigator.userAgent;

    const MD = (window as unknown as { MobileDetect: new (ua: string) => { mobile: () => string | null } })
        .MobileDetect;
    const md = new MD(ua);

    const mdHit = !!md.mobile();
    const touch = navigator.maxTouchPoints > 0;

    const desktop = /\b(Windows NT|Macintosh|X11|Linux x86_64)\b/.test(ua) && !touch;

    return mdHit || !desktop;
}

/**
 * @param {boolean} isMobile - Whether the current device is mobile.
 * @returns {void} Nothing.
 */
function applyMobileTextScale(isMobile: boolean): void {
    const root = document.documentElement;

    // Single dial for CSS to consume
    root.style.setProperty("--kc-text-scale", isMobile ? "0.65" : "1");

    // Optional hook if you also want a class for other mobile-only tweaks
    root.classList.toggle("kc-mobile", isMobile);
}

document.addEventListener("DOMContentLoaded", () => {
    document.body.style.visibility = "visible";
    document.body.style.opacity = "1";

    /**
     * @returns {Promise<void>} Resolves after terminal initialisation.
     */
    const init = async (): Promise<void> => {
        const isMobile =
            params.get("isMobile") !== null ? params.get("isMobile") === "true" : await checkMobile();

        applyMobileTextScale(isMobile);

        const status = await fetchServerStatus(2000);
        if (status.kind === "offline") {
            document.getElementById("terminal-loading")?.style.setProperty("display", "none");

            await loadBanner({ serverOffline: true });
            await scaleBannerToFit();
            await setupTerminalWindow();
            return;
        }

        const terminal = await setupTerminalModule()
            .then((mod) => {
                document.getElementById("terminal-loading")?.style.setProperty("display", "none");
                return mod as TerminalModule;
            })
            .catch((err: unknown) => {
                console.error("Terminal initialisation failed:", err);
                throw err;
            });

        await new Promise<void>((r) => requestAnimationFrame(() => r()));

        const xtermTextarea =
            terminal.term.element?.querySelector<HTMLTextAreaElement>("textarea.xterm-helper-textarea") ||
            terminal.term.element?.querySelector<HTMLTextAreaElement>("textarea") ||
            null;

        const KeyboardEmu = keyboardEmu as unknown as KeyboardEmuCtor;

        const keyboard: KeyboardEmuInstance | null =
            isMobile && xtermTextarea
                ? await new KeyboardEmu(isMobile, "../keyboard.html", "../styles/modules/keyboard.css").install(
                    { send: ({ seq }) => terminal.sendSeq(seq) },
                    xtermTextarea
                )
                : null;

        const dispose = terminal.dispose;
        (terminal as { dispose: () => void }).dispose = () => {
            if (keyboard) keyboard.destroy();
            dispose();
        };

        terminalMod = terminal;

        if (pendingWebUiTheme && typeof terminalMod.setWebUiTheme === "function") {
            terminalMod.setWebUiTheme(pendingWebUiTheme);
            pendingWebUiTheme = null;
        }
    };

    void init();
});

let currentTheme: "dark" | "light" | null = null;

/**
 * @param {string} name - Cookie name.
 * @returns {CookieValue} Cookie value or null.
 */
const getCookie = (name: string): CookieValue => {
    const cookies = document.cookie.split("; ");
    const cookie = cookies.find((row) => row.startsWith(`${name}=`));
    return cookie ? cookie.split("=")[1] ?? null : null;
};

/**
 * @param {string} name - Cookie name.
 * @param {string} value - Cookie value.
 * @param {number} days - Expiry in days.
 * @returns {void} Nothing.
 */
const setCookie = (name: string, value: string, days: number = 365): void => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

/**
 * @param {string} name - Cookie name.
 * @returns {void} Nothing.
 */
const deleteCookie = (name: string): void => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    void deleteCookie;
};

/**
 * @returns {void} Nothing.
 */
const repaint = (): void => {
    void document.body.offsetHeight;
};

/**
 * Normalises CSS `content:` strings into plain text.
 *
 * @param {string} raw - Raw computed `content` value.
 * @returns {string} Text suitable for clipboard.
 */
function normaliseCssContent(raw: string): string {
    // Computed `content` is usually quoted, or "none"/"normal" when nothing is rendered.
    if (!raw || raw === "none" || raw === "normal") return "";

    const quote = raw[0];
    const hasQuotes =
        (quote === `"` || quote === `'`) &&
        raw[raw.length - 1] === quote;

    const withoutOuterQuotes = hasQuotes ? raw.slice(1, -1) : raw;

    // Unescape CSS newlines and common escapes from computed `content`.
    return withoutOuterQuotes
        .replaceAll("\\A", "\n")
        .replaceAll("\\a", "\n")
        .replaceAll("\\00000A", "\n")
        .replaceAll("\\00000a", "\n")
        .replaceAll('\\"', '"')
        .replaceAll("\\'", "'")
        .replaceAll("\\\\", "\\");
}

/**
 * Reads the Kitty badge snippet text from the pre pseudo-element (and falls back to DOM text).
 *
 * @returns {string} The snippet text.
 */
function readBadgeSnippetText(): string {
    const preEl = document.querySelector(".kc-badge-snippet__code");
    if (!(preEl instanceof HTMLElement)) return "";

    const raw = window.getComputedStyle(preEl, "::before").content;
    const fromBefore = normaliseCssContent(raw).trim();
    if (fromBefore) return fromBefore;

    return (preEl.textContent ?? "").trim();
}

/**
 * Installs the copy button handler for the Kitty badge snippet.
 *
 * Expects:
 * - <pre class="kc-badge-snippet__code"> ... (snippet via ::before) </pre>
 * - <button class="kc-badge-snippet__copy" type="button">Copy</button>
 *
 * @returns {void} Nothing.
 */
function initBadgSnptCpy(): void {
    const buttonEl = document.querySelector(".kc-badge-snippet__copy");
    if (!(buttonEl instanceof HTMLButtonElement)) return;

    buttonEl.addEventListener("click", () => {
        const text = readBadgeSnippetText();
        void copyTxt(text);
    });
}

/**
 * @returns {Promise<void>} Resolves after UI initialisation.
 */
async function initialiseUI(): Promise<void> {
    try {
        const response = await fetch("../data/main.json");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as MainJson;

        if (data.headerInjections && data.headerInjections.length > 0) {
            applyHeaderInjections(document, data.headerInjections);
        }

        if (data.headScripts) {
            data.headScripts.forEach((scriptSrc) => {
                const scriptId = makeStableId("kc-head-script_", scriptSrc);

                removeExistingById(scriptId, document);

                const script = document.createElement("script");
                script.id = scriptId;
                script.src = scriptSrc;
                script.defer = true;
                document.head.appendChild(script);
            });
        }

        const menu = document.getElementById("main-menu");
        if (!menu) throw new Error("Element #main-menu not found!");

        for (const [text, link] of Object.entries(data.mainMenu)) {
            const linkId = makeStableId("kc-main-menu_", text);

            removeExistingById(linkId, document);

            const button = document.createElement("a");
            button.id = linkId;
            button.href = link;
            button.textContent = text;
            button.classList.add("menu-button");
            menu.appendChild(button);
        }

        const header = document.getElementById("main-header");
        if (!header) throw new Error("Element #main-header not found!");
        if (!header.textContent?.trim()) header.textContent = data.header;

        const footer = document.getElementById("main-footer");
        if (!footer) throw new Error("Element #main-footer not found!");
        const currentYear = new Date().getFullYear();
        footer.textContent = data.footer.replace("${year}", String(currentYear));

        const themeToggle = recreateSingleton("theme-toggle", () => document.createElement("button"), document);
        themeToggle.classList.add("theme-toggle-button");
        document.body.appendChild(themeToggle);

        /**
         * @param {"dark" | "light"} theme - Theme to apply.
         * @param {boolean} persist - Whether to persist to cookie.
         * @returns {void} Nothing.
         */
        const applyTheme = (theme: "dark" | "light", persist: boolean = false): void => {
            document.documentElement.classList.toggle("dark-mode", theme === "dark");
            document.documentElement.classList.toggle("light-mode", theme === "light");

            themeToggle.textContent = theme === "dark" ? data.themeToggle.dark : data.themeToggle.light;

            currentTheme = theme;

            if (persist) {
                setCookie("darkMode", theme === "dark" ? "true" : "false");
            }

            repaint();

            if (terminalMod && typeof terminalMod.setWebUiTheme === "function") {
                terminalMod.setWebUiTheme(theme);
            } else {
                pendingWebUiTheme = theme;
            }
        };

        const cookieDark = getCookie("darkMode");
        const osDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

        if (cookieDark !== null) {
            applyTheme(cookieDark === "true" ? "dark" : "light");
        } else {
            applyTheme(osDark ? "dark" : "light");
        }

        themeToggle.addEventListener("click", () => {
            applyTheme(currentTheme === "dark" ? "light" : "dark", true);
        });

        themeToggle.title = data.themeToggle.title || "Theme";

        if (window.matchMedia) {
            const mq = window.matchMedia("(prefers-color-scheme: dark)");
            mq.addEventListener("change", (e) => {
                const osTheme: "dark" | "light" = e.matches ? "dark" : "light";
                if (currentTheme !== osTheme) {
                    applyTheme(osTheme, false);
                }
            });
        }

        const isReaderRoute = window.location.pathname === "/reader" || window.location.pathname.startsWith("/reader/");

        if (!isReaderRoute) return;

        const readerToggle = recreateSingleton("reader-toggle", () => document.createElement("button"), document);
        readerToggle.classList.add("theme-toggle-button");
        readerToggle.style.bottom = "80px";
        readerToggle.textContent = data.readerModeToggle.enable;
        readerToggle.setAttribute("data-enable", data.readerModeToggle.enable);
        readerToggle.setAttribute("data-disable", data.readerModeToggle.disable);
        readerToggle.title = data.readerModeToggle.title || "Reader Mode";
        document.body.appendChild(readerToggle);

        await setupReaderToggle();

        const readAloudToggle = recreateSingleton("read-aloud-toggle", () => document.createElement("button"), document);
        readAloudToggle.classList.add("theme-toggle-button");
        readAloudToggle.style.bottom = "140px";
        readAloudToggle.textContent = data.readAloudToggle.enable;
        readAloudToggle.setAttribute("data-enable", data.readAloudToggle.enable);
        readAloudToggle.setAttribute("data-disable", data.readAloudToggle.disable);
        readAloudToggle.title = data.readAloudToggle.title || "Read Aloud";
        document.body.appendChild(readAloudToggle);

        readAloudToggle.addEventListener("click", readAloud.showMenu);

        if (params.has("darkmode")) {
            const raw = params.get("darkmode");
            const v = (raw ? raw : "").toLowerCase();
            if (v === "true") applyTheme("dark", true);
            if (v === "false") applyTheme("light", true);
        }
    } catch (error: unknown) {
        console.error("Error loading JSON or updating DOM:", error);
    }
}

/**
 * Copies a string to the clipboard.
 * Prefers the Clipboard API and falls back to `execCommand("copy")` when needed.
 *
 * @param {string} text The text to copy.
 * @returns {Promise<boolean>} True if copying likely succeeded, otherwise false.
 */
async function copyTxt(text: string): Promise<boolean> {
    if (!text) return false;

    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
        try {
            await clipboard.writeText(text);
            return true;
        } catch {
            // Fall through to the legacy method
        }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";

    document.body.appendChild(textarea);
    textarea.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);

    return ok;
}

document.addEventListener("DOMContentLoaded", () => {
    initBadgSnptCpy();
    void initialiseUI();
});