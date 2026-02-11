import { serialiseMixedContent } from "./mediaStyler";

/**
 * @param {Node} node
 * @returns {node is Text}
 */
function isTextNode(node: Node): node is Text {
    return node.nodeType === Node.TEXT_NODE;
}

/**
 * @param {Node} node
 * @returns {node is Element}
 */
function isElementNode(node: Node): node is Element {
    return node.nodeType === Node.ELEMENT_NODE;
}

/**
 * @param {string} html
 * @returns {string[]}
 */
function tokeniseRichLine(html: string): string[] {
    const container = document.createElement("div");
    container.innerHTML = html;

    const tokens: string[] = [];

    container.childNodes.forEach((n) => {
        if (isTextNode(n)) {
            const text = n.textContent || "";
            for (const ch of Array.from(text)) {
                if (ch.trim()) tokens.push(ch);
            }
            return;
        }

        if (isElementNode(n)) {
            tokens.push(n.outerHTML);
        }
    });

    return tokens;
}

/**
 * @param {string} htmlContent
 * @returns {string}
 */
export function replaceTategaki(htmlContent: string): string {
    const tategakiRegex = /::tg::([\s\S]*?)::\/tg::/g;

    return htmlContent.replace(tategakiRegex, (_match: string, rawHtml: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, "text/html");

        const rawLines = Array.from(doc.querySelectorAll("p"))
            .map((p) => serialiseMixedContent(p))
            .filter((v) => Boolean(v))
            .reverse(); // right-to-left

        const tokenLines = rawLines.map(tokeniseRichLine);

        const maxRows =
            tokenLines.length > 0 ? Math.max(...tokenLines.map((l) => l.length)) : 0;

        const readerRoot = (document.querySelector(".jp-about") as Element | null) || document.body;
        const readerStyles = getComputedStyle(readerRoot);

        const fontSize = parseFloat(readerStyles.fontSize) || 16;
        const charWidth = fontSize + 4;
        const lineHeight = fontSize + 4;
        const lineSpacing = 4;
        const padding = 5;

        const width = (charWidth + lineSpacing) * tokenLines.length + padding * 2;
        const height = lineHeight * maxRows + padding * 2;

        let svgContent = `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="${width}"
                height="${height}"
                viewBox="0 0 ${width} ${height}">
        `;

        tokenLines.forEach((tokens, column) => {
            tokens.forEach((token, row) => {
                svgContent += `
                <foreignObject
                    x="${column * (charWidth + lineSpacing) + padding}"
                    y="${row * lineHeight + padding}"
                    width="${charWidth}"
                    height="${lineHeight}">
                    <div class="tg-token">
                    ${token}
                    </div>
                </foreignObject>
            `;
            });
        });

        svgContent += `</svg>`;

        return `<div class="tategaki-container">${svgContent}</div>`;
    });
}

document.addEventListener("DOMContentLoaded", () => {
    const container = document.querySelector(".jp-about");
    if (!container) return;

    container.innerHTML = replaceTategaki(container.innerHTML);
});