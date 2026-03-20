import type { ReactElement } from "react";
import { smsEnterBounce } from "./physics.ts";
import { render2Mkup } from "./reactHelpers.tsx";

const themes: Record<string, unknown> = {};

type TooltipPortalOpenState = Readonly<{
    wrapperEl: HTMLElement;
    triggerEl: HTMLElement;
    portalEl: HTMLElement;
}>;

type HtmlBits = Readonly<{
    __html: string;
}>;

/**
 * @param {string} raw
 * @returns {HtmlBits}
 */
function html(raw: string): HtmlBits {
    return { __html: raw };
}

/**
 * @param {string} url - URL to themes JSON.
 * @returns {Promise<void>}
 */
async function loadThemes(url: string = "../data/themes.json"): Promise<void> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load themes from ${url}`);

    const data: unknown = await res.json();

    for (const key of Object.keys(themes)) delete themes[key];
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) themes[key] = value;
}

/**
 * @param {string} addr - Recipient address.
 * @returns {string} Theme name associated with the given recipient
 */
function getTheme(addr: string): string {
    const a = addr.toLowerCase();
    for (const [theme, addrsRaw] of Object.entries(themes)) {
        const addrs = addrsRaw as unknown as readonly string[];
        if (addrs.some((x) => x.toLowerCase() === a)) return theme;
    }
    return "";
}

/**
 * @param {string | null | undefined} s - Raw string to escape for HTML.
 * @returns {string} Escaped string safe for HTML insertion.
 */
function esc(s: string | null | undefined): string {
    return (s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

/**
 * @param {Node} node - Node whose children are serialised as mixed content.
 * @returns {string} A string representation of the mixed content of a node
 */
export function serialiseMixedContent(node: Node): string {
    return Array.from(node.childNodes)
        .map((n) => {
            switch (n.nodeType) {
                case 3:
                    return esc(n.textContent || "");
                case 1:
                    return (n as Element).outerHTML;
                default:
                    return "";
            }
        })
        .join("")
        .trim();
}

/**
 * @param {string} cssHref - CSS href substring to look for.
 * @returns {boolean | Element | null} True if a stylesheet with the given href substring is found, or the matching link element, or null if not found.
 */
function hassCss(cssHref: string): boolean | Element | null {
    return (
        Array.from(document.styleSheets).some((s) => (s.href || "").includes(cssHref)) ||
        document.querySelector(`link[rel="stylesheet"][href="${cssHref}"]`)
    );
}

/**
 * @param {ParentNode} node - Node to query within.
 * @param {string} tag - Tag name selector.
 * @returns {string} Text content of the first matching element for the given tag within the specified node, trimmed of whitespace.
 */
function getText(node: ParentNode, tag: string): string {
    return (node.querySelector(tag)?.textContent || "").trim();
}

/**
 * @param {Element} parent - Parent element to scan.
 * @param {readonly string[]} tagNames - Allowed tag names (lowercase).
 * @returns {Element | null} First direct child element whose tag matches one of the provided tag names.
 */
function getDirectChildByTag(parent: Element, tagNames: readonly string[]): Element | null {
    for (const child of Array.from(parent.children)) {
        const tag = child.tagName.toLowerCase();
        if (tagNames.includes(tag)) return child;
    }
    return null;
}

type Escaper = (s: string | null | undefined) => string;

/**
 * @param {ParentNode} root - Root node to search within.
 * @param {string} selector - Selector for rich content nodes.
 * @param {Escaper} escFn - Escaper (kept for signature parity).
 * @returns {string[]} An array of string representations of rich content nodes that match the given selector within the specified root node.
 */
function mapRichContent(root: ParentNode, selector: string, escFn: Escaper): string[] {
    void escFn;
    return Array.from(root.querySelectorAll(selector))
        .map((n) => serialiseMixedContent(n))
        .filter(Boolean);
}

/**
 * @param {{ logo: string; company: string; lines: string[]; disclaimers: string[] }} props
 * @returns {ReactElement}
 */
function SignatureMarkup(props: {
    logo: string;
    company: string;
    lines: string[];
    disclaimers: string[];
}): ReactElement {
    return (
        <>
            <hr className="email-signature-sep" />
            <div className="email-signature">
                {props.logo && (
                    <div className="email-signature-logo">
                        <img
                            src={props.logo}
                            alt={props.company || "Company logo"}
                            className="email-signature-logo-img"
                        />
                    </div>
                )}

                <div className="email-signature-text">
                    <div dangerouslySetInnerHTML={html(props.lines.join("<br/>"))} />
                    {props.disclaimers.length > 0 && (
                        <div className="email-signature-disclaimer">
                            {props.disclaimers.map((d, i) => (
                                <div
                                    key={`disc-${i}`}
                                    className="email-signature-disclaimer-line"
                                    dangerouslySetInnerHTML={html(d)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

/**
 * @param {Element} sig - Signature element.
 * @param {Escaper} escFn - Escaper function.
 * @returns {string} A string representation of an email signature constructed from the provided signature element and escaped using the given escaper function.
 */
function parseSignature(sig: Element, escFn: Escaper): string {
    const t = (q: string): string => (sig.querySelector(q)?.textContent || "").trim();

    const name = t("name");
    const company = t("company");
    const address = t("address");
    const telephone = t("telephone");
    const emailAddress = t("emailAddress");
    const logo = (t("logo") || "").trim();

    const positions = mapRichContent(sig, "position", escFn);
    const disclaimers = mapRichContent(sig, "disclaimer", escFn);

    const hasAny =
        name ||
        positions.length ||
        company ||
        address ||
        telephone ||
        emailAddress ||
        logo ||
        disclaimers.length;

    if (!hasAny) return "";

    const lines = [
        name && `<strong class="email-signature-name">${esc(name)}</strong>`,
        ...positions.map((p) => `<span class="email-signature-position">${p}</span>`),
        company && `<span class="email-signature-company">${esc(company)}</span>`,
        address && `<span class="email-signature-address">${esc(address)}</span>`,
        telephone && `<span class="email-signature-telephone">Tel: ${esc(telephone)}</span>`,
        emailAddress && `<span class="email-signature-email">Email: ${esc(emailAddress)}</span>`
    ].filter(Boolean) as string[];

    return render2Mkup(
        <SignatureMarkup
            logo={logo}
            company={company}
            lines={lines}
            disclaimers={disclaimers}
        />
    );
}

type ReplaceSmsMessagesImpl = (htmlContent: string, cssHref?: string) => string;
type ReplaceEmailsImpl = (htmlContent: string, cssHref?: string) => Promise<string>;
type ReplaceSVGsImpl = (root?: Document | Element | string) => Promise<void>;
type ReplaceTooltipsImpl = (htmlContent: string) => Promise<string>;
type BindEmailActionsImpl = () => void;

type MediaStylerImpls = Readonly<{
    replaceSmsMessages: ReplaceSmsMessagesImpl;
    replaceEmails: ReplaceEmailsImpl;
    replaceSVGs: ReplaceSVGsImpl;
    replaceImageTags: (htmlContent: string) => Promise<string>;
    replaceTooltips: ReplaceTooltipsImpl;
    bindEmailActions: BindEmailActionsImpl;
}>;

type MediaStylerImplOverrides = Partial<{
    replaceSmsMessages: ReplaceSmsMessagesImpl;
    replaceEmails: ReplaceEmailsImpl;
    replaceSVGs: ReplaceSVGsImpl;
    replaceImageTags: (htmlContent: string) => Promise<string>;
    replaceTooltips: ReplaceTooltipsImpl;
    bindEmailActions: BindEmailActionsImpl;
}>;

/**
 * @param {{ type: "in" | "out"; nickname: string; contentHtml: string; timestamp: string }} props
 * @returns {ReactElement}
 */
function SmsMarkup(props: {
    type: "in" | "out";
    nickname: string;
    contentHtml: string;
    timestamp: string;
}): ReactElement {
    return (
        <div className={`message-wrapper ${props.type} show`}>
            <div className={`message ${props.type}`}>
                <div className="nickname-strip">{props.nickname}</div>
                <div className="message-text" dangerouslySetInnerHTML={html(props.contentHtml)} />
                <div className={`timestamp ${props.type}`}>{props.timestamp}</div>
            </div>
        </div>
    );
}

/**
 * @param {string} htmlContent - HTML content to transform.
 * @param {string} cssHref - Stylesheet href for SMS rendering.
 * @returns {string} Transformed HTML content with SMS messages replaced by styled HTML structures.
 */
function replaceSmsMessagesImpl(htmlContent: string, cssHref: string = "../styles/modules/sms.css"): string {
    if (!hassCss(cssHref)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
    }

    const raw = (doc: ParentNode, tag: string): string => getText(doc, tag);

    const re = /<message\b[^>]*\btype=["'](in|out)["'][^>]*>[\s\S]*?<\/message>/gi;

    return htmlContent.replace(re, (block: string, typeRaw: string) => {
        const type = (typeRaw || "").trim().toLowerCase();
        if (type !== "in" && type !== "out") return block;

        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const msg = doc.querySelector("message");
        if (!msg) return block;

        const nickname = raw(msg, "nickname");

        const contentNode = getDirectChildByTag(msg, ["content"]);
        const contentHtml = contentNode ? serialiseMixedContent(contentNode) : "";

        const timestamp = raw(msg, "timestamp");

        return render2Mkup(
            <SmsMarkup
                type={type}
                nickname={nickname}
                contentHtml={contentHtml}
                timestamp={timestamp}
            />
        );
    });
}

/**
 * @param {{ themeClass: string; recipientIp: string; fromNameHtml: string; fromAddr: string; toNameHtml: string; toAddr: string; subject: string; timestamp: string; contentHtml: string }} props
 * @returns {ReactElement}
 */
function EmailMarkup(props: {
    themeClass: string;
    recipientIp: string;
    fromNameHtml: string;
    fromAddr: string;
    toNameHtml: string;
    toAddr: string;
    subject: string;
    timestamp: string;
    contentHtml: string;
}): ReactElement {
    const className = props.themeClass ? `email-card ${props.themeClass}` : "email-card";

    return (
        <div className="email-wrapper show">
            <div className={className} data-recipient-ip={props.recipientIp}>
                <div className="email-header">
                    <div className="email-meta">
                        <div className="email-row">
                            <span className="email-label">From</span>
                            <span className="email-value">
                                <span className="email-name" dangerouslySetInnerHTML={html(props.fromNameHtml)} />
                                <span className="email-address">({props.fromAddr})</span>
                            </span>
                        </div>

                        <div className="email-row">
                            <span className="email-label">To</span>
                            <span className="email-value">
                                <span className="email-name" dangerouslySetInnerHTML={html(props.toNameHtml)} />
                                <span className="email-address">({props.toAddr})</span>
                            </span>
                        </div>

                        <div className="email-row email-subject-row">
                            <span className="email-label">Subject</span>
                            <span className="email-subject-text">{props.subject}</span>
                            <span className="email-timestamp">{props.timestamp}</span>
                        </div>
                    </div>

                    <div className="email-actions-bar" role="toolbar">
                        <div className="email-actions">
                            <button className="email-action" data-email-action="reply">↩️</button>
                            <button className="email-action" data-email-action="forward">➡️</button>
                            <button className="email-action" data-email-action="flag">🚩</button>
                            <button className="email-action" data-email-action="archive">🗄️</button>
                            <button className="email-action" data-email-action="delete">🗑️</button>
                        </div>
                    </div>
                </div>

                <div className="email-content" dangerouslySetInnerHTML={html(props.contentHtml)} />
            </div>
        </div>
    );
}

/**
 * @param {string} htmlContent - HTML content to transform.
 * @param {string} cssHref - Stylesheet href for email rendering.
 * @returns {Promise<string>} A promise that resolves to the transformed HTML content with email blocks replaced by styled HTML structures.
 */
async function replaceEmailsImpl(htmlContent: string, cssHref: string = "../styles/modules/email.css"): Promise<string> {
    if (!hassCss(cssHref)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
    }

    if (Object.keys(themes).length === 0) {
        try {
            await loadThemes();
        } catch (err: unknown) {
            console.error("Failed to load themes:", err);
        }
    }

    const raw = (doc: ParentNode, tag: string): string => getText(doc, tag);

    /**
     * @param {Element} emailNode - Email XML element.
     * @returns {string} HTML string for the email body, using only the email's own content element.
     */
    const buildContentHtml = (emailNode: Element): string => {
        const contentEl = getDirectChildByTag(emailNode, ["content"]);
        if (!contentEl) return "";

        return Array.from(contentEl.childNodes)
            .map((n) => {
                switch (n.nodeType) {
                    case 1: {
                        const el = n as Element;
                        const tag = el.tagName.toLowerCase();
                        return tag === "signature" ? parseSignature(el, esc) : el.outerHTML;
                    }
                    case 3:
                        return esc(n.textContent || "");
                    default:
                        return "";
                }
            })
            .join("");
    };

    const re = /<email\b[^>]*>[\s\S]*?<\/email>/gi;

    return htmlContent.replace(re, (block: string) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const email = doc.querySelector("email");
        if (!email) return block;

        const from = email.querySelector("from");
        const to = email.querySelector("to");

        const fromNameEl = from?.querySelector("name");
        const toNameEl = to?.querySelector("name");

        const fromNameHtml = fromNameEl
            ? serialiseMixedContent(fromNameEl)
            : esc(from ? raw(from, "name") : "");

        const fromAddr = from ? raw(from, "addr") : "";

        const toNameHtml = toNameEl
            ? serialiseMixedContent(toNameEl)
            : esc(to ? raw(to, "name") : "");

        const toAddr = to ? raw(to, "addr") : "";

        const themeClass = getTheme(toAddr);

        const recipientIp = raw(email, "toIp") || "";
        const timestamp = raw(email, "timestamp");
        const subject = raw(email, "subject");

        const contentHtml = buildContentHtml(email);

        return render2Mkup(
            <EmailMarkup
                themeClass={themeClass}
                recipientIp={recipientIp}
                fromNameHtml={fromNameHtml}
                fromAddr={fromAddr}
                toNameHtml={toNameHtml}
                toAddr={toAddr}
                subject={subject}
                timestamp={timestamp}
                contentHtml={contentHtml}
            />
        );
    });
}

/**
 * @param {Document | Element | string} root - Document/Element to process, or HTML string to wrap.
 * @returns {Promise<void>} A promise that resolves when all SVG images within the specified root have been replaced with their inline SVG content.
 */
async function replaceSVGsImpl(root: Document | Element | string = document): Promise<void> {
    let resolvedRoot: Document | Element | null = null;

    if (typeof root === "string") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = root;
        resolvedRoot = wrapper;
    } else if (root instanceof Document || root instanceof Element) {
        resolvedRoot = root;
    }

    if (!resolvedRoot) return;

    const images = Array.from(resolvedRoot.querySelectorAll("img"));

    for (const img of images) {
        const src = img.getAttribute("src");
        if (!src || !src.endsWith(".svg")) continue;

        try {
            const res = await fetch(src);
            if (!res.ok) continue;

            const svgText = await res.text();
            const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
            const svg = doc.querySelector("svg");
            if (!svg) continue;

            if (img.className) svg.classList.add(...img.classList);

            const style = img.getAttribute("style");
            if (style) svg.setAttribute("style", style);

            const width = img.getAttribute("width");
            if (width) svg.setAttribute("width", width);

            const height = img.getAttribute("height");
            if (height) svg.setAttribute("height", height);

            img.replaceWith(svg);
        } catch (err: unknown) {
            console.warn("inlineSvgs failed:", src, err);
        }
    }
}

/**
 * @param {{ src: string; alt: string; }} props
 * @returns {ReactElement}
 */
function ChapterImageMarkup(props: { src: string; alt: string }): ReactElement {
    const safeUrl = esc(props.src.trim());
    const safeAlt = esc(props.alt.trim());

    return (
        <div className="chapter-image-container">
            <div
                dangerouslySetInnerHTML={html(`
          <img
            src="${safeUrl}"
            alt="${safeAlt}"
            class="chapter-image"
            loading="lazy"
            onerror="this.onerror=null; this.src='/path/to/fallback-image.png'; this.alt='Image not found';"
          />
        `)}
            />
        </div>
    );
}

/**
 * @param {string} htmlContent
 * @returns {Promise<string>}
 */
async function replaceImageTagsImpl(htmlContent: string): Promise<string> {
    const re = /<chapter-image\b[^>]*?(?:\/>|>[\s\S]*?<\/chapter-image>)/gi;

    return htmlContent.replace(re, (block: string) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const imageEl = doc.querySelector("chapter-image");
        if (!imageEl) return block;

        const url = (imageEl.getAttribute("url") || imageEl.getAttribute("src") || "").trim();
        if (!url) return block;

        const altAttr = (imageEl.getAttribute("alt") || "").trim();
        const altFromText = (imageEl.textContent || "").trim();
        const alt = altAttr || altFromText || "Chapter Image";

        return render2Mkup(<ChapterImageMarkup src={url} alt={alt} />);
    });
}

const TOOLTIP_PORTAL_ID = "tooltip-portal";

let tooltipPortalInstalled = false;
let tooltipPortalOpenState: TooltipPortalOpenState | null = null;

function ensureTooltipPortalHost(): HTMLDivElement {
    const existing = document.getElementById(TOOLTIP_PORTAL_ID);
    if (existing instanceof HTMLDivElement) return existing;

    const host = document.createElement("div");
    host.id = TOOLTIP_PORTAL_ID;
    document.body.appendChild(host);
    return host;
}

function parseCssTimeMs(raw: string): number {
    const s = raw.trim();
    if (!s) return 0;
    if (s.endsWith("ms")) return Number.parseFloat(s);
    if (s.endsWith("s")) return Number.parseFloat(s) * 1000;
    return Number.parseFloat(s);
}

function getTooltipFadeMs(el: HTMLElement): number {
    const cssVar = getComputedStyle(el).getPropertyValue("--tooltip-fade-duration");
    const fromVar = parseCssTimeMs(cssVar);
    if (Number.isFinite(fromVar) && fromVar > 0) return fromVar;

    const first = (getComputedStyle(el).transitionDuration.split(",")[0] || "").trim();
    const fromTransition = parseCssTimeMs(first);
    return (Number.isFinite(fromTransition) && fromTransition > 0) ? fromTransition : 160;
}

function positionTooltipPortal(triggerEl: HTMLElement, portalEl: HTMLElement): void {
    const gap = 8;
    const pad = 8;

    const triggerRect = triggerEl.getBoundingClientRect();

    portalEl.classList.remove("below");
    portalEl.style.left = "0px";
    portalEl.style.top = "0px";

    const portalRect = portalEl.getBoundingClientRect();

    let left = triggerRect.left + triggerRect.width / 2 - portalRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - portalRect.width - pad));

    let top = triggerRect.top - portalRect.height - gap;
    const shouldFlipBelow = top < pad;

    if (shouldFlipBelow) top = triggerRect.bottom + gap;

    portalEl.style.left = `${Math.round(left)}px`;
    portalEl.style.top = `${Math.round(top)}px`;

    if (shouldFlipBelow) portalEl.classList.add("below");
}

function closeTooltipPortal(opts: { immediate?: boolean } = {}): void {
    const state = tooltipPortalOpenState;
    if (!state) return;

    const { immediate = false } = opts;

    const portalEl = state.portalEl;
    const portalContent = portalEl.querySelector(".tooltip-content");
    const contentEl = portalContent instanceof HTMLElement ? portalContent : null;

    const cleanup = (): void => {
        if (tooltipPortalOpenState !== state) return;
        state.wrapperEl.classList.remove("portal-active");
        portalEl.remove();
        tooltipPortalOpenState = null;
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

    window.setTimeout(finish, getTooltipFadeMs(contentEl) + 50);
}

function openTooltipPortal(triggerEl: HTMLElement): void {
    if (!triggerEl.isConnected) return;

    const wrapper = triggerEl.closest(".tooltip");
    if (!(wrapper instanceof HTMLElement)) return;

    const content = wrapper.querySelector(".tooltip-content");
    if (!(content instanceof HTMLElement)) return;

    const existing = tooltipPortalOpenState;
    if (existing?.triggerEl === triggerEl) return;

    closeTooltipPortal({ immediate: true });

    const portalHost = ensureTooltipPortalHost();

    const portalWrapper = document.createElement("span");
    portalWrapper.className = "tooltip portal";

    const portalContent = content.cloneNode(true) as HTMLElement;
    portalWrapper.appendChild(portalContent);

    wrapper.classList.add("portal-active");
    portalHost.appendChild(portalWrapper);

    positionTooltipPortal(triggerEl, portalWrapper);

    tooltipPortalOpenState = {
        wrapperEl: wrapper,
        triggerEl,
        portalEl: portalWrapper,
    };

    requestAnimationFrame(() => {
        if (tooltipPortalOpenState?.portalEl !== portalWrapper) return;
        portalWrapper.classList.add("show");
    });
}

function ensureTooltipPortal(): void {
    if (tooltipPortalInstalled) return;
    tooltipPortalInstalled = true;

    const closestTrigger = (t: EventTarget | null): HTMLElement | null => {
        if (!(t instanceof Element)) return null;
        const el = t.closest(".tooltip-trigger");
        return el instanceof HTMLElement ? el : null;
    };

    const isInsideOpenTooltip = (t: EventTarget | null): boolean => {
        const state = tooltipPortalOpenState;
        if (!state) return false;
        if (!(t instanceof Node)) return false;
        return state.triggerEl.contains(t) || state.portalEl.contains(t);
    };

    const hideOnViewportChange = (): void => {
        if (!tooltipPortalOpenState) return;
        closeTooltipPortal();
    };

    document.addEventListener("mouseover", (ev: MouseEvent) => {
        const trigger = closestTrigger(ev.target);
        if (!trigger) return;
        openTooltipPortal(trigger);
    });

    document.addEventListener("focusin", (ev: FocusEvent) => {
        const trigger = closestTrigger(ev.target);
        if (!trigger) return;
        openTooltipPortal(trigger);
    });

    document.addEventListener("mouseout", (ev: MouseEvent) => {
        if (!tooltipPortalOpenState) return;

        const from = ev.target;
        const to = ev.relatedTarget;

        if (!isInsideOpenTooltip(from)) return;
        if (isInsideOpenTooltip(to)) return;

        closeTooltipPortal();
    });

    document.addEventListener("focusout", (ev: FocusEvent) => {
        if (!tooltipPortalOpenState) return;

        const from = ev.target;
        const to = ev.relatedTarget;

        if (!isInsideOpenTooltip(from)) return;
        if (isInsideOpenTooltip(to)) return;

        closeTooltipPortal();
    });

    document.addEventListener("keydown", (ev: KeyboardEvent) => {
        if (ev.key !== "Escape") return;
        closeTooltipPortal();
    });

    document.addEventListener("scroll", hideOnViewportChange, true);
    window.addEventListener("resize", hideOnViewportChange);

    if (window.visualViewport) {
        window.visualViewport.addEventListener("scroll", hideOnViewportChange);
        window.visualViewport.addEventListener("resize", hideOnViewportChange);
    }
}

/**
 * @param {{ triggerHtml: string; contentHtml: string; isTranslation: boolean }} props
 * @returns {ReactElement}
 */
function TooltipMarkup(props: {
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
 * @param {string} htmlContent - HTML content to transform.
 * @returns {Promise<string>} A promise that resolves to the
 * transformed HTML content with custom tooltip blocks replaced
 * by styled HTML structures.
 */
async function replaceTooltipsImpl(htmlContent: string): Promise<string> {
    ensureTooltipPortal();
    const re = /<tooltip\b[^>]*>[\s\S]*?<\/tooltip>/gi;

    /**
     * @param {Node} n - Node to serialise.
     * @returns {string} Serialised node string.
     */
    const serialise = (n: Node): string => {
        switch (n.nodeType) {
            case 3:
                return esc(n.textContent || "");
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
            : esc(contentEl.textContent || "");

        return render2Mkup(
            <TooltipMarkup
                triggerHtml={triggerHtml}
                contentHtml={contentHtml}
                isTranslation={isTranslation}
            />
        );
    });
}

declare global {
    interface Window {
        ipAdress?: string;
    }
}

/**
 * @returns {void} Binds click handler for email action buttons.
 */
function bindEmailActionsImpl(): void {
    document.addEventListener("click", (e: MouseEvent) => {
        const button = (e.target as Element).closest(".email-action");
        if (!button) return;

        const currentIP = window.ipAdress;
        const emailCard = button.closest(".email-card") as HTMLElement | null;
        const expectedIP = emailCard?.dataset.recipientIp || "";

        if (!currentIP || !expectedIP || currentIP !== expectedIP) {
            const toName =
                emailCard?.querySelector(".email-row:nth-child(2) .email-name")?.textContent?.trim() ||
                "Unknown";

            const toAddr =
                emailCard?.querySelector(".email-row:nth-child(2) .email-address")?.textContent
                    ?.replace(/[()]/g, "")
                    ?.trim() ||
                "unknown";

            alert(`Authentication error: Invalid credentials for ${toName} (${toAddr})`);
            return;
        }

        console.log(`WTH! Who are you?! You performed the email action: ${(button as HTMLElement).dataset.emailAction}`);
    });
}

class MediaStyler {
    private readonly impls: MediaStylerImpls;

    /**
     * @param {MediaStylerImplOverrides} implOverrides - Optional overrides for internal implementations.
     * @returns {MediaStyler} MediaStyler instance.
     */
    constructor(implOverrides: MediaStylerImplOverrides = {}) {
        this.impls = {
            replaceSmsMessages: implOverrides.replaceSmsMessages ?? replaceSmsMessagesImpl,
            replaceEmails: implOverrides.replaceEmails ?? replaceEmailsImpl,
            replaceSVGs: implOverrides.replaceSVGs ?? replaceSVGsImpl,
            replaceImageTags: implOverrides.replaceImageTags ?? replaceImageTagsImpl,
            replaceTooltips: implOverrides.replaceTooltips ?? replaceTooltipsImpl,
            bindEmailActions: implOverrides.bindEmailActions ?? bindEmailActionsImpl,
        };
    }

    /**
     * @param {string} htmlContent - HTML content to transform.
     * @param {string} cssHref - Stylesheet href for SMS rendering.
     * @returns {string} Transformed HTML content with SMS blocks replaced by styled HTML structures.
     */
    @smsEnterBounce({
        durationMs: 520,
        strength: 1,
        viscosity: 0.7,
        cssHref: "../styles/modules/physics.css",
    })
    replaceSmsMessages(htmlContent: string, cssHref: string = "../styles/modules/sms.css"): string {
        return this.impls.replaceSmsMessages(htmlContent, cssHref);
    }

    /**
     * @param {string} htmlContent - HTML content to transform.
     * @param {string} cssHref - Stylesheet href for email rendering.
     * @returns {Promise<string>} Transformed HTML content with email blocks replaced by styled HTML structures.
     */
    replaceEmails(htmlContent: string, cssHref: string = "../styles/modules/email.css"): Promise<string> {
        return this.impls.replaceEmails(htmlContent, cssHref);
    }

    /**
     * @param {Document | Element | string} root - Document/Element to process, or HTML string to wrap.
     * @returns {Promise<void>} A promise that resolves when all SVG images have been replaced with inline SVG content.
     */
    replaceSVGs(root: Document | Element | string = document): Promise<void> {
        return this.impls.replaceSVGs(root);
    }

    /**
     * @param {string} htmlContent - HTML content to transform.
     * @returns {Promise<string>} Transformed HTML content with <chapter-image> tags replaced by styled image structures.
     */
    replaceImageTags(htmlContent: string): Promise<string> {
        return this.impls.replaceImageTags(htmlContent);
    }

    /**
     * @param {string} htmlContent - HTML content to transform.
     * @returns {Promise<string>} Transformed HTML content with tooltip blocks replaced by styled HTML structures.
     */
    replaceTooltips(htmlContent: string): Promise<string> {
        return this.impls.replaceTooltips(htmlContent);
    }

    /**
     * @returns {void} Binds click handler for email action buttons.
     */
    bindEmailActions(): void {
        this.impls.bindEmailActions();
    }
}

export default MediaStyler;