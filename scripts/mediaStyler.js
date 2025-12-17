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

        const timestamp = esc(getText(email, "timestamp"));
        const subject = esc(getText(email, "subject"));

        // content is plain text for now (safe). If you later want <br> etc, we can preserve markup.
        const content = esc(getText(email, "content"));

        return `
            <div class="email-wrapper show">
                <div class="email-card">
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
                </div>

                <div class="email-content">${content}</div>
                </div>
            </div>
        `;
    });
}