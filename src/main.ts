import * as config from "./config.ts";
import { removeExistingById, recreateSingleton } from "./domSingletons.ts";
import * as Terminal from "./terminal.ts";
import { setupReaderToggle } from "./readerMode.ts";
import * as readAloud from "./readAloud.tsx";
import { keyboardEmu } from "./keyboard.ts";
import * as loader from "./loader.ts";
import { createMenu } from "./menu.tsx";
import { createHeader } from "./header.ts";
import { createFooter } from "./footer.ts";
import { fetchUiData } from "./uiFetch.ts";
import { readerModeFocus, readerModeKeep } from "./reader.tsx";
import { initEffectsControls } from "./effects.tsx";
import * as crtNoise from "./crtUi.tsx";
import * as helpers from "./helpers.ts";
import { installMenuToggle } from "./menues.tsx";
import { initNtcs } from "./notices.tsx";
import { initNoticeBoard } from "./noticeBoard.tsx";
import { bindToggleVisuals, showToggleVisual } from "./toggleIcons.ts";

type TermMod = Readonly<{
    term: Readonly<{
        element: HTMLElement | null;
    }>;
    sendSeq: (seq: string) => void;
    dispose: () => void;
    setWebUiTheme?: (theme: "dark" | "light") => void;
}>;

type KbInst = Readonly<{
    destroy: () => void;
}>;

type KbCtor = new (
    isMobile: boolean,
    htmlUrl?: string,
    cssUrl?: string
) => Readonly<{
    install: (
        transport: Readonly<{ send: (payload: Readonly<{ seq: string }>) => void }>,
        inputEl: HTMLTextAreaElement
    ) => Promise<KbInst>;
}>;

type Cookie = string | null;

type StatusOk = Readonly<{
    ok: true;
    online: true;
    now: string;
}>;

type StatusRes =
    | Readonly<{ kind: "online"; now: string }>
    | Readonly<{ kind: "offline"; reason: string }>;

const FLOAT_BTN_SELS = [
    "#theme-toggle",
    "#effects-toggle",
    "#crt-ui-toggle",
    "#reader-toggle",
    "#read-aloud-toggle"
] as const;

let floatBtnsRo: ResizeObserver | null = null;
let floatBtnsMo: MutationObserver | null = null;
let floatBtnsOn = false;
let floatBtnsQueued = false;

const params = new URLSearchParams(window.location.search);

let termMod: TermMod | null = null;
let nextTheme: "dark" | "light" | null = null;
let curTheme: "dark" | "light" | null = null;

const FLOAT_TOGGLE_ICON_SPEC = {
    size: 32,
    wrapperClass: "theme-toggle-button__icon",
    svgClass: "theme-toggle-button__svg"
} as const;

/**
 * Reads JSON if the response body has any, otherwise just gives null.
 * Handy little "dont explode pls" wrapper.
 * @param {Response} res
 * @returns {Promise<unknown>}
 */
function readJson(res: Response): Promise<unknown> {
    return res.json().catch(() => null);
}

/**
 * Pings the status endpoint and turns the result into a simpler shape.
 * Timeout is hard cut off so it does not hang around forever.
 * @param {number} timeoutMs
 * @returns {Promise<StatusRes>}
 */
async function fetchStatus(timeoutMs: number): Promise<StatusRes> {
    const ctl = new AbortController();
    const tid = window.setTimeout(() => ctl.abort(), timeoutMs);

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

        const bodyUnknown: unknown = await readJson(res);

        const looksOk =
            helpers.isRecord(bodyUnknown) &&
            bodyUnknown.ok === true &&
            bodyUnknown.online === true &&
            typeof bodyUnknown.now === "string" &&
            bodyUnknown.now.length > 0;

        if (!looksOk) {
            return { kind: "offline", reason: "status endpoint returned unexpected payload" };
        }

        const body = bodyUnknown as StatusOk;
        return { kind: "online", now: body.now };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "unknown error";
        return { kind: "offline", reason: msg };
    } finally {
        window.clearTimeout(tid);
    }
}

/**
 * Makes sure the meta anchor exists in <head>.
 * Used for the injected header bits so we can swap the middle chunk cleanly.
 * @param {Document} doc
 * @param {string} id
 * @returns {HTMLMetaElement}
 */
function needHeadAnchor(doc: Document, id: string): HTMLMetaElement {
    const ex = doc.getElementById(id);
    if (ex && ex instanceof HTMLMetaElement) return ex;

    if (ex) ex.remove();

    const meta = doc.createElement("meta");
    meta.id = id;
    meta.name = id;
    meta.content = "";
    doc.head.appendChild(meta);
    return meta;
}

