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