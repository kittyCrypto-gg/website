class Tategaki {
    static wrap(content) {
        return `<div class="tategaki">${content}</div>`;
    }

    static getCSS() {
        return `
            .tategaki {
            writing-mode: vertical-rl;
            text-orientation: mixed;
            line-height: 1.8;
            }

            ruby {
            ruby-position: side;
            }

            rt {
            font-size: 0.5em;
            line-height: 1;
            }

            .manual-ruby {
            display: inline-flex;
            flex-direction: row-reverse;
            align-items: center;
            justify-content: flex-start;
            writing-mode: vertical-rl;
            vertical-align: top;
            }

            .manual-base {
            display: inline-block;
            width: 1em;
            height: 1em;
            line-height: 1;
            text-align: center;
            position: relative;
            }

            .manual-rt-column {
            display: flex;
            flex-direction: column;
            justify-content: center;
            font-size: 0.5em;
            line-height: 1;
            margin-left: 0.1em;
            }

            .manual-rt {
            writing-mode: horizontal-tb;
            white-space: nowrap;
            text-align: left;
            }

            #output {
            display: flex;
            flex-direction: row-reverse; /* stack tategaki paragraphs right to left */
            gap: 1em;
            }
        `;
    }

}

class Furigana {
    static render(base, reading, maxEm = null) {
        if (maxEm === null) {
            return `<ruby>${base}<rt>${reading}</rt></ruby>`;
        }

        const widthEm = Furigana._estimateEmWidth(reading);

        if (widthEm <= maxEm) {
            return `<ruby>${base}<rt>${reading}</rt></ruby>`;
        }

        const blocksNeeded = Math.ceil(widthEm / maxEm) - 1;   // 2em reading / 1em cap ➜ 2 blocks plus base
        const slices = Furigana._splitReading(reading, blocksNeeded);

        let html = base;
        for (const slice of slices) {
            html = `<ruby>${html}<rt>${slice}</rt></ruby>`;
        }
        return html;   // nested ruby structure
    }

    static _estimateEmWidth(text) {
        let w = 0;
        for (const ch of [...text]) {
            const cp = ch.codePointAt(0);
            if (
                (cp >= 0x3040 && cp <= 0x30FF) ||   // hiragana / katakana
                cp < 0x2E80                        // latin / punctuation
            ) {
                w += 0.5;                           // half-width
            } else {
                w += 1;                             // full-width (CJK, etc.)
            }
        }
        return w;
    }

    static _splitReading(text, parts) {
        const chars = [...text];
        const sizes = Array(parts).fill(Math.floor(chars.length / parts));
        for (let i = 0; i < chars.length % parts; i++) sizes[i]++;

        const out = [];
        let idx = 0;
        for (const n of sizes) {
            out.push(chars.slice(idx, idx + n).join(''));
            idx += n;
        }
        return out;
    }
}

class ComposedKanji {
    static counter = 0;

    constructor(g1, g2, layout = 'vertical', { xCompress = 0, yCompress = 0 } = {}) {
        this.g1 = g1;
        this.g2 = g2;
        this.layout = layout;
        this.uid = 'k' + (++ComposedKanji.counter);
        this.xC = Math.max(-2, Math.min(2, xCompress));
        this.yC = Math.max(-2, Math.min(2, yCompress));
    }

    // Recursive HTML+CSS render
    renderWithStyles() {
        const isVertical = this.layout === 'vertical';
        const compValue = isVertical ? this.yC : this.xC;
        const absShift = Math.abs(compValue) * 50;
        const swap = compValue < 0;

        // Recursively render inner glyphs (collect HTML + CSS)
        const g1 = this.g1 instanceof ComposedKanji ? this.g1.renderWithStyles() : { html: this.g1, css: '' };
        const g2 = this.g2 instanceof ComposedKanji ? this.g2.renderWithStyles() : { html: this.g2, css: '' };

        const [A, B] = swap ? [g2.html, g1.html] : [g1.html, g2.html];

        const wrapperClass = `kanji-composed kanji-${this.layout}`;
        const part1Class = `kanji-slot kanji-${this.uid}-${isVertical ? 'top' : 'left'}`;
        const part2Class = `kanji-slot kanji-${this.uid}-${isVertical ? 'bottom' : 'right'}`;

        const html = `
                <span class="${wrapperClass}">
                    <span class="${part1Class}">${A}</span>
                    <span class="${part2Class}">${B}</span>
                </span>`;

        const css = isVertical
            ? `
                    .kanji-${this.uid}-top {
                    transform: scaleY(0.5) translateY(${absShift}%);
                    transform-origin: top;
                    }
                    .kanji-${this.uid}-bottom {
                    transform: scaleY(0.5) translateY(-${absShift}%);
                    transform-origin: bottom;
                    }`
            : `
                    .kanji-${this.uid}-left {
                    transform: scaleX(0.5) translateX(${absShift}%);
                    transform-origin: left;
                    }
                    .kanji-${this.uid}-right {
                    transform: scaleX(0.5) translateX(-${absShift}%);
                    transform-origin: right;
                    }`;

        return {
            html,
            css: g1.css + g2.css + css
        };
    }

