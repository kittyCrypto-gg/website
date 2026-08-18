type KanjiLayout = "vertical" | "horizontal";
type IdeographicDescriptionOperator = "⿰" | "⿱";

type RenderedWithStyles = Readonly<{
    html: string;
    css: string;
}>;

type KanjiGlyph = string | ComposedKanji;

type ParsedGlyph = Readonly<{
    glyph: KanjiGlyph;
    next: number;
}>;

function escapeHTML(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function parsePositiveNumberAttribute(element: Element, name: string): number | null {
    const raw = element.getAttribute(name);
    if (raw === null) return null;

    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
}

class Tategaki {
    /**
     * @param {string} content - Inner HTML for the tategaki wrapper.
     * @returns {string} Wrapped HTML string.
     */
    static wrap(content: string): string {
        return `<div class="tategaki">${content}</div>`;
    }

    /**
     * @returns {string} CSS text for tategaki and ruby rendering.
     */
    static getCSS(): string {
        return `
            .tategaki {
                writing-mode: vertical-rl;
                text-orientation: mixed;
                line-height: 1.8;
            }

            ruby {
                ruby-position: over;
                ruby-align: center;
            }

            rt {
                font-size: 0.5em;
                line-height: 1;
                user-select: none;
                -webkit-user-select: none;
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
                flex-direction: row-reverse;
                gap: 1em;
            }
        `;
    }
}

class Furigana {
    /**
     * @param {string} base - Base HTML.
     * @param {string} reading - Furigana reading.
     * @param {number | null} maxEm - Optional max width in em before nesting ruby.
     * @returns {string} Ruby HTML.
     */
    static render(base: string, reading: string, maxEm: number | null = null): string {
        const safeReading = escapeHTML(reading);

        if (maxEm === null) {
            return `<ruby>${base}<rt>${safeReading}</rt></ruby>`;
        }

        const widthEm = Furigana.#estimateEmWidth(reading);

        if (widthEm <= maxEm) {
            return `<ruby>${base}<rt>${safeReading}</rt></ruby>`;
        }

        const partsNeeded = Math.max(1, Math.ceil(widthEm / maxEm));
        const slices = Furigana.#splitReading(reading, partsNeeded);

        let html = base;
        for (const slice of slices) {
            html = `<ruby>${html}<rt>${escapeHTML(slice)}</rt></ruby>`;
        }

        return html;
    }

    /**
     * @param {string} text - Reading text.
     * @returns {number} Estimated width in ems.
     */
    static #estimateEmWidth(text: string): number {
        let w = 0;

        for (const ch of [...text]) {
            const cp = ch.codePointAt(0) ?? 0;

            if (
                (cp >= 0x3040 && cp <= 0x30ff) ||
                cp < 0x2e80
            ) {
                w += 0.5;
                continue;
            }

            w += 1;
        }

        return w;
    }

    /**
     * @param {string} text - Reading text.
     * @param {number} parts - Number of parts to split into.
     * @returns {string[]} Parts of the reading.
     */
    static #splitReading(text: string, parts: number): string[] {
        const chars = [...text];
        const safeParts = Math.max(1, Math.min(chars.length, Math.floor(parts)));

        const base = Math.floor(chars.length / safeParts);
        const rem = chars.length % safeParts;

        const sizes: number[] = Array.from(
            { length: safeParts },
            (_v, i) => base + (i < rem ? 1 : 0)
        );

        const out: string[] = [];
        let idx = 0;

        for (const n of sizes) {
            out.push(chars.slice(idx, idx + n).join(""));
            idx += n;
        }

        return out;
    }
}

class ComposedKanji {
    static counter = 0;

    readonly g1: KanjiGlyph;
    readonly g2: KanjiGlyph;
    readonly layout: KanjiLayout;
    readonly uid: string;
    readonly xC: number;
    readonly yC: number;

    constructor(
        g1: KanjiGlyph,
        g2: KanjiGlyph,
        layout: KanjiLayout = "vertical",
        { xCompress = 0, yCompress = 0 }: Readonly<{ xCompress?: number; yCompress?: number }> = {}
    ) {
        this.g1 = g1;
        this.g2 = g2;
        this.layout = layout;
        this.uid = `k${++ComposedKanji.counter}`;
        this.xC = Math.max(-2, Math.min(2, xCompress));
        this.yC = Math.max(-2, Math.min(2, yCompress));
    }

