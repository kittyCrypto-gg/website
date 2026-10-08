import type { ReactElement } from "react";
import { render2Mkup } from "../reactHelpers.tsx";
import * as helpers from "../helpers.ts";

type TipState = Readonly<{
    wrapperEl: HTMLElement;
    triggerEl: HTMLElement;
    portalEl: HTMLElement;
}>;

type HtmlBits = Readonly<{ __html: string }>;

function html(raw: string): HtmlBits {
    return { __html: raw };
}

const TIP_PORTAL_ID = "tooltip-portal";

let tipOn = false;
let tipState: TipState | null = null;

/**
 * Gets or creates the tooltip portal host in the body.
 * @returns {HTMLDivElement}
 */
function needTipHost(): HTMLDivElement {
    const existing = document.getElementById(TIP_PORTAL_ID);
    if (existing instanceof HTMLDivElement) return existing;

    const host = document.createElement("div");
    host.id = TIP_PORTAL_ID;
    host.style.position = "fixed";
    host.style.left = "0";
    host.style.top = "0";
    host.style.width = "0";
    host.style.height = "0";
    host.style.pointerEvents = "none";
    host.style.overflow = "visible";
    host.style.zIndex = "9999";
    document.body.appendChild(host);
    return host;
}

/**
 * Parses a css time string into milliseconds.
 * @param {string} raw
 * @returns {number}
 */
function cssMs(raw: string): number {
    const s = raw.trim();
    if (!s) return 0;
    if (s.endsWith("ms")) return Number.parseFloat(s);
    if (s.endsWith("s")) return Number.parseFloat(s) * 1000;
    return Number.parseFloat(s);
}

/**
 * Tries to work out the tooltip fade duration in ms.
 * falls back to a small default if css gives nothing useful.
 * @param {HTMLElement} el
 * @returns {number}
 */
function getTipFadeMs(el: HTMLElement): number {
    const cssVar = getComputedStyle(el).getPropertyValue("--tooltip-fade-duration");
    const fromVar = cssMs(cssVar);
    if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;

    const first = (getComputedStyle(el).transitionDuration.split(",")[0] || "").trim();
    const fromTransition = cssMs(first);
    return Number.isFinite(fromTransition) && fromTransition > 0 ? fromTransition : 160;
}

/**
 * Positions the open tooltip portal near its trigger.
 * flips below if there is no room above.
 * @param {HTMLElement} triggerEl
 * @param {HTMLElement} portalEl
 * @returns {void}
 */
function posTip(triggerEl: HTMLElement, portalEl: HTMLElement): void {
    const gap = 8;
    const pad = 8;
    const maxWidth = Math.max(0, window.innerWidth - (pad * 2));

    const triggerRect = triggerEl.getBoundingClientRect();

    portalEl.classList.remove("below");
    portalEl.style.position = "fixed";
    portalEl.style.left = "0px";
    portalEl.style.top = "0px";
    portalEl.style.maxWidth = `${maxWidth}px`;
    portalEl.style.boxSizing = "border-box";
    portalEl.style.pointerEvents = "auto";
    portalEl.style.overflowWrap = "anywhere";
    portalEl.style.wordBreak = "break-word";
    portalEl.style.whiteSpace = "normal";

    const portalRect = portalEl.getBoundingClientRect();

    let left = triggerRect.left + (triggerRect.width / 2) - (portalRect.width / 2);
    const maxLeft = Math.max(pad, window.innerWidth - portalRect.width - pad);
    left = Math.max(pad, Math.min(left, maxLeft));

    let top = triggerRect.top - portalRect.height - gap;
    const flip = top < pad;

    if (flip) top = triggerRect.bottom + gap;

    portalEl.style.left = `${Math.round(left)}px`;
    portalEl.style.top = `${Math.round(top)}px`;

    if (flip) portalEl.classList.add("below");
}

/**
 * Closes the tooltip portal.
 * can do it instantly or wait for the fade if we have one.
 * @param {{ immediate?: boolean }} opts
 * @returns {void}
 */
function closeTip(opts: { immediate?: boolean } = {}): void {
    const state = tipState;
    if (!state) return;

    const { immediate = false } = opts;
    const portalEl = state.portalEl;
    const portalContent = portalEl.querySelector(".tooltip-content");
    const contentEl = portalContent instanceof HTMLElement ? portalContent : null;

    const cleanup = (): void => {
        if (tipState !== state) return;
        state.wrapperEl.classList.remove("portal-active");
        portalEl.remove();
        tipState = null;
    };

    if (immediate || !contentEl) {
        cleanup();
        return;
    }

    portalEl.classList.remove("show");

    let cleaned = false;

    const finish = (): void => {
        if (cleaned) return;
        cleaned = true;
        portalEl.removeEventListener("transitionend", onEnd);
        cleanup();
    };

    const onEnd = (ev: TransitionEvent): void => {
        if (ev.propertyName !== "opacity") return;
        finish();
    };

    portalEl.addEventListener("transitionend", onEnd);

    window.setTimeout(finish, getTipFadeMs(contentEl) + 50);
}

/**
 * Opens the tooltip content in the portal near the trigger.
 * @param {HTMLElement} triggerEl
 * @returns {void}
 */
