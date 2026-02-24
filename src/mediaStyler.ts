import { smsEnterBounce } from "./physics.ts";

const themes: Record<string, unknown> = {};

/**
 * @param {string} url - URL to themes JSON.
 * @returns {Promise<void>} This function loads theme data from a specified JSON URL and populates the global `themes` object with the retrieved data. It fetches the JSON data, checks for a successful response, and then parses the JSON content. The existing keys in the `themes` object are cleared before populating it with the new data to ensure that only the latest themes are available. If the fetch operation fails or if the response is not successful, it throws an error with an appropriate message.
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
 * @returns {string} Theme name associated with the given recipient address. This function takes an email address as input and checks it against the loaded themes to determine if there is a matching theme for that address. It converts the input address to lowercase and compares it against the list of addresses associated with each theme, also in lowercase, to ensure a case-insensitive match. If a matching theme is found, it returns the name of that theme; otherwise, it returns an empty string, indicating that no specific theme is associated with the provided address.
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
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

/**
 * @param {Node} node - Node whose children are serialised as mixed content.
 * @returns {string} A string representation of the mixed content of a node, where text nodes are escaped for HTML and element nodes are included as their outer HTML. This function iterates through the child nodes of the given node, checks the type of each child, and processes it accordingly. Text nodes (nodeType 3) have their text content escaped to prevent HTML injection, while element nodes (nodeType 1) are included in the output as their full HTML representation. Other types of nodes are ignored. The resulting strings from all child nodes are concatenated together and trimmed of whitespace before being returned. This is useful for preserving the structure of rich content while ensuring that any text is safely escaped for display in an HTML context.
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
 * @returns {boolean | Element | null} True if a stylesheet with the given href substring is found, or the matching link element, or null if not found. This function checks if a stylesheet with a specific href substring is already present in the document. It first looks through the document's stylesheets to see if any of them have an href that includes the specified substring. If it finds one, it returns true. If not, it then queries the document for a link element with a rel of "stylesheet" and an href that exactly matches the provided substring. If such an element is found, it returns that element; otherwise, it returns null. This is useful for determining whether a particular stylesheet has already been loaded or is present in the document before attempting to add it again.
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
 * @returns {string} Text content of the first matching element for the given tag within the specified node, trimmed of whitespace. This function takes a parent node and a tag name as input, queries for the first element that matches the tag within that node, and returns its text content. If no matching element is found, it returns an empty string. The returned text is also trimmed to remove any leading or trailing whitespace. This is useful for extracting specific pieces of text content from structured data, such as XML or HTML documents, based on tag names.
 */
function getText(node: ParentNode, tag: string): string {
    return (node.querySelector(tag)?.textContent || "").trim();
}

type Escaper = (s: string | null | undefined) => string;

/**
 * @param {ParentNode} root - Root node to search within.
 * @param {string} selector - Selector for rich content nodes.
 * @param {Escaper} escFn - Escaper (kept for signature parity).
 * @returns {string[]} An array of string representations of rich content nodes that match the given selector within the specified root node. This function queries the root node for all elements that match the provided selector, then processes each matching element to extract its mixed content as a string. The mixed content is serialised using the `serialiseMixedContent` function, which handles both text and element nodes appropriately. The resulting array contains the serialised content of all matching nodes, with any empty or falsy values filtered out. This is useful for extracting and processing specific pieces of rich content from a larger document structure based on CSS selectors.
 */
function mapRichContent(root: ParentNode, selector: string, escFn: Escaper): string[] {
    void escFn;
    return Array.from(root.querySelectorAll(selector))
        .map((n) => serialiseMixedContent(n))
        .filter(Boolean);
}

/**
 * @param {Element} sig - Signature element.
 * @param {Escaper} escFn - Escaper function.
 * @returns {string} A string representation of an email signature constructed from the provided signature element and escaped using the given escaper function. This function extracts various pieces of information from the signature element, such as name, company, address, telephone, email address, logo, positions, and disclaimers. It uses the escaper function to ensure that all extracted text is safely escaped for HTML insertion. The function then constructs an HTML structure for the email signature, including a logo if provided, and formats the extracted information into a visually appealing layout. If no relevant information is found in the signature element, it returns an empty string.
 */