/**
 * Clears every node between the two anchors.
 * Start and end themselves stay put.
 * @param {Node} start
 * @param {Node} end
 * @returns {void}
 */
function clearBetween(start: Node, end: Node): void {
    let n = start.nextSibling;

    while (n && n !== end) {
        const next = n.nextSibling;
        n.parentNode?.removeChild(n);
        n = next;
    }
}

/**
 * Clones a parsed head node back into the real document.
 * Script tags get recreated so the browser actually runs them.
 * @param {Document} doc
 * @param {Node} node
 * @returns {Node}
 */
function cloneHeadNode(doc: Document, node: Node): Node {
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
            el.appendChild(cloneHeadNode(doc, child));
        }

        return el;
    }

    return node.cloneNode(true);
}

/**
 * Injects header snippets into <head> between two anchors.
 * Old ones get wiped first so we do not keep piling them up.
 * @param {Document} doc
 * @param {readonly string[]} injections
 * @returns {void}
 */
function applyHeadBits(doc: Document, injections: readonly string[]): void {
    const start = needHeadAnchor(doc, "kc-header-injections_start");
    const end = needHeadAnchor(doc, "kc-header-injections_end");

    if (start.parentNode !== doc.head) doc.head.appendChild(start);
    if (end.parentNode !== doc.head) doc.head.appendChild(end);

    if (start.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_PRECEDING) {
        doc.head.appendChild(end);
    }

    clearBetween(start, end);

    const frag = doc.createDocumentFragment();

    for (const raw of injections) {
        const html = String(raw ?? "").trim();
        if (!html) continue;

        const tpl = doc.createElement("template");
        tpl.innerHTML = html;

        for (const node of Array.from(tpl.content.childNodes)) {
            frag.appendChild(cloneHeadNode(doc, node));
        }

        frag.appendChild(doc.createTextNode("\n"));
    }

    doc.head.insertBefore(frag, end);
}

/**
 * Loads MobileDetect if needed and makes a rough mobile guess.
 * not exactly science, but good enough for this.
 * @returns {Promise<boolean>}
 */
async function detectMobile(): Promise<boolean> {
    const MOBILE_DETECT_CDN =
        "https://kittycrow.dev/external?src=https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.js";

    if (
        !("MobileDetect" in window) ||
        typeof (window as unknown as { MobileDetect?: unknown }).MobileDetect === "undefined"
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
 * Pulls the explicit mobile override from the query string if present.
 * Otherwise falls back to the detector.
 * @returns {Promise<boolean>}
 */
async function getIsMobile(): Promise<boolean> {
    return params.get("isMobile") !== null
        ? params.get("isMobile") === "true"
        : await detectMobile();
}

/**
 * Applies the mobile text scale css vars and class.
 * @param {boolean} isMobile
 * @returns {void}
 */
function setMobileScale(isMobile: boolean): void {
    const root = document.documentElement;

    root.style.setProperty("--kc-text-scale", isMobile ? "0.65" : "1");
    root.classList.toggle("kc-mobile", isMobile);
}

/**
 * Parses a CSS pixel-ish value into a number.
 * falls back quietly if it gets nonsense.
 * @param {string} raw
 * @param {number} fallback
 * @returns {number}
 */
function px(raw: string, fallback: number = 0): number {
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Says whether a floating ui button should join the stack right now.
 * Hidden ones get ignored.
 * @param {HTMLButtonElement} button
 * @returns {boolean}
 */
function isFloatBtn(button: HTMLButtonElement): boolean {
    if (!button.isConnected) return false;
    if (button.hidden) return false;

    const computed = window.getComputedStyle(button);
    if (computed.display === "none") return false;
    if (computed.visibility === "hidden") return false;

    return true;
}

/**
 * Collects the floating ui buttons that are currently there and visible.
 * @returns {readonly HTMLButtonElement[]}
 */
function getFloatBtns(): readonly HTMLButtonElement[] {
    return FLOAT_BTN_SELS
        .map((selector) => document.querySelector(selector))
        .filter((node): node is HTMLButtonElement => node instanceof HTMLButtonElement)
        .filter((button) => isFloatBtn(button));
}

/**
 * Gets a usable height for an element.
 * Bounding rect first, then css height, then offsetHeight as the sad fallback.
 * @param {HTMLElement} el
 * @returns {number}
 */
function getH(el: HTMLElement): number {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) return rect.height;

    const computed = window.getComputedStyle(el);
    const cssHeight = px(computed.height, 0);
    if (cssHeight > 0) return cssHeight;

    return el.offsetHeight;
}

/**
 * Lines the floating buttons up on the right and stacks them vertically.
 * Keeps a 1rem gap between visible ones.
 * @returns {void}
 */
function stackFloatBtns(): void {
    const buttons = getFloatBtns();
    if (buttons.length === 0) return;

    const rootFontSize = px(
        window.getComputedStyle(document.documentElement).fontSize,
        16
    );
    const gapPx = rootFontSize;

    const items = buttons
        .map((button) => {
            const computed = window.getComputedStyle(button);

            return {
                button,
                bottom: px(computed.bottom, 0),
                right: computed.right,
                zIndex: px(computed.zIndex, 0),
                height: getH(button)
            };
        })
        .sort((a, b) => a.bottom - b.bottom);

    const sharedRight = items[0]?.right || "0px";
    const sharedZ = String(
        Math.max(...items.map((item) => item.zIndex))
    );

    let nextBottom = items[0]?.bottom || 0;

    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];

        if (i > 0) {
            const prev = items[i - 1];
            nextBottom += prev.height + gapPx;
        }

        item.button.style.right = sharedRight;
        item.button.style.bottom = `${nextBottom}px`;
        item.button.style.zIndex = sharedZ;
    }
}