function openTip(triggerEl: HTMLElement): void {
    if (!triggerEl.isConnected) return;

    const wrapper = triggerEl.closest(".tooltip");
    if (!(wrapper instanceof HTMLElement)) return;

    const content = wrapper.querySelector(".tooltip-content");
    if (!(content instanceof HTMLElement)) return;

    const existing = tipState;
    if (existing?.triggerEl === triggerEl) return;

    closeTip({ immediate: true });

    const portalHost = needTipHost();

    const portalWrapper = document.createElement("span");
    portalWrapper.className = "tooltip portal";
    portalWrapper.style.position = "fixed";
    portalWrapper.style.display = "block";
    portalWrapper.style.maxWidth = `${Math.max(0, window.innerWidth - 16)}px`;
    portalWrapper.style.boxSizing = "border-box";
    portalWrapper.style.pointerEvents = "auto";

    const portalContent = content.cloneNode(true) as HTMLElement;
    portalContent.style.maxWidth = "100%";
    portalContent.style.boxSizing = "border-box";
    portalContent.style.whiteSpace = "normal";
    portalContent.style.overflowWrap = "anywhere";
    portalContent.style.wordBreak = "break-word";

    portalWrapper.appendChild(portalContent);

    wrapper.classList.add("portal-active");
    portalHost.appendChild(portalWrapper);

    posTip(triggerEl, portalWrapper);

    const viewport = window.visualViewport;
    if (viewport) {
        portalWrapper.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
        posTip(triggerEl, portalWrapper);
    }

    tipState = {
        wrapperEl: wrapper,
        triggerEl,
        portalEl: portalWrapper
    };

    requestAnimationFrame(() => {
        if (tipState?.portalEl !== portalWrapper) return;
        portalWrapper.classList.add("show");
    });
}

/**
 * Installs the global tooltip portal handlers once.
 * @returns {void}
 */
function ensureTip(): void {
    if (tipOn) return;
    tipOn = true;

    const findTrigger = (t: EventTarget | null): HTMLElement | null => {
        if (!(t instanceof Element)) return null;
        const el = t.closest(".tooltip-trigger");
        return el instanceof HTMLElement ? el : null;
    };

    const isInsideOpenTip = (t: EventTarget | null): boolean => {
        const state = tipState;
        if (!state) return false;
        if (!(t instanceof Node)) return false;
        return state.triggerEl.contains(t) || state.portalEl.contains(t);
    };

    const hideOnViewportChange = (): void => {
        if (!tipState) return;
        closeTip();
    };

    document.addEventListener("mouseover", (ev: MouseEvent) => {
        const trigger = findTrigger(ev.target);
        if (!trigger) return;
        openTip(trigger);
    });

    document.addEventListener("focusin", (ev: FocusEvent) => {
        const trigger = findTrigger(ev.target);
        if (!trigger) return;
        openTip(trigger);
    });

    document.addEventListener("mouseout", (ev: MouseEvent) => {
        if (!tipState) return;

        const from = ev.target;
        const to = ev.relatedTarget;

        if (!isInsideOpenTip(from)) return;
        if (isInsideOpenTip(to)) return;

        closeTip();
    });

    document.addEventListener("focusout", (ev: FocusEvent) => {
        if (!tipState) return;

        const from = ev.target;
        const to = ev.relatedTarget;

        if (!isInsideOpenTip(from)) return;
        if (isInsideOpenTip(to)) return;

        closeTip();
    });

    document.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        closeTip();
    });

    document.addEventListener("scroll", hideOnViewportChange, true);
    window.addEventListener("resize", hideOnViewportChange);

    if (window.visualViewport) {
        window.visualViewport.addEventListener("scroll", hideOnViewportChange);
        window.visualViewport.addEventListener("resize", hideOnViewportChange);
    }
}

/**
 * React bit for the tooltip markup.
 * @param {{ triggerHtml: string; contentHtml: string; isTranslation: boolean }} props
 * @returns {ReactElement}
 */
function Tip(props: {
    triggerHtml: string;
    contentHtml: string;
    isTranslation: boolean;
}): ReactElement {
    const contentClass = `tooltip-content${props.isTranslation ? " translation" : ""}`;

    return (
        <span className="tooltip">
            <span className="tooltip-trigger" dangerouslySetInnerHTML={html(props.triggerHtml)} />
            <span className={contentClass} dangerouslySetInnerHTML={html(props.contentHtml)} />
        </span>
    );
}

/**
 * Replaces custom <tooltip> blocks with the rendered tooltip html.
 * also boots the shared portal wiring.
 * @param {string} htmlContent
 * @returns {Promise<string>}
 */
export async function replaceTooltips(htmlContent: string): Promise<string> {
    ensureTip();

    const re = /<tooltip\b[^>]*>[\s\S]*?<\/tooltip>/gi;

    /**
     * Serialises one node for the tooltip parser.
     * text is escaped, elements get serialised as xml.
     * @param {Node} n
     * @returns {string}
     */
    const serialise = (n: Node): string => {
        switch (n.nodeType) {
            case 3:
                return helpers.escapeHtml(n.textContent || "");
            case 1:
                return new XMLSerializer().serializeToString(n);
            default:
                return "";
        }
    };

    return htmlContent.replace(re, (block: string) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const tooltip = doc.querySelector("tooltip");
        if (!tooltip) return block;

        const contentEl = Array.from(tooltip.children).find((n) => n.tagName.toLowerCase() === "content");
        if (!contentEl) return block;

        const isHtml = contentEl.hasAttribute("html");
        const translationAttr = (contentEl.getAttribute("translation") || "").trim().toLowerCase();
        const isTranslation = translationAttr === "true";

        const triggerHtml = Array.from(tooltip.childNodes)
            .filter((n) => n !== contentEl)
            .map(serialise)
            .join("")
            .trim();

        if (!triggerHtml) return block;

        const contentHtml = isHtml
            ? Array.from(contentEl.childNodes)
                .map((n) => new XMLSerializer().serializeToString(n))
                .join("")
            : helpers.escapeHtml(contentEl.textContent || "");

        return render2Mkup(
            <Tip
                triggerHtml={triggerHtml}
                contentHtml={contentHtml}
                isTranslation={isTranslation}
            />
        );
    });
}

