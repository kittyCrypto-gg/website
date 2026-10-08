import { nextFrame } from "../helpers.js";
import { DESKTOP_PRESETS, SHIFT_MAP } from "./constants.ts";
import type { CssRes, Mods, SendCb } from "./types.ts";

/** Shared keyboard lifecycle state, resource loading, and markup helpers. */
export class KeyboardFoundation {

    static MARKER_ID = "keyboard-emu-html-loaded";
    static CSS_LINK_ID = "keyboard-emu-css";
    static DEFAULT_Z_INDEX = 2147483647;
    static HIDDEN_Z = -1;
    static VIEWPORT_OVERLAP_PX = 1;

    static SHIFT_MAP = SHIFT_MAP;
    static DESKTOP_PRESETS = DESKTOP_PRESETS;


    /**
     * Resolves a path against this module when possible.
     * If URL blows up for some reason it just gives the input back.
     * @param {string} path
     * @returns {string}
     */
    static __url(path: string): string {
        try {
            return new URL(path, import.meta.url).toString();
        } catch {
            return path;
        }
    }


    isMobile: boolean;
    htmlUrl: string;
    cssUrl: string;

    opts: unknown;
    zIndex: number;

    bar: HTMLDivElement | null;
    cssLink: HTMLLinkElement | null;
    cssInjected: boolean;

    mods: Mods;
    send: SendCb | null;

    lastEditable: HTMLElement | null;
    toolbarVisible: boolean;
    skipNextRefocus: boolean;
    suppressNextClick: boolean;

    vv: VisualViewport | null;
    raf: number;
    ro: ResizeObserver | null;

    protected __onFocusInBound: (e: FocusEvent) => void;
    protected __onFocusOutBound: (e: FocusEvent) => void;
    protected __onEditablePointerDownBound: (e: PointerEvent) => void;
    protected __onPointerDownCaptureBound: (e: PointerEvent) => void;
    protected __onClickBound: (e: MouseEvent) => void;
    protected __onBeforeInputCaptureBound: (e: Event) => void;
    protected __onKeyDownCaptureBound: (e: KeyboardEvent) => void;
    protected __scheduleBound: () => void;
    protected __refocusEditableBound: () => void;
    protected __onTouchMoveBound: (e: TouchEvent) => void;
    protected __onDocClickCaptureBound: (e: MouseEvent) => void;
    protected __onTransitionEndBound: (e: TransitionEvent) => void;


    /**
     * Builds the thing and binds all the boring handler refs.
     * @param {unknown} isMobile
     * @param {unknown} htmlUrl
     * @param {unknown} cssUrl
     * @returns {void}
     */
    constructor(isMobile?: unknown, htmlUrl?: unknown, cssUrl?: unknown) {
        this.isMobile = !!isMobile;

        this.htmlUrl = typeof htmlUrl === "string" && htmlUrl !== ""
            ? KeyboardFoundation.__url(htmlUrl)
            : KeyboardFoundation.__url("/ui/keyboard.html");

        this.cssUrl = typeof cssUrl === "string" && cssUrl !== ""
            ? KeyboardFoundation.__url(cssUrl)
            : KeyboardFoundation.__url("/styles/modules/keyboard.css");

        this.opts = null;
        this.zIndex = KeyboardFoundation.DEFAULT_Z_INDEX;

        this.bar = null;
        this.cssLink = null;
        this.cssInjected = false;

        this.mods = { ctrl: false, alt: false, meta: false, shift: false, fn: false };
        this.send = null;

        this.lastEditable = null;
        this.toolbarVisible = false;
        this.skipNextRefocus = false;
        this.suppressNextClick = false;

        this.vv = null;
        this.raf = 0;
        this.ro = null;

        this.__onFocusInBound = this.__onFocusIn.bind(this);
        this.__onFocusOutBound = this.__onFocusOut.bind(this);
        this.__onEditablePointerDownBound = this.__onEditablePointerDown.bind(this);
        this.__onPointerDownCaptureBound = this.__onPointerDownCapture.bind(this);
        this.__onClickBound = this.__onClick.bind(this);
        this.__onBeforeInputCaptureBound = this.__onBeforeInputCapture.bind(this);
        this.__onKeyDownCaptureBound = this.__onKeyDownCapture.bind(this);
        this.__scheduleBound = this.__schedule.bind(this);
        this.__refocusEditableBound = this.__refocusEditable.bind(this);
        this.__onTouchMoveBound = this.__onTouchMove.bind(this);
        this.__onDocClickCaptureBound = this.__onDocClickCapture.bind(this);
        this.__onTransitionEndBound = this.__onTransitionEnd.bind(this);
    }

    /**
     * Waits until an element with this id exists in the DOM.
     * @param {string} id
     * @returns {Promise<void>}
     */
    async __waitEl(id: string): Promise<void> {
        while (!document.getElementById(id)) {
            await nextFrame();
        }
    }


    /**
     * Detects keyboard styles that are already present in the page bundle.
     * @param {HTMLElement} bar
     * @returns {boolean}
     */
    __hasCss(bar: HTMLElement): boolean {
        return getComputedStyle(bar).getPropertyValue("--kb-css-ready").trim() === "1";
    }


    /**
     * Makes sure the css link is there.
     * @returns {CssRes}
     */
    __ensCss(): CssRes {
        const existing = document.getElementById(KeyboardFoundation.CSS_LINK_ID);
        if (existing && existing.tagName === "LINK") {
            return { link: existing as HTMLLinkElement, injected: false };
        }

        const link = document.createElement("link");
        link.id = KeyboardFoundation.CSS_LINK_ID;
        link.rel = "stylesheet";
        link.href = this.cssUrl;
        link.setAttribute("data-owner", "keyboard-emu");
        document.head.appendChild(link);

        return { link, injected: true };
    }


    /**
     * Waits until the keyboard stylesheet is actually usable before the
     * toolbar is allowed to participate in paint.
     * @param {HTMLLinkElement} link
     * @returns {Promise<void>}
     */
    async __waitCss(link: HTMLLinkElement): Promise<void> {
        if (link.sheet) return;

        await new Promise<void>((resolve, reject) => {
            const cleanup = (): void => {
                link.removeEventListener("load", onLoad);
                link.removeEventListener("error", onError);
            };
            const onLoad = (): void => {
                cleanup();
                resolve();
            };
            const onError = (): void => {
                cleanup();
                reject(new Error(`Failed to load ${this.cssUrl}`));
            };

            link.addEventListener("load", onLoad, { once: true });
            link.addEventListener("error", onError, { once: true });
        });
    }


    /**
     * Fetches and injects the keyboard html.
     * @param {HTMLDivElement} bar
     * @returns {Promise<void>}
     */
    async __injHtml(bar: HTMLDivElement): Promise<void> {
        const res = await fetch(this.htmlUrl, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`Failed to load ${this.htmlUrl} (${res.status})`);

        const html = await res.text();
        bar.innerHTML = html;

        if (!bar.isConnected) document.body.appendChild(bar);
        await this.__waitEl(KeyboardFoundation.MARKER_ID);
    }


    /**
     * Applies mobile or desktop labels to responsive bits.
     * @param {HTMLElement} bar
     * @returns {void}
     */
    __setLabels(bar: HTMLElement): void {
        const nodes = bar.querySelectorAll<HTMLElement>("[data-mobile-text][data-desktop-text]");

        for (const el of nodes) {
            const m = el.getAttribute("data-mobile-text") || "";
            const d = el.getAttribute("data-desktop-text") || "";
            el.textContent = this.isMobile ? m : d;
        }
    }

}
