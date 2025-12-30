import { serialiseMixedContent } from "./mediaStyler.js";

function tokeniseRichLine(html) {
  const container = document.createElement("div");
  container.innerHTML = html;

  const tokens = [];

  container.childNodes.forEach(n => {
    if (n.nodeType === 3) {
      [...n.textContent].forEach(ch => {
        if (ch.trim()) tokens.push(ch);
      });
    } else if (n.nodeType === 1) {
      tokens.push(n.outerHTML);
    }
  });

  return tokens;
}

export function replaceTategaki(htmlContent) {
  const tategakiRegex = /::tg::([\s\S]*?)::\/tg::/g;

  return htmlContent.replace(tategakiRegex, (_match, rawHtml) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");

    const rawLines = Array.from(doc.querySelectorAll("p"))
      .map(p => serialiseMixedContent(p))
      .filter(Boolean)
      .reverse(); // right-to-left

    const tokenLines = rawLines.map(tokeniseRichLine);

    const maxRows = Math.max(...tokenLines.map(l => l.length));

    const readerRoot = document.querySelector(".jp-about") || document.body;
    const fontSize = parseFloat(getComputedStyle(readerRoot).fontSize) || 16;
    const fontFamily = getComputedStyle(readerRoot).fontFamily;
    const fontColor = getComputedStyle(readerRoot).color;

    const charWidth = fontSize + 4;
    const lineHeight = fontSize + 4;
    const lineSpacing = 4;
    const padding = 5;

    const width =
      (charWidth + lineSpacing) * tokenLines.length + padding * 2;
    const height =
      lineHeight * maxRows + padding * 2;

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
  if (container) {
    container.innerHTML = replaceTategaki(container.innerHTML);
  }
});