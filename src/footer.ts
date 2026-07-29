import type { MainJson } from "./uiFetch.ts";

type Kofi = Readonly<{
    draw: (name: string, cfg: Readonly<Record<string, string>>) => void;
}>;

declare global {
    interface Window {
        kofiWidgetOverlay?: Kofi;
    }
}

const KOFI_SRC = "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
const KOFI_STYLE = `
.floatingchat-container-wrap,
.floatingchat-container-wrap-mobi {
    left: 16px !important;
    right: auto !important;
    width: fit-content !important;
    overflow: visible !important;
}

.floatingchat-container-wrap > iframe,
.floatingchat-container-wrap-mobi > iframe {
    width: 230px !important;
}

.floating-chat-kofi-popup-iframe,
.floating-chat-kofi-popup-iframe-mobi,
.floating-chat-kofi-popup-iframe-closer-mobi {
    left: 16px !important;
    right: auto !important;
}
`;
const KOFI_PAGES = new Set([
    "/",
    "/index.html",
    "/about",
    "/about.html",
    "/blog",
    "/blog.html",
    "/resources",
    "/resources.html"
]);

function normPath(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function addKofiStyle(root: Document): void {
    const style = root.createElement("style");
    style.textContent = KOFI_STYLE;
    root.head.appendChild(style);
}

function drawKofi(root: Document): void {
    root.defaultView?.kofiWidgetOverlay?.draw("kittycrow", {
        "type": "floating-chat",
        "floating-chat.donateButton.text": "Buy me a coffee?",
        "floating-chat.donateButton.background-color": "#5bc0de",
        "floating-chat.donateButton.text-color": "#323842"
    });
}

function initKofi(root: Document): void {
    const win = root.defaultView;
    if (!win || !KOFI_PAGES.has(normPath(win.location.pathname))) return;

    addKofiStyle(root);
    if (win.kofiWidgetOverlay) {
        drawKofi(root);
        return;
    }

    const script = root.createElement("script");
    script.src = KOFI_SRC;
    script.addEventListener("load", () => drawKofi(root), { once: true });
    root.body.appendChild(script);
}

/**
 * Writes the footer text into #main-footer and swaps in the current year.
 * very small thing, but keeps that placeholder rubbish out of the html.
 * @param {MainJson} data
 * @param {Document} root
 * @returns {Promise<void>}
 */
export async function createFooter(data: MainJson, root: Document = document): Promise<void> {
    const footer = root.getElementById("main-footer");
    if (!footer) throw new Error("Element #main-footer not found!");

    const currentYear = new Date().getFullYear();
    footer.textContent = data.footer.replace("${year}", String(currentYear));
    initKofi(root);
}