    /**
     * @returns {string} Canonical IDS source for this composition.
     */
    toIDS(): string {
        const operator: IdeographicDescriptionOperator = this.layout === "vertical" ? "⿱" : "⿰";
        return `${operator}${ComposedKanji.#sourceOf(this.g1)}${ComposedKanji.#sourceOf(this.g2)}`;
    }

    /**
     * @returns {RenderedWithStyles} HTML + CSS for this composed kanji.
     */
    renderWithStyles(): RenderedWithStyles {
        const visual = this.#renderVisualWithStyles();
        const source = escapeHTML(this.toIDS());

        return {
            html: `
                <span class="kanji-composed" data-jp-source="${source}">
                    <span class="kanji-source">${source}</span>
                    <span class="kanji-visual" aria-hidden="true">${visual.html}</span>
                </span>
            `,
            css: visual.css
        };
    }

    /**
     * @returns {RenderedWithStyles} Visual-only HTML used by top-level and nested compositions.
     */
    #renderVisualWithStyles(): RenderedWithStyles {
        const isVertical = this.layout === "vertical";
        const compValue = isVertical ? this.yC : this.xC;
        const absShift = Math.abs(compValue) * 50;
        const swap = compValue < 0;

        const g1 = this.g1 instanceof ComposedKanji
            ? this.g1.#renderVisualWithStyles()
            : { html: escapeHTML(this.g1), css: "" };
        const g2 = this.g2 instanceof ComposedKanji
            ? this.g2.#renderVisualWithStyles()
            : { html: escapeHTML(this.g2), css: "" };

        const [A, B] = swap ? [g2.html, g1.html] : [g1.html, g2.html];

        const wrapperClass = `kanji-visual-composed kanji-${this.layout}`;
        const part1Class = `kanji-slot kanji-${this.uid}-${isVertical ? "top" : "left"}`;
        const part2Class = `kanji-slot kanji-${this.uid}-${isVertical ? "bottom" : "right"}`;

        const html = `
            <span class="${wrapperClass}">
                <span class="${part1Class}">${A}</span>
                <span class="${part2Class}">${B}</span>
            </span>
        `;

        const css = isVertical
            ? `
                .kanji-${this.uid}-top {
                    transform: scaleY(0.5) translateY(${absShift}%);
                    transform-origin: top;
                }
                .kanji-${this.uid}-bottom {
                    transform: scaleY(0.5) translateY(-${absShift}%);
                    transform-origin: bottom;
                }
            `
            : `
                .kanji-${this.uid}-left {
                    transform: scaleX(0.5) translateX(${absShift}%);
                    transform-origin: left;
                }
                .kanji-${this.uid}-right {
                    transform: scaleX(0.5) translateX(-${absShift}%);
                    transform-origin: right;
                }
            `;

        return {
            html,
            css: g1.css + g2.css + css
        };
    }

    static #sourceOf(glyph: KanjiGlyph): string {
        return glyph instanceof ComposedKanji ? glyph.toIDS() : glyph;
    }

    /**
     * @returns {string} Base CSS for selectable-source composed kanji.
     */
    static getCSS(): string {
        return `
            .kanji-composed {
                display: inline-block;
                font-size: 1em;
                width: 1em;
                height: 1em;
                line-height: 1;
                position: relative;
                vertical-align: -0.08em;
            }

            .kanji-source {
                position: absolute;
                inset: 0;
                opacity: 0;
                overflow: hidden;
                white-space: nowrap;
                user-select: all;
                -webkit-user-select: all;
                cursor: text;
                z-index: 2;
            }

            .kanji-visual {
                position: absolute;
                inset: 0;
                pointer-events: none;
                user-select: none;
                -webkit-user-select: none;
                z-index: 1;
            }

            .kanji-visual-composed {
                display: inline-block;
                width: 100%;
                height: 100%;
                line-height: 1;
                position: relative;
            }

            .kanji-slot {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                line-height: 1;
                text-align: center;
                white-space: nowrap;
            }
        `;
    }
}

class IdeographicDescription {
    static readonly operators: Readonly<Record<IdeographicDescriptionOperator, KanjiLayout>> = {
        "⿰": "horizontal",
        "⿱": "vertical"
    };

    /**
     * Parse a binary IDS using U+2FF0 LEFT-TO-RIGHT and U+2FF1 ABOVE-TO-BELOW.
     * Whitespace is ignored.
     *
     * @param {string} source - IDS source.
     * @returns {KanjiGlyph} Parsed glyph tree.
     */
    static parse(source: string): KanjiGlyph {
        const tokens = [...source].filter((token) => !/\s/u.test(token));
        if (tokens.length === 0) {
            throw new Error("IDS source is empty");
        }

        const parsed = IdeographicDescription.#parseAt(tokens, 0);
        if (parsed.next !== tokens.length) {
            throw new Error("IDS contains extra tokens after the first complete expression");
        }

        return parsed.glyph;
    }

