import * as ReaderImport from "./reader.ts";

type ReaderParams = Readonly<{
    storyPath: string;
    chapter: string;
}>;

type ReaderModule = Readonly<{
    readerIsFullyLoaded: () => Promise<void>;
    getParams: () => ReaderParams;
    injectBookmarksIntoHTML: (html: string, storyPath: string, chapter: string) => Promise<string>;
    activateImageNavigation: (root: Document | Element) => void;
}>;

const Reader = ReaderImport as unknown as ReaderModule;

type ChapterImageInfo = Readonly<{
    src: string;
    alt: string;
    hasContainer: boolean;
}>;

type ReadabilityParseResult = Readonly<{
    content?: string;
}> | null;

type ReadabilityInstance = Readonly<{
    parse: () => ReadabilityParseResult;
}>;

type ReadabilityConstructor = new (doc: Document) => ReadabilityInstance;

declare global {
    interface Window {
        Readability?: ReadabilityConstructor;
    }

    interface HTMLElement {
        __readerListener?: boolean;
    }
}

class ReaderToggle {
    readerActive: boolean = false;
    originalNodeClone: Node | null = null;
    readerToggle: HTMLElement;
    enableText: string = "";
    disableText: string = "";

    /**
     * @param {HTMLElement} readerToggle - The toggle element used to enable/disable reader mode.
     */
    constructor(readerToggle: HTMLElement) {
        this.readerToggle = readerToggle;
        this.enableText = readerToggle.getAttribute("data-enable") || "";
        this.disableText = readerToggle.getAttribute("data-disable") || "";
        this.handleToggleClick = this.handleToggleClick.bind(this);
    }

    static async setup(): Promise<boolean> {
        if (document.readyState === "loading") {
            await new Promise<void>((resolve) =>
                document.addEventListener("DOMContentLoaded", () => resolve(), { once: true })
            );
        }

        let readerToggle = document.getElementById("reader-toggle");

        if (!readerToggle) {
            readerToggle = await new Promise<HTMLElement>((resolve) => {
                const observer = new MutationObserver(() => {
                    const el = document.getElementById("reader-toggle");
                    if (el) {
                        observer.disconnect();
                        resolve(el);
                    }
                });
                observer.observe(document.body, { childList: true, subtree: true });
            });
        }

        if (!readerToggle) return false;

        const instance = new ReaderToggle(readerToggle);
        instance.syncButtonState();

        if (!readerToggle.__readerListener) {
            readerToggle.addEventListener("click", instance.handleToggleClick);
            readerToggle.__readerListener = true;
        }

        // Automatically enable reader mode if URL contains reader=true
        if (window.location.search.includes("reader=true")) {
            await Reader.readerIsFullyLoaded();
            await instance.enableReaderMode();
        }

        return true;
    }

    syncButtonState(): void {
        if (document.body.classList.contains("reader-mode")) {
            this.readerToggle.textContent = this.disableText;
            this.readerToggle.classList.add("active");
        } else {
            this.readerToggle.textContent = this.enableText;
            this.readerToggle.classList.remove("active");
        }
    }