/**
 * Queues one alignment pass for the next frame.
 * @returns {void}
 */
function queueFloatBtns(): void {
    if (floatBtnsQueued) return;
    floatBtnsQueued = true;

    requestAnimationFrame(() => {
        floatBtnsQueued = false;
        stackFloatBtns();
        watchFloatBtns();
    });
}

/**
 * Refreshes resize observation for the currently visible floating buttons.
 * @returns {void}
 */
function watchFloatBtns(): void {
    floatBtnsRo?.disconnect();

    if (typeof ResizeObserver === "undefined") return;

    const buttons = getFloatBtns();
    if (buttons.length === 0) return;

    floatBtnsRo = new ResizeObserver(() => {
        queueFloatBtns();
    });

    for (const button of buttons) {
        floatBtnsRo.observe(button);
    }
}

/**
 * Installs the listeners that keep the floating button pile tidy.
 * @returns {void}
 */
function ensureFloatBtns(): void {
    if (!floatBtnsOn) {
        floatBtnsOn = true;

        window.addEventListener("resize", () => {
            queueFloatBtns();
        });

        floatBtnsMo = new MutationObserver(() => {
            queueFloatBtns();
        });

        if (document.body) {
            floatBtnsMo.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ["style", "class", "hidden"]
            });
        }
    }

    queueFloatBtns();
}

/**
 * Boots the terminal side of the page.
 * Also wires the mobile keyboard if we ended up on mobile and found the textarea.
 * @returns {Promise<void>}
 */
async function bootTerm(): Promise<void> {
    const onMobile = await getIsMobile();

    setMobileScale(onMobile);

    const status = await fetchStatus(2000);

    const terminal = await Terminal.setupTerminalModule()
        .then((mod) => {
            document.getElementById("terminal-loading")?.style.setProperty("display", "none");
            return mod as TermMod;
        })
        .catch((err: unknown) => {
            console.error("Terminal initialisation failed:", err);
            throw err;
        });

    await helpers.nextFrame();

    const xtermTextarea =
        terminal.term.element?.querySelector<HTMLTextAreaElement>("textarea.xterm-helper-textarea") ||
        terminal.term.element?.querySelector<HTMLTextAreaElement>("textarea") ||
        null;

    const Kb = keyboardEmu as KbCtor;

    const keyboard: KbInst | null =
        onMobile && xtermTextarea
            ? await new Kb(onMobile).install(
                { send: ({ seq }) => terminal.sendSeq(seq) },
                xtermTextarea
            )
            : null;

    const dispose = terminal.dispose;
    (terminal as { dispose: () => void }).dispose = () => {
        if (keyboard) keyboard.destroy();
        dispose();
    };

    termMod = terminal;

    if (nextTheme && typeof termMod.setWebUiTheme === "function") {
        termMod.setWebUiTheme(nextTheme);
        nextTheme = null;
    }

    void status;
}

/**
 * Reads a cookie value.
 * @param {string} name
 * @returns {Cookie}
 */
const getCookie = (name: string): Cookie => {
    const cookies = document.cookie.split("; ");
    const cookie = cookies.find((row) => row.startsWith(`${name}=`));
    return cookie ? cookie.split("=")[1] ?? null : null;
};

/**
 * Writes a cookie with a day-based expiry.
 * @param {string} name
 * @param {string} value
 * @param {number} days
 * @returns {void}
 */
