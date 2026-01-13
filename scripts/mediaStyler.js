const themes = {};

async function loadThemes(url = "../styles/themes.json") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load themes from ${url}`);

    const data = await res.json();

    for (const key of Object.keys(themes)) delete themes[key];
    for (const [key, value] of Object.entries(data)) themes[key] = value;
}

function getTheme(addr) {
    const a = addr.toLowerCase();
    for (const [theme, addrs] of Object.entries(themes)) {
        if (addrs.some(x => x.toLowerCase() === a)) {
            return theme;
        }
    }
    return "";
}

function esc(s) {
    return (s || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function serialiseMixedContent(node) {
    return Array.from(node.childNodes)
        .map(n => {
            if (n.nodeType === 3) return esc(n.textContent || "");
            if (n.nodeType === 1) return n.outerHTML;
            return "";
        })
        .join("")
        .trim();
}

function hassCss(cssHref) {
    return (
        Array.from(document.styleSheets).some(s => (s.href || "").includes(cssHref)) ||
        document.querySelector(`link[rel="stylesheet"][href="${cssHref}"]`)
    );
}

function getText(node, tag) {
    return (node.querySelector(tag)?.textContent || "").trim();
}

function mapRichContent(root, selector, esc) {
    return Array.from(root.querySelectorAll(selector))
        .map(n => serialiseMixedContent(n))
        .filter(Boolean);
}

function parseSignature(sig, esc) {
    const t = (q) => (sig.querySelector(q)?.textContent || "").trim();

    const name = esc(t("name"));
    const company = esc(t("company"));
    const address = esc(t("address"));
    const telephone = esc(t("telephone"));
    const emailAddress = esc(t("emailAddress"));
    const logo = (t("logo") || "").trim();

    const positions = mapRichContent(sig, "position", esc);
    const disclaimers = mapRichContent(sig, "disclaimer", esc);

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
        ...positions.map(p => `<span class="email-signature-position">${p}</span>`),
        company && `<span class="email-signature-company">${company}</span>`,
        address && `<span class="email-signature-address">${address}</span>`,
        telephone && `<span class="email-signature-telephone">Tel: ${telephone}</span>`,
        emailAddress && `<span class="email-signature-email">Email: ${emailAddress}</span>`
    ].filter(Boolean);

    const disclaimerHtml = disclaimers.length
        ? `
            <div class="email-signature-disclaimer">
                ${disclaimers.map(d => `<div class="email-signature-disclaimer-line">${d}</div>`).join("")}
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

export function replaceSmsMessages(htmlContent, cssHref = "../styles/sms.css") {
    if (!hassCss(cssHref)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
    }

    const raw = (doc, tag) => getText(doc, tag);

    const re = /<message\b[^>]*\btype=["'](in|out)["'][^>]*>[\s\S]*?<\/message>/gi;

    return htmlContent.replace(re, (block, typeRaw) => {
        const type = (typeRaw || "").trim().toLowerCase();
        if (type !== "in" && type !== "out") return block;

        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const msg = doc.querySelector("message");
        if (!msg) return block;

        const nickname = esc(raw(msg, "nickname"));

        const contentNode = msg.querySelector("content");
        const content = contentNode
            ? serialiseMixedContent(contentNode)
            : "";

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

export async function replaceEmails(htmlContent, cssHref = "../styles/email.css") {
    if (!hassCss(cssHref)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
    }

    if (Object.keys(themes).length === 0) {
        try {
            await loadThemes();
        } catch (err) {
            console.error("Failed to load themes:", err);
        }
    }

    const raw = (doc, tag) => getText(doc, tag);

    const buildContentHtml = (emailNode) => {
        const contentEl = emailNode.querySelector("content");
        if (!contentEl) return "";

        return Array.from(contentEl.childNodes)
            .map(n => {
                if (n.nodeType === 1) {
                    if (n.tagName.toLowerCase() === "signature") {
                        return parseSignature(n, esc);
                    }
                    return n.outerHTML;
                }
                if (n.nodeType === 3) {
                    return esc(n.textContent || "");
                }
                return "";
            })
            .join("");
    };

    const re = /<email\b[^>]*>[\s\S]*?<\/email>/gi;

    return htmlContent.replace(re, (block) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const email = doc.querySelector("email");
        if (!email) return block;

        const from = email.querySelector("from");
        const to = email.querySelector("to");

        const fromName = esc(from ? raw(from, "name") : "");
        const fromAddr = esc(from ? raw(from, "addr") : "");
        const toName = esc(to ? raw(to, "name") : "");
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
                    <span class="email-value">${fromName}
                    <span class="email-address">(${fromAddr})</span>
                    </span>
                </div>

                <div class="email-row">
                    <span class="email-label">To</span>
                    <span class="email-value">${toName}
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

export async function replaceSVGs(root = document) {
    if (typeof root === "string") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = root;
        root = wrapper;
    }

    if (!(root instanceof Document || root instanceof Element)) return;

    const images = Array.from(root.querySelectorAll("img"));

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
            if (img.getAttribute("style")) svg.setAttribute("style", img.getAttribute("style"));
            if (img.getAttribute("width")) svg.setAttribute("width", img.getAttribute("width"));
            if (img.getAttribute("height")) svg.setAttribute("height", img.getAttribute("height"));

            img.replaceWith(svg);
        } catch (err) {
            console.warn("inlineSvgs failed:", src, err);
        }
    }
}

export async function replaceTooltips(htmlContent) {
    const re = /<tooltip\b[^>]*>[\s\S]*?<\/tooltip>/gi;

    const serialise = (n) =>
        n.nodeType === 3
            ? esc(n.textContent || "")
            : n.nodeType === 1
                ? new XMLSerializer().serializeToString(n)
                : "";

    return htmlContent.replace(re, (block) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const tooltip = doc.querySelector("tooltip");
        if (!tooltip) return block;

        const contentEl = Array.from(tooltip.children)
            .find(n => n.tagName.toLowerCase() === "content");
        if (!contentEl) return block;

        const isHtml = contentEl.hasAttribute("html");

        const triggerHtml = Array.from(tooltip.childNodes)
            .filter(n => n !== contentEl)
            .map(serialise)
            .join("")
            .trim();

        if (!triggerHtml) return block;

        const contentHtml = isHtml
            ? Array.from(contentEl.childNodes)
                .map(n => new XMLSerializer().serializeToString(n))
                .join("")
            : esc(contentEl.textContent || "");

        return `
            <span class="tooltip">
                <span class="tooltip-trigger">${triggerHtml}</span>
                <span class="tooltip-content">${contentHtml}</span>
            </span>
        `;
    });
}

export function bindEmailActions() {
    document.addEventListener("click", (e) => {
        const button = e.target.closest(".email-action");
        if (!button) return;

        const currentIP = window.ipAdress;
        const emailCard = button.closest(".email-card");
        const expectedIP = emailCard?.dataset.recipientIp || "";

        if (!currentIP || !expectedIP || currentIP !== expectedIP) {
            const toName =
                emailCard?.querySelector(".email-row:nth-child(2) .email-value")?.childNodes[0]?.textContent?.trim() || "Unknown";

            const toAddr =
                emailCard?.querySelector(".email-row:nth-child(2) .email-address")?.textContent?.replace(/[()]/g, "") || "unknown";

            alert(`Authentication error: Invalid credentials for ${toName} (${toAddr})`);
            return;
        }

        console.log(`WTH! Who are you?! You performed the email action: ${button.dataset.emailAction}`);
    });
}