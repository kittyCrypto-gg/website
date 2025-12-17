export function replaceTategaki(htmlContent) {
  const tategakiRegex = /<tategaki>([\s\S]*?)<\/tategaki>/gi;

  return htmlContent.replace(tategakiRegex, (match, innerHtml) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(innerHtml, "text/html");

    const pLines = Array.from(doc.querySelectorAll("p"))
      .map(p => (p.textContent || "").trim())
      .filter(Boolean);

    const fallbackText = (doc.body?.textContent || "").trim();
    const lines = (pLines.length ? pLines : fallbackText.split(/\r?\n+/))
      .map(s => s.trim())
      .filter(Boolean)
      .reverse(); // right-to-left columns

    if (lines.length === 0) return "";

    const maxLength = Math.max(...lines.map(line => line.length));

    const readerRoot = document.querySelector(".jp-about") || document.body;
    const cs = getComputedStyle(readerRoot);

    const fontSize = parseFloat(cs.fontSize) || 16;
    const fontColour = cs.color || "#000";
    const fontFamily = cs.fontFamily || "serif";

    const charWidth = fontSize + 4;
    const lineHeight = fontSize + 4;
    const padding = 5;
    const lineSpacing = 4;

    const width = (charWidth + lineSpacing) * lines.length + padding * 2;
    const height = lineHeight * maxLength + padding * 2;

    let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg" style="overflow: visible" viewBox="-${padding} -${padding} ${width} ${height}">`;

    lines.forEach((line, column) => {
      Array.from(line).forEach((char, row) => {
        const x = column * (charWidth + lineSpacing) + padding;
        const y = row * lineHeight + fontSize + padding;

        svg += `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="${fontFamily}" fill="${fontColour}" writing-mode="tb" glyph-orientation-vertical="0">${escapeXml(char)}</text>`;
      });
    });

    svg += `</svg>`;
    return `<div class="tategaki-container">${svg}</div>`;
  });
}

function escapeXml(s) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}