const setCookie = (name: string, value: string, days: number = 365): void => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/`;
};

/**
 * Deletes a cookie by expiring it into the past.
 * not used right now, but handy enough to keep.
 * @param {string} name
 * @returns {void}
 */
const delCookie = (name: string): void => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
};
void delCookie;

/**
 * Forces a repaint.
 * Cheap little nudge for the theme swap.
 * @returns {void}
 */
const repaint = (): void => {
    void document.body.offsetHeight;
};

/**
 * Turns computed CSS content into plain text.
 * Mostly for the snippet copy thing.
 * @param {string} raw
 * @returns {string}
 */
function normCssContent(raw: string): string {
    if (!raw || raw === "none" || raw === "normal") return "";

    const quote = raw[0];
    const hasQuotes =
        (quote === `"` || quote === `'`) &&
        raw[raw.length - 1] === quote;

    const withoutOuterQuotes = hasQuotes ? raw.slice(1, -1) : raw;

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
 * Reads the badge snippet text, preferring the ::before content.
 * @returns {string}
 */
function readBadgeText(): string {
    const preEl = document.querySelector(".kc-badge-snippet__code");
    if (!(preEl instanceof HTMLElement)) return "";

    const raw = window.getComputedStyle(preEl, "::before").content;
    const fromBefore = normCssContent(raw).trim();
    if (fromBefore) return fromBefore;

    return (preEl.textContent ?? "").trim();
}

/**
 * Hooks the copy button for the badge snippet.
 * @returns {void}
 */
function initBadgeCopy(): void {
    const buttonEl = document.querySelector(".kc-badge-snippet__copy");
    if (!(buttonEl instanceof HTMLButtonElement)) return;

    buttonEl.addEventListener("click", () => {
        const text = readBadgeText();
        void copyText(text);
    });
}

/**
 * Copies text to the clipboard.
 * Uses the modern API first, then falls back to execCommand if needed.
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyText(text: string): Promise<boolean> {
    if (!text) return false;

    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
        try {
            await clipboard.writeText(text);
            return true;
        } catch {
            // Fall through to the crusty old fallback
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

/**
 * Builds the rest of the page UI.
 * menu, header, footer, theme bits, reader bits, all that lot.
 * @returns {Promise<void>}
 */