function parseSignature(sig: Element, escFn: Escaper): string {
    const t = (q: string): string => (sig.querySelector(q)?.textContent || "").trim();

    const name = escFn(t("name"));
    const company = escFn(t("company"));
    const address = escFn(t("address"));
    const telephone = escFn(t("telephone"));
    const emailAddress = escFn(t("emailAddress"));
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

    const logoHtml = logo
        ? `
            <div class="email-signature-logo">
                <img
                    src="${logo}"
                    alt="${company || "Company logo"}"
                    class="email-signature-logo-img"
                />
            </div>
        `
        : "";

    const lines = [
        name && `<strong class="email-signature-name">${name}</strong>`,
        ...positions.map((p) => `<span class="email-signature-position">${p}</span>`),
        company && `<span class="email-signature-company">${company}</span>`,
        address && `<span class="email-signature-address">${address}</span>`,
        telephone && `<span class="email-signature-telephone">Tel: ${telephone}</span>`,
        emailAddress && `<span class="email-signature-email">Email: ${emailAddress}</span>`,
    ].filter(Boolean);

    const disclaimerHtml = disclaimers.length
        ? `
            <div class="email-signature-disclaimer">
                ${disclaimers.map((d) => `<div class="email-signature-disclaimer-line">${d}</div>`).join("")}
            </div>
        `
        : "";

    return `
        <hr class="email-signature-sep" />
        <div class="email-signature">
            ${logoHtml}
            <div class="email-signature-text">
                ${lines.join("<br/>")}
                ${disclaimerHtml}
            </div>
        </div>
    `;
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
 * @param {string} htmlContent - HTML content to transform.
 * @param {string} cssHref - Stylesheet href for SMS rendering.
 * @returns {string} Transformed HTML content with SMS messages replaced by styled HTML structures. This function takes raw HTML content and a CSS stylesheet href as input, checks if the stylesheet is already present in the document, and if not, it adds it to the document head. It then uses a regular expression to find all message blocks in the HTML content that match a specific structure (with a type of "in" or "out"). For each matching block, it parses the XML structure to extract the nickname, content, and timestamp of the message. The content is processed as mixed content to preserve any rich formatting. Finally, it constructs a new HTML structure for each message, applying appropriate classes based on the message type (incoming or outgoing), and replaces the original message blocks in the input HTML with these new structures. The resulting HTML string is returned, ready for rendering with the associated styles.
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

        const nickname = esc(raw(msg, "nickname"));

        const contentNode = msg.querySelector("content");
        const content = contentNode ? serialiseMixedContent(contentNode) : "";

        const timestamp = esc(raw(msg, "timestamp"));

        return `
            <div class="message-wrapper ${type} show">
                <div class="message ${type}">
                    <div class="nickname-strip">${nickname}</div>
                    <div class="message-text">${content}</div>
                    <div class="timestamp ${type}">${timestamp}</div>
                </div>
            </div>
        `;
    });
}

/**
 * @param {string} htmlContent - HTML content to transform.
 * @param {string} cssHref - Stylesheet href for email rendering.
 * @returns {Promise<string>} A promise that resolves to the transformed HTML content with email blocks replaced by styled HTML structures. This function processes the input HTML content to identify and replace custom email blocks with a structured and styled representation suitable for rendering as email messages. It first checks if the specified CSS stylesheet for email rendering is already included in the document, and if not, it adds it to the document head. The function then uses a regular expression to find all email blocks in the input HTML, parses each block as XML to extract relevant information such as sender, recipient, subject, timestamp, and content. It constructs a new HTML structure for each email, applying appropriate classes and formatting based on the extracted data. The original email blocks in the input HTML are replaced with these new structures, and the resulting HTML string is returned as a promise.
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
     * @returns {string} A string representation of the email content extracted from the given email XML element. This function looks for a "content" child element within the provided email node and processes its child nodes to construct the email's content as an HTML string. It handles both text nodes and element nodes, escaping text content for HTML safety and including element nodes as their outer HTML. If no content element is found, it returns an empty string. This allows for rich content within the email to be preserved while ensuring that any text is safely escaped for display in an HTML context.
     */
    const buildContentHtml = (emailNode: Element): string => {
        const contentEl = emailNode.querySelector("content");
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

        const fromName = fromNameEl
            ? serialiseMixedContent(fromNameEl)
            : esc(from ? raw(from, "name") : "");

        const fromAddr = esc(from ? raw(from, "addr") : "");

        const toName = toNameEl
            ? serialiseMixedContent(toNameEl)
            : esc(to ? raw(to, "name") : "");

        const toAddr = esc(to ? raw(to, "addr") : "");

        const themeClass = getTheme(toAddr);

        const recipientIp = raw(email, "toIp") || "";
        const timestamp = esc(raw(email, "timestamp"));
        const subject = esc(raw(email, "subject"));

        const contentHtml = buildContentHtml(email);

        return `
        <div class="email-wrapper show">
            <div class="email-card${themeClass ? ` ${themeClass}` : ""}"
                data-recipient-ip="${esc(recipientIp)}">
            <div class="email-header">
                <div class="email-meta">
                <div class="email-row">
                    <span class="email-label">From</span>
                    <span class="email-value">
                        <span class="email-name">${fromName}</span>
                        <span class="email-address">(${fromAddr})</span>
                    </span>
                </div>

                <div class="email-row">
                    <span class="email-label">To</span>
                    <span class="email-value">
                        <span class="email-name">${toName}</span>
                        <span class="email-address">(${toAddr})</span>
                    </span>
                </div>

                <div class="email-row email-subject-row">
                    <span class="email-label">Subject</span>
                    <span class="email-subject-text">${subject}</span>
                    <span class="email-timestamp">${timestamp}</span>
                </div>
                </div>

                <div class="email-actions-bar" role="toolbar">
                <div class="email-actions">
                    <button class="email-action" data-email-action="reply">↩️</button>
                    <button class="email-action" data-email-action="forward">➡️</button>
                    <button class="email-action" data-email-action="flag">🚩</button>
                    <button class="email-action" data-email-action="archive">🗄️</button>
                    <button class="email-action" data-email-action="delete">🗑️</button>
                </div>
                </div>
            </div>

            <div class="email-content">${contentHtml}</div>
            </div>
        </div>
        `;
    });
}