    static getCSS() {
        return `
                .kanji-composed {
                    display: inline-block;
                    font-size: 1em;
                    width: 1em;
                    height: 1em;
                    line-height: 1;
                    position: relative;
                }

                .kanji-slot {
                    position: absolute;
                    top: 0; left: 0;
                    width: 100%; height: 100%;
                    text-align: center;
                    white-space: nowrap;
                }
                `;
    }
}

class JPExtended {
    static injectCSS() {
        const style = document.createElement('style');
        style.innerHTML = [
            Tategaki.getCSS(),
            ComposedKanji.getCSS()
        ].join('\n');
        document.head.appendChild(style);
    }

    static buildKanji(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent.trim();

        if (node.nodeType !== Node.ELEMENT_NODE || node.tagName.toLowerCase() !== 'jp-kanji') {
            return node.textContent.trim();
        }

        const align = node.getAttribute('alignment');
        if (!align) return node.textContent.trim();
        const x = parseFloat(node.getAttribute('xcompress')) || 0;
        const y = parseFloat(node.getAttribute('ycompress')) || 0;

        const children = Array.from(node.childNodes).filter(n =>
            n.nodeType !== Node.TEXT_NODE || n.textContent.trim() !== ''
        );

        if (children.length === 1 && children[0].nodeType === Node.TEXT_NODE) {
            const chars = children[0].textContent.trim().split('').filter(Boolean);
            return chars.length === 2
                ? new ComposedKanji(chars[0], chars[1], align, { xCompress: x, yCompress: y })
                : chars.join('');
        }

        if (children.length === 2) {
            const [g1, g2] = children.map(JPExtended.buildKanji);
            return new ComposedKanji(g1, g2, align, { xCompress: x, yCompress: y });
        }

        return node.textContent.trim(); // fallback if malformed
    }

    static parseCustomTags() {
        // Step 1: jp-tategaki
        document.querySelectorAll('jp-tategaki').forEach(el => {
            const wrapped = Tategaki.wrap(el.innerHTML);
            const container = document.createElement('div');
            container.innerHTML = wrapped;
            el.replaceWith(container);
        });

        // Step 2: jp-furigana
        document.querySelectorAll('jp-furigana').forEach(el => {
            const sizeAttr = el.getAttribute('size');
            const size = sizeAttr !== null ? parseFloat(sizeAttr) : null;

            const children = Array.from(el.childNodes);
            let base = '';
            let reading = '';

            const hasKanji = children.some(n =>
                n.nodeType === Node.ELEMENT_NODE && n.tagName.toLowerCase() === 'jp-kanji'
            );

            if (!hasKanji) {
                const raw = el.textContent.trim();
                const mid = Math.floor(raw.length / 2);
                base = raw.slice(0, mid);
                reading = raw.slice(mid);
                return;
            }

            let readingFound = false;

            for (const child of children) {
                if (!readingFound && child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                    reading += child.textContent.trim();
                    readingFound = true;
                    continue;
                }

                if (child.nodeType === Node.TEXT_NODE) {
                    base += child.textContent.trim();
                    continue;
                }

                if (child.nodeType !== Node.ELEMENT_NODE || child.tagName.toLowerCase() !== 'jp-kanji') {
                    continue;
                }

                const composed = JPExtended.buildKanji(child);

                if (typeof composed === 'string') {
                    base += composed;
                    continue;
                }

                const { html, css } = composed.renderWithStyles();
                base += html;

                const style = document.createElement('style');
                style.innerHTML = css;
                document.head.appendChild(style);
            }

            const output = Furigana.render(base, reading, size);
            const container = document.createElement('span');
            container.innerHTML = output;
            el.replaceWith(container);
        });

        // Step 3: standalone jp-kanji
        document.querySelectorAll('jp-kanji').forEach(node => {
            if (!node.isConnected) return;

            const composed = JPExtended.buildKanji(node);
            if (typeof composed === 'string') {
                const span = document.createElement('span');
                span.textContent = composed;
                node.replaceWith(span);
                return;
            }

            const rendered = composed.renderWithStyles();
            const span = document.createElement('span');
            span.innerHTML = rendered.html;
            node.replaceWith(span);

            const style = document.createElement('style');
            style.innerHTML = rendered.css;
            document.head.appendChild(style);
        });
    }

    static init() {
        this.injectCSS();
        this.parseCustomTags();
    }
}

document.addEventListener('DOMContentLoaded', () => JPExtended.init());
// Export classes for external use
export default JPExtended;