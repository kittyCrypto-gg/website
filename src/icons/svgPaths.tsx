import { type ReactElement, useEffect, useState } from "react";

export type ReaderIcon = string | ReactElement;

export interface SvgPathIconProps {
    src: string;
    className?: string;
    fallback?: ReaderIcon;
    size?: number;
}

type StrokeProps = Readonly<{
    fill: "none";
    stroke: string;
    strokeWidth: number;
    strokeLinecap: "round";
    strokeLinejoin: "round";
}>;

const srcCache = new Map<string, Promise<string>>();
const STRIP_TAGS = new Set(["metadata", "title", "desc", "script"]);
const STRIP_ATTRS = new Set([
    "xmlns:inkscape",
    "xmlns:sodipodi",
    "version",
    "xml:space",
    "enable-background"
]);
const STRIP_PREFIXES = ["inkscape:", "sodipodi:", "on"];

let idCtr = 0;

/**
 * Just makes a kinda unique-ish id.
 * good enough for filter ids and that sort of faff.
 * @param {string} prefix
 * @returns {string}
 */
export function nextId(prefix: string): string {
    idCtr += 1;
    return `${prefix}-${idCtr}`;
}

/**
 * Tiny colour shift filter builder.
 * mostly for brightening/darkening the icon bits.
 * @param {number} slope
 * @param {number} intercept
 * @returns {ReactElement}
 */
export function mkShiftFilter(slope: number, intercept: number): ReactElement {
    return (
        <feComponentTransfer>
            <feFuncR type="linear" slope={slope} intercept={intercept} />
            <feFuncG type="linear" slope={slope} intercept={intercept} />
            <feFuncB type="linear" slope={slope} intercept={intercept} />
            <feFuncA type="identity" />
        </feComponentTransfer>
    );
}

/**
 * Makes the white filter thing.
 * name says it really.
 * @param {string} id
 * @returns {ReactElement}
 */
export function mkWhiteFilter(id: string): ReactElement {
    return (
        <filter id={id}>
            <feColorMatrix
                type="matrix"
                values="
          0 0 0 0 1
          0 0 0 0 1
          0 0 0 0 1
          0 0 0 1 0
        "
            />
        </filter>
    );
}

/**
 * Shared stroke props for the line icons.
 * saves repeating the same lot everywhere.
 * @param {string} colourVar
 * @returns {StrokeProps}
 */
export function mkStrokeProps(colourVar: string): StrokeProps {
    return {
        fill: "none",
        stroke: `var(${colourVar})`,
        strokeWidth: 1.8,
        strokeLinecap: "round",
        strokeLinejoin: "round"
    };
}

/**
 * Joins class names and bins empty rubbish.
 * @param {...(string | null | undefined)} parts
 * @returns {string}
 */
function joinCls(...parts: Array<string | null | undefined>): string {
    return parts
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(" ");
}

/**
 * Escapes text for regex use.
 * tiny helper, boring but needed.
 * @param {string} text
 * @returns {string}
 */
function escRe(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fetches the raw svg source, with a cache in front so we do not keep re-fetching it.
 * @param {string} src
 * @returns {Promise<string>}
 */
async function getSrc(src: string): Promise<string> {
    const cached = srcCache.get(src);
    if (cached) return cached;

    const pending = fetch(src).then(async (res) => {
        if (!res.ok) {
            throw new Error(`Failed to load SVG icon from "${src}"`);
        }

        return res.text();
    });

    srcCache.set(src, pending);

    try {
        return await pending;
    } catch (err) {
        srcCache.delete(src);
        throw err;
    }
}

/**
 * Removes tags we do not want hanging around in imported svg.
 * metadata, scripts, that sort of nonsense.
 * @param {Element} svg
 * @returns {void}
 */
function stripNodes(svg: Element): void {
    const selector = Array.from(STRIP_TAGS).join(",");
    if (!selector) return;

    svg.querySelectorAll(selector).forEach((node) => node.remove());
}

/**
 * Strips a few attrs we do not care about, plus event-ish attrs.
 * @param {Element} svg
 * @returns {void}
 */
function stripAttrs(svg: Element): void {
    const nodes: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];

    for (const node of nodes) {
        for (const attr of Array.from(node.attributes)) {
            const attrName = attr.name;
            const shouldStrip =
                STRIP_ATTRS.has(attrName) ||
                STRIP_PREFIXES.some((prefix) => attrName.startsWith(prefix));

            if (!shouldStrip) continue;
            node.removeAttribute(attrName);
        }
    }
}

/**
 * Rewrites internal svg class names so they do not collide with page css.
 * Also updates selectors inside embedded <style> tags.
 * @param {Element} svg
 * @param {string} instanceId
 * @returns {void}
 */
function rebaseClasses(svg: Element, instanceId: string): void {
    const classMap = new Map<string, string>();
    const nodes: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];

    for (const node of nodes) {
        const rawClassName = node.getAttribute("class");
        if (!rawClassName) continue;

        const classNames = rawClassName
            .split(/\s+/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (!classNames.length) continue;

        const nextClassNames = classNames.map((className) => {
            const cached = classMap.get(className);
            if (cached) return cached;

            const nextClassName = `${instanceId}-${className}`;
            classMap.set(className, nextClassName);
            return nextClassName;
        });

        node.setAttribute("class", nextClassNames.join(" "));
    }

    if (classMap.size === 0) return;

    svg.querySelectorAll("style").forEach((styleNode) => {
        let cssText = styleNode.textContent ?? "";
        if (!cssText) return;

        for (const [prevClassName, nextClassName] of classMap) {
            cssText = cssText.replace(
                new RegExp(`\\.${escRe(prevClassName)}(?=[^a-zA-Z0-9_-]|$)`, "g"),
                `.${nextClassName}`
            );
        }

        styleNode.textContent = cssText;
    });
}

