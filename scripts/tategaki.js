export function replaceTategaki(htmlContent) {
  const tategakiRegex = /::tg::([\s\S]*?)::\/tg::/g;

  return htmlContent.replace(tategakiRegex, (match, rawHtml) => {
    // Extract only the text within <p> tags
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const lines = Array.from(doc.querySelectorAll('p')).map(p => p.textContent.trim());
    lines.reverse(); // For right-to-left display

    const maxLength = Math.max(...lines.map(line => line.length));
    const readerRoot = document.querySelector('.jp-about') || document.body;
    const fontSize = parseFloat(getComputedStyle(readerRoot).fontSize) || 16;
    const fontColor = getComputedStyle(readerRoot).color;
    const fontFamily = getComputedStyle(readerRoot).fontFamily;
    const charWidth = fontSize + 4;
    const lineHeight = fontSize + 4;
    const padding = 5;
    // NEW: Add line spacing (adjust this value to increase or decrease spacing)
    const lineSpacing = 4; // Increase this to add more space between lines
    let svgContent = `<svg
                    width="${(charWidth + lineSpacing) * lines.length + padding * 2}"
                    height="${lineHeight * maxLength + padding * 2}"
                    xmlns="http://www.w3.org/2000/svg"
                    style="overflow: visible"
                    viewBox="-${padding} -${padding} ${(charWidth + lineSpacing) * lines.length + padding * 2} ${lineHeight * maxLength + padding * 2}"
                  >`;
    lines.forEach((line, column) => {
      [...line].forEach((char, row) => {
        svgContent += `
                        <text 
                          x="${column * (charWidth + lineSpacing) + padding}" 
                          y="${row * lineHeight + fontSize + padding}" 
                          font-size="${fontSize}" 
                          font-family="${fontFamily}"
                          fill="${fontColor}"
                          writing-mode="tb"
                          glyph-orientation-vertical="0">
                          ${char}
                        </text>`;
      });
    });

    svgContent += `</svg>`;
    return `<div class="tategaki-container">${svgContent}</div>`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('.jp-about');
  if (container) {
    container.innerHTML = replaceTategaki(container.innerHTML);
  }
});
