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

        /* 🔐 Joke authentication hook */
        const recipientIp = getText(email, "toIp") || "";

        const timestamp = esc(getText(email, "timestamp"));
        const subject = esc(getText(email, "subject"));

        const getInnerXml = (node, tag) => {
            const el = node.querySelector(tag);
            if (!el) return "";
            return Array.from(el.childNodes).map(n => new XMLSerializer().serializeToString(n)).join("");
        };

        const contentHtml = getInnerXml(email, "content");

        return `
            <div class="email-wrapper show">
                <div class="email-card${themeClass ? ` ${themeClass}` : ""}" data-recipient-ip="${esc(recipientIp)}">
                <div class="email-header">
                    <div class="email-meta">
                    <div class="email-row">
                        <span class="email-label">From</span>
                        <span class="email-value">${fromName}<span class="email-address">(${fromAddr})</span></span>
                    </div>

                    <div class="email-row">
                        <span class="email-label">To</span>
                        <span class="email-value">${toName}<span class="email-address">(${toAddr})</span></span>
                    </div>

                    <div class="email-row email-subject-row">
                        <span class="email-label">Subject</span>
                        <span class="email-subject-text">${subject}</span>
                        <span class="email-timestamp">${timestamp}</span>
                    </div>
                    </div>

                    <!-- Actions: header section, not a “meta row” -->
                    <div class="email-actions-bar" role="toolbar" aria-label="Email actions">
                    <div class="email-actions" aria-label="Action buttons">
                        <button class="email-action" type="button" data-email-action="reply" aria-label="Reply" title="Reply">↩️</button>
                        <button class="email-action" type="button" data-email-action="forward" aria-label="Forward" title="Forward">➡️</button>
                        <button class="email-action" type="button" data-email-action="flag" aria-label="Flag" title="Flag">🚩</button>
                        <button class="email-action" type="button" data-email-action="mark-unread" aria-label="Mark unread" title="Mark unread">✉️</button>
                        <button class="email-action" type="button" data-email-action="archive" aria-label="Archive" title="Archive">🗄️</button>
                        <button class="email-action" type="button" data-email-action="delete" aria-label="Delete" title="Delete">🗑️</button>
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