    /**
     * @param {unknown} doc - Document clone to sanitise for Readability parsing.
     * @returns {void} Removes tooltip behaviour for reader mode.
     * - Normal tooltips: unwrap trigger, drop tooltip content.
     * - Translation tooltips: unwrap translation content, drop trigger.
     */
    parseTooltips(doc: unknown): void {
        if (!doc || !(doc instanceof Document)) return;

        const renderedTooltips = Array.from(doc.querySelectorAll<HTMLElement>(".tooltip"));
        for (const tooltip of renderedTooltips) {
            const translationContent = tooltip.querySelector<HTMLElement>(".tooltip-content.translation");
            if (translationContent && (translationContent.textContent || "").trim()) {
                const frag = doc.createDocumentFragment();
                for (const n of Array.from(translationContent.childNodes)) {
                    frag.appendChild(n.cloneNode(true));
                }
                tooltip.replaceWith(frag);
                continue;
            }

            const trigger = tooltip.querySelector<HTMLElement>(".tooltip-trigger");
            if (!trigger) {
                tooltip.remove();
                continue;
            }

            const frag = doc.createDocumentFragment();
            for (const n of Array.from(trigger.childNodes)) {
                frag.appendChild(n.cloneNode(true));
            }

            tooltip.replaceWith(frag);
        }

        const rawTooltips = Array.from(doc.getElementsByTagName("tooltip"));
        for (const tooltip of rawTooltips) {
            const contentEl = Array.from(tooltip.children).find((n) => n.tagName.toLowerCase() === "content") as Element | undefined;

            if (!contentEl) {
                tooltip.remove();
                continue;
            }

            const translationAttr = (contentEl.getAttribute("translation") || "").trim().toLowerCase();
            const isTranslation = translationAttr === "true";

            if (isTranslation) {
                const nodes = Array.from(contentEl.childNodes);
                if (nodes.length === 0 || (contentEl.textContent || "").trim() === "") {
                    tooltip.remove();
                    continue;
                }

                const frag = doc.createDocumentFragment();
                for (const n of nodes) {
                    frag.appendChild(n.cloneNode(true));
                }

                tooltip.replaceWith(frag);
                continue;
            }

            const triggerNodes = Array.from(tooltip.childNodes).filter((n) => n !== contentEl);
            if (triggerNodes.length === 0) {
                tooltip.remove();
                continue;
            }

            const frag = doc.createDocumentFragment();
            for (const n of triggerNodes) {
                frag.appendChild(n.cloneNode(true));
            }

            tooltip.replaceWith(frag);
        }
    }

    /**
     * @param {Document | Element} root - Root node to scan for chapter images.
     */
    storeChapterImages(root: Document | Element = document): ChapterImageInfo[] {
        return Array.from(root.querySelectorAll<HTMLImageElement>("img.chapter-image")).map((img) => ({
            src: img.currentSrc || img.src,
            alt: img.alt,
            hasContainer: !!img.closest(".chapter-image-container")
        }));
    }