/**
 * @param {Document | Element | string} root - Document/Element to process, or HTML string to wrap.
 * @returns {Promise<void>} A promise that resolves when all SVG images within the specified root have been replaced with their inline SVG content. This function takes either a Document, an Element, or a string of HTML as input. If a string is provided, it creates a temporary wrapper element to parse the HTML. It then searches for all <img> elements within the root that have a source ending with ".svg". For each matching image, it fetches the SVG content from the source URL, parses it as XML, and replaces the <img> element with the inline SVG content. The function also preserves any classes, styles, width, and height attributes from the original <img> element and applies them to the new inline SVG element. If any errors occur during fetching or processing of the SVGs, they are logged to the console, but the function continues processing other images.
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
 * @param {string} htmlContent
 * @returns {Promise<string>}
 */
async function replaceImageTagsImpl(htmlContent: string): Promise<string> {
    const re = /<chapter-image\b[^>]*?(?:\/>|>[\s\S]*?<\/chapter-image>)/gi;

    /**
     * @param {string} value
     * @returns {string}
     */
    const escAttr = (value: string): string =>
        (value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("\"", "&quot;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("'", "&#39;");

    /**
     * @param {string} url
     * @param {string} alt
     * @returns {string}
     */
    const buildImageHtml = (url: string, alt: string): string => {
        const safeUrl = escAttr(url.trim());
        const safeAlt = escAttr(alt.trim());

        return `
            <div class="chapter-image-container">
                <img
                src="${safeUrl}"
                alt="${safeAlt}"
                class="chapter-image"
                loading="lazy"
                onerror="this.onerror=null; this.src='/path/to/fallback-image.png'; this.alt='Image not found';"
                />
            </div>
        `;
    };

    return htmlContent.replace(re, (block: string) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const imageEl = doc.querySelector("chapter-image");
        if (!imageEl) return block;

        const url = (imageEl.getAttribute("url") || imageEl.getAttribute("src") || "").trim();
        if (!url) return block;

        const altAttr = (imageEl.getAttribute("alt") || "").trim();
        const altFromText = (imageEl.textContent || "").trim();
        const alt = altAttr || altFromText || "Chapter Image";

        return buildImageHtml(url, alt);
    });
}

/**
 * @param {string} htmlContent - HTML content to transform.
 * @returns {Promise<string>} A promise that resolves to the
 * transformed HTML content with custom tooltip blocks replaced
 * by styled HTML structures.
 */
async function replaceTooltipsImpl(htmlContent: string): Promise<string> {
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

        const contentClass = `tooltip-content${isTranslation ? " translation" : ""}`;

        return `
            <span class="tooltip">
                <span class="tooltip-trigger">${triggerHtml}</span>
                <span class="${contentClass}">${contentHtml}</span>
            </span>
        `;
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