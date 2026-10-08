import * as helpers from "../helpers.ts";

export function ensureStylesheet(cssHref: string): void {
    const present =
        Array.from(document.styleSheets).some(
            (sheet) => (sheet.href || "").includes(cssHref)
        ) ||
        document.querySelector(
            `link[rel="stylesheet"][href="${cssHref}"]`
        ) !== null;

    if (present) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = cssHref;
    document.head.appendChild(link);
}

export function elementText(
    node: ParentNode,
    tag: string
): string {
    return (node.querySelector(tag)?.textContent || "").trim();
}

export function directChildByTag(
    parent: Element,
    tagNames: readonly string[]
): Element | null {
    for (const child of Array.from(parent.children)) {
        if (tagNames.includes(child.tagName.toLowerCase())) return child;
    }

    return null;
}

export function serialiseMixedContent(node: Node): string {
    return Array.from(node.childNodes)
        .map((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                return helpers.escapeHtml(child.textContent || "");
            }

            if (child.nodeType === Node.ELEMENT_NODE) {
                return (child as Element).outerHTML;
            }

            return "";
        })
        .join("")
        .trim();
}