    static #parseAt(tokens: readonly string[], index: number): ParsedGlyph {
        const token = tokens[index];
        if (token === undefined) {
            throw new Error("IDS ended before all operands were supplied");
        }

        if (token === "⿰" || token === "⿱") {
            const first = IdeographicDescription.#parseAt(tokens, index + 1);
            const second = IdeographicDescription.#parseAt(tokens, first.next);

            return {
                glyph: new ComposedKanji(
                    first.glyph,
                    second.glyph,
                    IdeographicDescription.operators[token]
                ),
                next: second.next
            };
        }

        return {
            glyph: token,
            next: index + 1
        };
    }
}

class JPExtended {
    /**
     * @returns {void} Nothing.
     */
    static injectCSS(): void {
        if (document.getElementById("jp-extended-styles") !== null) return;

        const style = document.createElement("style");
        style.id = "jp-extended-styles";
        style.textContent = [
            Tategaki.getCSS(),
            ComposedKanji.getCSS()
        ].join("\n");
        document.head.appendChild(style);
    }

    static #injectDynamicCSS(css: string): void {
        if (css.trim().length === 0) return;

        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
    }

    /**
     * @param {string} source - Unicode IDS source.
     * @returns {KanjiGlyph} Parsed composition.
     */
    static parseIDS(source: string): KanjiGlyph {
        return IdeographicDescription.parse(source);
    }

    /**
     * @param {Node} node - Node containing jp-kanji, jp-compose, or plain text.
     * @returns {KanjiGlyph} Either a string glyph or a composed glyph.
     */
    static buildKanji(node: Node): KanjiGlyph {
        if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").trim();
        if (!(node instanceof Element)) return (node.textContent ?? "").trim();

        const tagName = node.tagName.toLowerCase();

        if (tagName === "jp-compose") {
            const source = (node.getAttribute("ids") ?? node.textContent ?? "").trim();

            try {
                return IdeographicDescription.parse(source);
            } catch (error: unknown) {
                console.warn("[shodou] Invalid jp-compose IDS", source, error);
                return source;
            }
        }

        if (tagName !== "jp-kanji") {
            return (node.textContent ?? "").trim();
        }

        const alignRaw = node.getAttribute("alignment") ?? "";
        const layout: KanjiLayout =
            alignRaw === "horizontal" || alignRaw === "vertical" ? alignRaw : "vertical";

        const x = Number.parseFloat(node.getAttribute("xcompress") ?? "0") || 0;
        const y = Number.parseFloat(node.getAttribute("ycompress") ?? "0") || 0;

        const children = Array.from(node.childNodes).filter((child) => {
            if (child.nodeType !== Node.TEXT_NODE) return true;
            return (child.textContent ?? "").trim().length > 0;
        });

        if (children.length === 1 && children[0]?.nodeType === Node.TEXT_NODE) {
            const chars = [...((children[0].textContent ?? "").trim())];
            if (chars.length === 2) {
                return new ComposedKanji(
                    chars[0] ?? "",
                    chars[1] ?? "",
                    layout,
                    { xCompress: x, yCompress: y }
                );
            }
            return chars.join("");
        }

        if (children.length === 2) {
            const g1 = JPExtended.buildKanji(children[0] as Node);
            const g2 = JPExtended.buildKanji(children[1] as Node);
            return new ComposedKanji(g1, g2, layout, { xCompress: x, yCompress: y });
        }

        return (node.textContent ?? "").trim();
    }

    static #renderGlyph(glyph: KanjiGlyph): RenderedWithStyles {
        if (glyph instanceof ComposedKanji) {
            return glyph.renderWithStyles();
        }

        return {
            html: escapeHTML(glyph),
            css: ""
        };
    }

    static #renderBaseNodes(nodes: readonly Node[]): RenderedWithStyles {
        let html = "";
        let css = "";

        for (const node of nodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = (node.textContent ?? "").trim();
                if (text.length > 0) html += escapeHTML(text);
                continue;
            }

            if (!(node instanceof Element)) continue;

            const tagName = node.tagName.toLowerCase();
            if (tagName === "jp-reading") continue;

            if (tagName === "jp-kanji" || tagName === "jp-compose") {
                const rendered = JPExtended.#renderGlyph(JPExtended.buildKanji(node));
                html += rendered.html;
                css += rendered.css;
                continue;
            }

            html += node.outerHTML;
        }

        return { html, css };
    }

    static #replaceWithRendered(
        element: Element,
        rendered: RenderedWithStyles,
        reading: string | null,
        maxEm: number | null
    ): void {
        const container = document.createElement("span");
        container.className = "jp-rendered";
        container.innerHTML = reading !== null && reading.length > 0
            ? Furigana.render(rendered.html, reading, maxEm)
            : rendered.html;

        element.replaceWith(container);
        JPExtended.#injectDynamicCSS(rendered.css);
    }

    static #parseFuriganaElement(element: Element): void {
        const maxEm = parsePositiveNumberAttribute(element, "size");
        const originalChildren = Array.from(element.childNodes);

        const readingElement = originalChildren.find((node) => {
            return node instanceof Element && node.tagName.toLowerCase() === "jp-reading";
        });

        const explicitReading = (element.getAttribute("reading") ?? "").trim();
        let reading = explicitReading.length > 0
            ? explicitReading
            : (readingElement?.textContent ?? "").trim();

        let baseNodes = originalChildren.filter((node) => node !== readingElement);

        if (reading.length === 0) {
            const hasComposedChild = baseNodes.some((node) => {
                if (!(node instanceof Element)) return false;
                const tagName = node.tagName.toLowerCase();
                return tagName === "jp-kanji" || tagName === "jp-compose";
            });

            if (hasComposedChild) {
                const legacyReadingIndex = baseNodes.findIndex((node) => {
                    return node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0;
                });

                if (legacyReadingIndex >= 0) {
                    reading = (baseNodes[legacyReadingIndex]?.textContent ?? "").trim();
                    baseNodes = baseNodes.filter((_node, index) => index !== legacyReadingIndex);
                }
            } else {
                const rawChars = [...((element.textContent ?? "").trim())];
                const mid = Math.floor(rawChars.length / 2);
                const base = rawChars.slice(0, mid).join("");
                reading = rawChars.slice(mid).join("");

                JPExtended.#replaceWithRendered(
                    element,
                    { html: escapeHTML(base), css: "" },
                    reading,
                    maxEm
                );
                return;
            }
        }

        const rendered = JPExtended.#renderBaseNodes(baseNodes);
        JPExtended.#replaceWithRendered(
            element,
            rendered,
            reading.length > 0 ? reading : null,
            maxEm
        );
    }

    /**
     * Parse custom XML-like Japanese markup.
     *
     * Preferred furigana syntax:
     *   <jp-furigana reading="にほん">日本</jp-furigana>
     *
     * Furigana + IDS composition:
     *   <jp-furigana reading="にほん"><jp-compose ids="⿱日本"></jp-compose></jp-furigana>
     *
     * Shorthand:
     *   <jp-compose ids="⿱日本" reading="にほん"></jp-compose>
     *
     * Explicit child-reading form:
     *   <jp-furigana><jp-compose ids="⿱日本"></jp-compose><jp-reading>にほん</jp-reading></jp-furigana>
     *
     * Existing jp-kanji nesting and legacy jp-furigana forms remain supported.
     *
     * @returns {void} Nothing.
     */
    static parseCustomTags(): void {
        // Step 1: tategaki wrappers.
        document.querySelectorAll("jp-tategaki").forEach((element) => {
            const wrapped = Tategaki.wrap(element.innerHTML);
            const container = document.createElement("div");
            container.innerHTML = wrapped;
            element.replaceWith(container);
        });

        // Step 2: furigana first, so nested compositions are consumed as ruby bases.
        Array.from(document.querySelectorAll("jp-furigana")).forEach((element) => {
            if (!element.isConnected) return;
            JPExtended.#parseFuriganaElement(element);
        });

        // Step 3: standalone manual or IDS compositions. A reading attribute is a ruby shorthand.
        Array.from(document.querySelectorAll("jp-compose, jp-kanji")).forEach((element) => {
            if (!(element instanceof Element)) return;
            if (!element.isConnected) return;

            const rendered = JPExtended.#renderGlyph(JPExtended.buildKanji(element));
            const reading = (element.getAttribute("reading") ?? "").trim();
            const maxEm = parsePositiveNumberAttribute(element, "size");

            JPExtended.#replaceWithRendered(
                element,
                rendered,
                reading.length > 0 ? reading : null,
                maxEm
            );
        });
    }

    /**
     * @returns {void} Nothing.
     */
    static init(): void {
        JPExtended.injectCSS();
        JPExtended.parseCustomTags();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    JPExtended.init();
});

export default JPExtended;
