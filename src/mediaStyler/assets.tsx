import type { ReactElement } from "react";
import { render2Mkup } from "../reactHelpers.tsx";

/**
 * Inlines svg <img> tags by fetching the svg text and swapping the node.
 * string input gets wrapped in a temp div first.
 * @param {Document | Element | string} root
 * @returns {Promise<void>}
 */
export async function replaceSVGs(root: Document | Element | string = document): Promise<void> {
    let doneRoot: Document | Element | null = null;

    if (typeof root === "string") {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = root;
        doneRoot = wrapper;
    }

    if (root instanceof Document || root instanceof Element) {
        doneRoot = root;
    }

    if (!doneRoot) return;

    const images = Array.from(doneRoot.querySelectorAll("img"));

    for (const img of images) {
        const src = img.getAttribute("src");
        if (!src || !src.endsWith(".svg")) continue;

        try {
            const res = await fetch(src);
            if (!res.ok) continue;

            const svgText = await res.text();
            const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
            const svg = doc.querySelector("svg");
            if (!svg) continue;

            if (img.className) svg.classList.add(...img.classList);

            const style = img.getAttribute("style");
            if (style) svg.setAttribute("style", style);

            const width = img.getAttribute("width");
            if (width) svg.setAttribute("width", width);

            const height = img.getAttribute("height");
            if (height) svg.setAttribute("height", height);

            img.replaceWith(svg);
        } catch (err: unknown) {
            console.warn("inlineSvgs failed:", src, err);
        }
    }
}

const CH_IMG_FALLBACK_SRC = "/images/fallback-image.png";
const CH_IMG_FALLBACK_ALT = "Image not found";
const CH_IMG_FALLBACK_SIZE = 256;

let chImgFallbackOn = false;

/**
 * Swaps a broken chapter image over to the fallback.
 * only does it once per image.
 * @param {HTMLImageElement} image
 * @returns {void}
 */
function setChImgFallback(image: HTMLImageElement): void {
    if (image.dataset.fallbackApplied === "true") return;

    const currentSrc = image.getAttribute("src") || image.currentSrc || "";
    if (currentSrc.includes(CH_IMG_FALLBACK_SRC)) return;

    image.dataset.fallbackApplied = "true";
    image.src = CH_IMG_FALLBACK_SRC;
    image.alt = CH_IMG_FALLBACK_ALT;
    image.width = CH_IMG_FALLBACK_SIZE;
    image.setAttribute("width", `${CH_IMG_FALLBACK_SIZE}`);
    image.style.width = `${CH_IMG_FALLBACK_SIZE}px`;
}

/**
 * Installs the global broken-image handler for chapter images.
 * @returns {void}
 */
function ensureChImgFallback(): void {
    if (chImgFallbackOn) return;
    chImgFallbackOn = true;

    document.addEventListener("error", (event: Event) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement)) return;
        if (!target.classList.contains("chapter-image")) return;

        setChImgFallback(target);
    }, true);
}

/**
 * React bit for one chapter image block.
 * @param {{ src: string; alt: string; }} props
 * @returns {ReactElement}
 */
function ChImg(props: { src: string; alt: string }): ReactElement {
    return (
        <div className="chapter-image-container">
            <img
                src={props.src.trim()}
                alt={props.alt.trim()}
                className="chapter-image"
                loading="lazy"
            />
        </div>
    );
}

/**
 * Replaces custom <chapter-image> tags with regular image markup.
 * also makes sure the fallback handling exists first.
 * @param {string} htmlContent
 * @returns {Promise<string>}
 */
export async function replaceImageTags(htmlContent: string): Promise<string> {
    ensureChImgFallback();

    const re = /<chapter-image\b[^>]*?(?:\/>|>[\s\S]*?<\/chapter-image>)/gi;

    return htmlContent.replace(re, (block: string) => {
        const doc = new DOMParser().parseFromString(`<root>${block}</root>`, "application/xml");
        const imageEl = doc.querySelector("chapter-image");
        if (!imageEl) return block;

        const url = (imageEl.getAttribute("url") || imageEl.getAttribute("src") || "").trim();
        if (!url) return block;

        const altAttr = (imageEl.getAttribute("alt") || "").trim();
        const altFromText = (imageEl.textContent || "").trim();
        const alt = altAttr || altFromText || "Chapter Image";

        return render2Mkup(<ChImg src={url} alt={alt} />);
    });
}

