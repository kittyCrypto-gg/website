import { loadScript } from "../loader.ts";
import { isBlogPth, isResourcePth } from "./routing.ts";

const MARKED_URL = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
const HIGHLIGHT_STYLE_URL = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/default.min.css";
const HIGHLIGHT_URL = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js";
const HIGHLIGHT_POWERSHELL_URL = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/powershell.min.js";
const HIGHLIGHT_NGINX_URL = "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/languages/nginx.min.js";

type MarkedApi = Readonly<{
    parse: (markdown: string) => string;
}>;

type HighlightApi = Readonly<{
    highlightElement: (element: HTMLElement) => void;
}>;

type RuntimeGlobals = typeof globalThis & Readonly<{
    marked?: MarkedApi;
    hljs?: HighlightApi;
}>;

let markedPromise: Promise<MarkedApi> | null = null;
let highlightPromise: Promise<HighlightApi> | null = null;
let highlightStylePromise: Promise<HTMLLinkElement> | null = null;

function runtimeGlobals(): RuntimeGlobals {
    return globalThis as RuntimeGlobals;
}

function readMarked(): MarkedApi | null {
    const api = runtimeGlobals().marked;
    return api && typeof api.parse === "function" ? api : null;
}

function readHighlight(): HighlightApi | null {
    const api = runtimeGlobals().hljs;
    return api && typeof api.highlightElement === "function" ? api : null;
}

export function ensureMarked(): Promise<MarkedApi> {
    const ready = readMarked();
    if (ready) return Promise.resolve(ready);
    if (markedPromise) return markedPromise;

    markedPromise = loadScript(MARKED_URL).then(() => {
        const loaded = readMarked();
        if (!loaded) throw new Error("Marked loaded without exposing marked.parse");
        return loaded;
    });

    return markedPromise;
}

function ensureHighlightStyle(): Promise<HTMLLinkElement> {
    const resolved = new URL(HIGHLIGHT_STYLE_URL, document.baseURI).href;
    const existing = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        .find((link) => link.href === resolved);
    if (existing) return Promise.resolve(existing);
    if (highlightStylePromise) return highlightStylePromise;

    highlightStylePromise = new Promise<HTMLLinkElement>((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = HIGHLIGHT_STYLE_URL;
        link.addEventListener("load", () => resolve(link), { once: true });
        link.addEventListener("error", () => reject(new Error("Failed to load Highlight.js stylesheet")), { once: true });
        document.head.appendChild(link);
    });

    return highlightStylePromise;
}

export function ensureHighlight(): Promise<HighlightApi> {
    const ready = readHighlight();
    if (ready) return Promise.resolve(ready);
    if (highlightPromise) return highlightPromise;

    highlightPromise = Promise.all([
        loadScript(HIGHLIGHT_URL),
        ensureHighlightStyle()
    ]).then(async () => {
            await Promise.all([
                loadScript(HIGHLIGHT_POWERSHELL_URL),
                loadScript(HIGHLIGHT_NGINX_URL)
            ]);

            const loaded = readHighlight();
            if (!loaded) throw new Error("Highlight.js loaded without exposing hljs.highlightElement");
            return loaded;
        });

    return highlightPromise;
}

export async function ensureRssRuntimeDependencies(): Promise<void> {
    const marked = ensureMarked();
    const highlight = isBlogPth() || isResourcePth()
        ? ensureHighlight()
        : Promise.resolve(null);

    await Promise.all([marked, highlight]);
}
