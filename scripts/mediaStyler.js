export function replaceSmsMessages(htmlContent, cssHref = "../styles/sms.css") {
    const hasCss =
        Array.from(document.styleSheets).some(s => (s.href || "").includes(cssHref)) ||
        document.querySelector(`link[rel="stylesheet"][href="${cssHref}"]`);

    if (!hasCss) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
    }

    const esc = (s) =>
        (s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");

    const get = (doc, tag) => (doc.querySelector(tag)?.textContent || "").trim();

    const re = /<message\b[^>]*\btype=["'](in|out)["'][^>]*>[\s\S]*?<\/message>/gi;

    return htmlContent.replace(re, (block, typeRaw) => {
        const type = (typeRaw || "").trim().toLowerCase();
        if (type !== "in" && type !== "out") return block;

        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const msg = doc.querySelector("message");
        if (!msg) return block;

        const nickname = esc(get(msg, "nickname"));
        const content = esc(get(msg, "content"));
        const timestamp = esc(get(msg, "timestamp"));

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
const themes = {
    "negi_miku39@yahoo.co.jp": "miku",
};

function renderSignatureFromXml(sig, esc) {
    const t = (q) => (sig.querySelector(q)?.textContent || "").trim();

    const name = esc(t("name"));
    const company = esc(t("company"));
    const address = esc(t("address"));
    const telephone = esc(t("telephone"));
    const email = esc(t("email"));
    const logo = esc(t("logo"));

    const positions = Array.from(sig.querySelectorAll("position"))
        .map(p => esc(p.textContent || "").trim())
        .filter(Boolean);

    const disclaimers = Array.from(sig.querySelectorAll("disclaimer"))
        .map(d => esc(d.textContent || "").trim())
        .filter(Boolean);

    const hasAny =
        name ||
        positions.length ||
        company ||
        address ||
        telephone || sdf
    email ||
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
                style="width:clamp(110px, 28cqi, 180px); height:auto;"
                />
            </div>
        `
        : "";

    const lines = [
        name && `<strong>${name}</strong>`,
        ...positions.map(p => `<span>${p}</span>`),
        company,
        address,
        telephone && `Tel: ${telephone}`,
        email && `Email: ${email}`,
    ].filter(Boolean);

    const disclaimerHtml = disclaimers.length
        ? `
            <div class="email-signature-disclaimer"
                style="margin-top:10px; font-size:0.75em; opacity:0.75;">
                ${disclaimers.join("<br/>")}
            </div>
        `
        : "";

    return `
        <hr class="email-signature-sep"
            style="margin:16px 0; border:none; border-top:1px solid rgba(0,0,0,0.20);" />
        <div class="email-signature"
            style="display:flex; align-items:flex-start; gap:14px;">
        ${logoHtml}
            <div class="email-signature-text"
                style="font-size:0.9em; line-height:1.5; text-align:left;">
                ${lines.join("<br/>")}
                ${disclaimerHtml}
            </div>
        </div>
    `;
}


export function replaceEmails(htmlContent, cssHref = "../styles/email.css") {
    const hasCss =
        Array.from(document.styleSheets).some(s => (s.href || "").includes(cssHref)) ||
        document.querySelector(`link[rel="stylesheet"][href="${cssHref}"]`);

    if (!hasCss) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
    }

    const esc = (s) =>
        (s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");

    const getText = (node, tag) => (node.querySelector(tag)?.textContent || "").trim();

    const buildContentHtml = (emailNode) => {
        const contentEl = emailNode.querySelector("content");
        if (!contentEl) return "";

        const serialise = (n) => new XMLSerializer().serializeToString(n);

        return Array.from(contentEl.childNodes)
            .map((n) => {
                if (n.nodeType === 1) {
                    const tag = n.tagName.toLowerCase();
                    if (tag === "signature") return renderSignatureFromXml(n, esc);
                    return serialise(n);
                }
                if (n.nodeType === 3) return esc(n.textContent || "");
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

        const fromName = esc(from ? getText(from, "name") : "");
        const fromAddr = esc(from ? getText(from, "addr") : "");
        const toName = esc(to ? getText(to, "name") : "");
        const toAddr = esc(to ? getText(to, "addr") : "");

        const themeClass = themes[toAddr.toLowerCase()] ?? "";
        const recipientIp = getText(email, "toIp") || "";
        const timestamp = esc(getText(email, "timestamp"));
        const subject = esc(getText(email, "subject"));

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
                    <button class="email-action" data-email-action="mark-unread">✉️</button>
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

export async function inlineSvgs(root = document) {
    if (typeof root === "string") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = root;
        root = wrapper;
    }

    if (!(root instanceof Document || root instanceof Element)) {
        return;
    }

    const images = Array.from(root.querySelectorAll("img"));

    for (const img of images) {
        const src = img.getAttribute("src");
        if (!src || !src.endsWith(".svg")) continue;

        try {
            const res = await fetch(src);
            if (!res.ok) continue;

            const svgText = await res.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, "image/svg+xml");
            const svg = doc.querySelector("svg");
            if (!svg) continue;

            // Preserve classes
            if (img.className) svg.classList.add(...img.classList);

            // Preserve inline styles
            if (img.getAttribute("style")) {
                svg.setAttribute("style", img.getAttribute("style"));
            }

            // Preserve width/height attrs if present
            if (img.getAttribute("width")) svg.setAttribute("width", img.getAttribute("width"));
            if (img.getAttribute("height")) svg.setAttribute("height", img.getAttribute("height"));

            img.replaceWith(svg);
        } catch {
            /* silently fail */
        }
    }
}

function bindEmailActions() {
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

        // Joke passes authentication
        const action = button.dataset.emailAction;
        console.log(`WTH! Who are you?! You performed the email action: ${action}`);
    });
}

bindEmailActions();