async function initUi(): Promise<void> {
    try {
        const data = await fetchUiData();

        await Promise.all([
            createMenu(data, document),
            createHeader(data, document),
            createFooter(data, document)
        ]);

        if (data.headerInjections && data.headerInjections.length > 0) {
            applyHeadBits(document, data.headerInjections);
        }

        if (data.headScripts) {
            data.headScripts.forEach((scriptSrc) => {
                const scriptId = helpers.makeStableId("kc-head-script_", scriptSrc);

                removeExistingById(scriptId, document);

                const script = document.createElement("script");
                script.id = scriptId;
                script.src = scriptSrc;
                script.defer = true;
                document.head.appendChild(script);
            });
        }

        if (data.windows) {
            const windowAPI = await import("./window.ts");
            await windowAPI.instantiateWindows(data.windows);
        }

        const themeToggle = recreateSingleton("theme-toggle", () => document.createElement("button"), document);
        themeToggle.classList.add("theme-toggle-button");
        document.body.appendChild(themeToggle);

        bindToggleVisuals(themeToggle, {
            light: {
                emoji: data.themeToggle.light,
                iconPath: data.themeToggle.lightIconPath,
                title: data.themeToggle.title || "Theme"
            },
            dark: {
                emoji: data.themeToggle.dark,
                iconPath: data.themeToggle.darkIconPath,
                title: data.themeToggle.title || "Theme"
            }
        });

        /**
         * Applies the chosen theme and optionally persists it.
         * @param {"dark" | "light"} theme
         * @param {boolean} persist
         * @returns {void}
         */
        const applyTheme = (theme: "dark" | "light", persist: boolean = false): void => {
            document.documentElement.classList.toggle("dark-mode", theme === "dark");
            document.documentElement.classList.toggle("light-mode", theme === "light");

            void showToggleVisual(
                themeToggle,
                theme === "dark" ? "dark" : "light",
                FLOAT_TOGGLE_ICON_SPEC
            );

            curTheme = theme;

            if (persist) {
                setCookie("darkMode", theme === "dark" ? "true" : "false");
            }

            repaint();

            if (termMod && typeof termMod.setWebUiTheme === "function") {
                termMod.setWebUiTheme(theme);
                return;
            }

            nextTheme = theme;
        };

        /**
         * Applies the `darkmode` query param when present.
         * Keeps the old behaviour, just without the nested mess.
         * @returns {void}
         */
        const applyDarkModeParam = (): void => {
            if (!params.has("darkmode")) {
                return;
            }

            const raw = params.get("darkmode");
            const v = (raw ?? "").toLowerCase();

            if (v === "true") applyTheme("dark", true);
            if (v === "false") applyTheme("light", true);
        };

        const cookieDark = getCookie("darkMode");
        const osDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

        if (cookieDark !== null) {
            applyTheme(cookieDark === "true" ? "dark" : "light");
        } else {
            applyTheme(osDark ? "dark" : "light");
        }

        themeToggle.addEventListener("click", () => {
            applyTheme(curTheme === "dark" ? "light" : "dark", true);
        });

        themeToggle.title = data.themeToggle.title || "Theme";

        initEffectsControls(data.effects);

        ensureFloatBtns();

        await initNtcs();
        await initNoticeBoard();

        if (window.matchMedia) {
            const mq = window.matchMedia("(prefers-color-scheme: dark)");

            mq.addEventListener("change", (e) => {
                const osTheme: "dark" | "light" = e.matches ? "dark" : "light";
                if (curTheme === osTheme) return;

                applyTheme(osTheme, false);
            });
        }

        if (data.crtUi) {
            await crtNoise.initModal();

            installMenuToggle({
                id: "crt-ui-toggle",
                bottom: "140px",
                cfg: data.crtUi,
                icon: {
                    size: 32,
                    wrapperClass: "effects-toggle-button__icon",
                    svgClass: "effects-toggle-button__svg"
                },
                openModal: () => crtNoise.openModal()
            });
        }

        const isReaderRoute =
            window.location.pathname === "/reader" ||
            window.location.pathname.startsWith("/reader/");

        if (!isReaderRoute) {
            applyDarkModeParam();
            return;
        }

        const readerToggle = recreateSingleton("reader-toggle", () => document.createElement("button"), document);
        readerToggle.classList.add("theme-toggle-button");
        readerToggle.style.bottom = "140px";

        bindToggleVisuals(readerToggle, {
            enable: {
                emoji: data.readerModeToggle.enable,
                iconPath: data.readerModeToggle.enableIconPath,
                title: data.readerModeToggle.title || "Reader Mode"
            },
            disable: {
                emoji: data.readerModeToggle.disable,
                iconPath: data.readerModeToggle.disableIconPath,
                title: data.readerModeToggle.title || "Reader Mode"
            }
        });

        void showToggleVisual(readerToggle, "enable", FLOAT_TOGGLE_ICON_SPEC);
        document.body.appendChild(readerToggle);

        await setupReaderToggle({
            focus: readerModeFocus,
            keep: [
                ...readerModeKeep,
                "#theme-toggle",
                "#reader-toggle",
                "#read-aloud-toggle",
                "#main-menu",
                "#main-header",
                "#main-footer"
            ],
            sheetPurge: [
                "effects.css"
            ]
        });

        const readAloudToggle = recreateSingleton("read-aloud-toggle", () => document.createElement("button"), document);
        readAloudToggle.classList.add("theme-toggle-button");
        readAloudToggle.style.bottom = "200px";

        bindToggleVisuals(readAloudToggle, {
            enable: {
                emoji: data.readAloudToggle.enable,
                iconPath: data.readAloudToggle.enableIconPath ?? data.readAloudToggle.iconPath,
                title: data.readAloudToggle.title || "Enable Read Aloud"
            },
            disable: {
                emoji: data.readAloudToggle.disable,
                iconPath: data.readAloudToggle.disableIconPath ?? data.readAloudToggle.iconPath,
                title: data.readAloudToggle.title || "Disable Read Aloud"
            }
        });

        void showToggleVisual(readAloudToggle, "enable", FLOAT_TOGGLE_ICON_SPEC);
        document.body.appendChild(readAloudToggle);

        readAloudToggle.addEventListener("click", readAloud.showMenu);

        ensureFloatBtns();
        applyDarkModeParam();
    } catch (error: unknown) {
        console.error("Error loading JSON or updating DOM:", error);
    }
}

/**
 * DOM ready handler for this module.
 * Kicks off terminal boot, UI init, and the badge copy button.
 * @returns {void}
 */
const onReady = (): void => {
    document.body.style.visibility = "visible";
    document.body.style.opacity = "1";

    void bootTerm();
    initBadgeCopy();
    void initUi();
};

document.addEventListener("DOMContentLoaded", onReady);