    async ensureReadabilityLoaded(): Promise<void> {
        if (window.Readability) return;

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Readability"));
            document.head.appendChild(script);
        });
    }

    /**
     * @param {unknown} list - Stored image metadata list.
     * @param {Document | Element} root - Root element where images should be restored.
     */
    restoreChapterImages(list: unknown, root: Document | Element): void {
        if (!Array.isArray(list) || !root) return;
        const imgs = root.querySelectorAll<HTMLImageElement>("img");

        (list as ReadonlyArray<ChapterImageInfo>).forEach(({ src, alt, hasContainer }) => {
            const img = Array.from(imgs).find((i) => (i.currentSrc || i.src) === src && i.alt === alt);
            if (!img) return;

            img.classList.add("chapter-image");

            if (hasContainer && !img.closest(".chapter-image-container")) {
                const wrapper =
                    (root as unknown as { createElement?: (tag: string) => HTMLElement }).createElement?.("div") ||
                    document.createElement("div");
                wrapper.className = "chapter-image-container";
                img.replaceWith(wrapper);
                wrapper.appendChild(img);
            }
        });

        Reader.activateImageNavigation(root);
    }

    /**
     * @param {Document} doc - Document clone to sanitise for Readability parsing.
     * @returns {void} Keeps only From/To/Subject and the email body (without signature) for reader mode.
     */
    parseEmails(doc: unknown): void {
        if (!doc || !(doc instanceof Document)) return;

        const cards = Array.from(doc.querySelectorAll<HTMLElement>(".email-card"));
        if (cards.length === 0) return;

        const getLabel = (row: Element): string =>
            (row.querySelector(".email-label")?.textContent || "").trim().toLowerCase();

        const getNameFor = (card: Element, labelLower: string): string => {
            const rows = Array.from(card.querySelectorAll<HTMLElement>(".email-row"));
            const row = rows.find((r) => getLabel(r) === labelLower);
            if (!row) return "";

            const nameEl = row.querySelector<HTMLElement>(".email-name") || row.querySelector<HTMLElement>(".email-value");
            return (nameEl?.textContent || "").trim();
        };

        const getSubject = (card: Element): string =>
            (card.querySelector<HTMLElement>(".email-subject-text")?.textContent || "").trim();

        const splitParagraphs = (text: string): string[] => {
            const t = (text || "").replace(/\r\n?/g, "\n");
            return t
                .split(/\n+/g)
                .map((p) => p.replace(/\s+/g, " ").trim())
                .filter(Boolean);
        };

        for (const card of cards) {
            const fromName = getNameFor(card, "from");
            const toName = getNameFor(card, "to");
            const subject = getSubject(card);

            const contentClone = card.querySelector<HTMLElement>(".email-content")?.cloneNode(true) as HTMLElement | null;
            if (contentClone) {
                contentClone.querySelectorAll(".email-signature, .email-signature-sep").forEach((n) => n.remove());
            }

            const bodyRaw = contentClone ? (contentClone.innerText || contentClone.textContent || "") : "";
            const bodyParas = splitParagraphs(bodyRaw);

            const replacement = doc.createElement("div");
            replacement.className = "reader-email";

            const addLine = (label: string, value: string): void => {
                if (!value) return;
                const p = doc.createElement("p");
                p.textContent = `${label}: ${value}`;
                replacement.appendChild(p);
            };

            addLine("From", fromName);
            addLine("To", toName);
            addLine("Subject", subject);

            for (const para of bodyParas) {
                const p = doc.createElement("p");
                p.textContent = para;
                replacement.appendChild(p);
            }

            const wrapper = card.closest<HTMLElement>(".email-wrapper") ?? card;
            wrapper.replaceWith(replacement);
        }

        doc.querySelectorAll(".email-actions-bar").forEach((n) => n.remove());
    }

    /**
     * @param none
     * @returns {Promise<void>} Enables reader mode by parsing the current document with Readability.
     */
    async enableReaderMode(): Promise<void> {
        const imgArray = this.storeChapterImages(document);

        const { storyPath, chapter } = Reader.getParams();

        await this.ensureReadabilityLoaded();

        const articleElem = document.querySelector<HTMLElement>("article#reader, main, article");
        if (!articleElem) {
            alert("No article found for reader mode.");
            return;
        }

        if (!this.originalNodeClone) this.originalNodeClone = articleElem.cloneNode(true);

        const docClone = document.cloneNode(true) as Document;
        this.parseTooltips(docClone);
        this.parseEmails(docClone);

        const reader = new (window.Readability as ReadabilityConstructor)(docClone);
        const parsed = reader.parse();

        if (!(parsed && parsed.content)) return;

        const parser = new DOMParser();
        const parsedDoc = parser.parseFromString(parsed.content, "text/html");

        let htmlContent = await Reader.injectBookmarksIntoHTML(parsedDoc.body.innerHTML, storyPath, chapter);

        articleElem.innerHTML = htmlContent;

        this.restoreChapterImages(imgArray, articleElem);

        // Ensure the reader-container class stays present
        const articleObj = document.getElementById("reader");
        if (articleObj) articleObj.classList.add("reader-container");

        const url = new URL(window.location.href);
        if (!url.searchParams.has("reader")) {
            url.searchParams.set("reader", "true");
            window.history.pushState({}, "", url);
        }

        document.body.classList.add("reader-mode");
        this.readerToggle.textContent = this.disableText;
        this.readerToggle.classList.add("active");
        this.readerActive = true;
    }

    async __hardSoftReload(): Promise<void> {
        const url = new URL(window.location.href);
        url.searchParams.set("_", Date.now().toString());
        window.location.replace(url.toString());
    }

    async disableReaderMode(): Promise<void> {
        document.body.classList.remove("reader-mode");

        const url = new URL(window.location.href);
        url.searchParams.delete("reader");
        window.history.replaceState({}, "", url);

        await this.__hardSoftReload();
    }

    async handleToggleClick(): Promise<void> {
        this.readerActive ? await this.disableReaderMode() : await this.enableReaderMode();
        return;
    }
}

export const setupReaderToggle = ReaderToggle.setup;