/**
 * Rewrites internal ids so multiple copies of the same svg do not clash.
 * Also updates references inside embedded <style> tags.
 * @param {Element} svg
 * @param {string} instanceId
 * @returns {void}
 */
function rebaseIds(svg: Element, instanceId: string): void {
    const idMap = new Map<string, string>();

    svg.querySelectorAll("[id]").forEach((node) => {
        const prevId = node.getAttribute("id");
        if (!prevId) return;

        const nextIdValue = `${instanceId}-${prevId}`;
        node.setAttribute("id", nextIdValue);
        idMap.set(prevId, nextIdValue);
    });

    if (idMap.size === 0) return;

    /**
     * Rewrites id references in attribute values or css text.
     * @param {string} value
     * @returns {string}
     */
    const replaceRefs = (value: string): string => {
        let nextValue = value;

        for (const [prevId, nextIdValue] of idMap) {
            const escapedId = escRe(prevId);

            nextValue = nextValue.replace(
                new RegExp(`url\\((['"]?)#${escapedId}\\1\\)`, "g"),
                `url(#${nextIdValue})`
            );

            nextValue = nextValue.replace(
                new RegExp(`(?<![\\w-])#${escapedId}(?![\\w-])`, "g"),
                `#${nextIdValue}`
            );
        }

        return nextValue;
    };

    const nodes: Element[] = [svg, ...Array.from(svg.querySelectorAll("*"))];

    for (const node of nodes) {
        for (const attr of Array.from(node.attributes)) {
            const nextValue = replaceRefs(attr.value);
            if (nextValue === attr.value) continue;
            node.setAttribute(attr.name, nextValue);
        }
    }

    svg.querySelectorAll("style").forEach((styleNode) => {
        const cssText = styleNode.textContent ?? "";
        const nextCssText = replaceRefs(cssText);
        if (nextCssText === cssText) return;
        styleNode.textContent = nextCssText;
    });
}

/**
 * Makes sure the svg has a viewBox.
 * if width/height exist we can fake one from those.
 * @param {Element} svg
 * @returns {void}
 */
function ensureViewBox(svg: Element): void {
    if (svg.getAttribute("viewBox")) return;

    const width = parseFloat(svg.getAttribute("width") || "");
    const height = parseFloat(svg.getAttribute("height") || "");
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
}

/**
 * Normalises the root svg attrs so it behaves nicely as an icon.
 * @param {Element} svg
 * @param {string} className
 * @param {number} size
 * @returns {void}
 */
function normRoot(svg: Element, className: string, size: number): void {
    ensureViewBox(svg);

    svg.removeAttribute("width");
    svg.removeAttribute("height");

    svg.setAttribute("width", `${size}px`);
    svg.setAttribute("height", `${size}px`);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute(
        "class",
        joinCls(svg.getAttribute("class"), className)
    );
}

/**
 * Cleans and normalises raw svg markup so we can safely-ish stuff it into the page.
 * @param {string} rawSvg
 * @param {string} className
 * @param {string} instanceId
 * @param {number} size
 * @returns {string}
 */
export function prepareSvgMarkup(
    rawSvg: string,
    className = "reader-ui-icon",
    instanceId = nextId("kc-svg-path-icon"),
    size = 16
): string {
    const doc = new DOMParser().parseFromString(rawSvg, "image/svg+xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
        throw new Error("Invalid SVG markup");
    }

    const svg = doc.documentElement;
    if (svg.tagName.toLowerCase() !== "svg") {
        throw new Error("Expected an <svg> root element");
    }

    stripNodes(svg);
    stripAttrs(svg);
    rebaseIds(svg, instanceId);
    rebaseClasses(svg, instanceId);
    normRoot(svg, className, size);

    return new XMLSerializer().serializeToString(svg);
}

/**
 * Renders whatever fallback we were given.
 * string, element, or just nothing.
 * @param {ReaderIcon | undefined} fallback
 * @returns {ReactElement}
 */
function rndrFallback(fallback: ReaderIcon | undefined): ReactElement {
    if (typeof fallback === "string") return <>{fallback}</>;
    return fallback ?? <></>;
}

/**
 * Loads an svg icon and gives back a react element wrapper for it.
 * @param {string} src
 * @param {string} className
 * @param {number} size
 * @returns {Promise<ReactElement>}
 */
export async function loadSvgPathIcon(
    src: string,
    className = "reader-ui-icon",
    size = 16
): Promise<ReactElement> {
    const rawSvg = await getSrc(src);
    const markup = prepareSvgMarkup(rawSvg, className, undefined, size);

    return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}

/**
 * React component wrapper for a fetched svg icon.
 * falls back while empty or when fetch/parsing blows up.
 * @param {SvgPathIconProps} props
 * @returns {ReactElement}
 */
export function SvgPathIcon(props: SvgPathIconProps): ReactElement {
    const className = props.className || "reader-ui-icon";
    const [markup, setMarkup] = useState<string>("");
    const [instanceId] = useState<string>(() => nextId("kc-svg-path-icon"));

    useEffect(() => {
        let disposed = false;

        setMarkup("");

        void getSrc(props.src)
            .then((rawSvg) => prepareSvgMarkup(rawSvg, className, instanceId, props.size))
            .then((nextMarkup) => {
                if (disposed) return;
                setMarkup(nextMarkup);
            })
            .catch(() => {
                if (disposed) return;
                setMarkup("");
            });

        return () => {
            disposed = true;
        };
    }, [className, instanceId, props.src]);

    if (!markup) return rndrFallback(props.fallback);

    return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />;
}
