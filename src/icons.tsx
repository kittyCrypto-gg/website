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
function nextId(prefix: string): string {
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
function mkShiftFilter(slope: number, intercept: number): ReactElement {
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
function mkWhiteFilter(id: string): ReactElement {
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
function mkStrokeProps(colourVar: string): StrokeProps {
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

/**
 * Paragraph numbers toggle icon.
 * @returns {ReactElement}
 */
export function MakeToggleParagraphNumbersIcon(): ReactElement {
    const lightenFilterId = nextId("kc-toggle-pnum-lighten");
    const darkenFilterId = nextId("kc-toggle-pnum-darken");
    const whiteFilterId = nextId("kc-toggle-pnum-white");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--toggleParagraphNumbers"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                <filter id={lightenFilterId}>
                    {mkShiftFilter(0.72, 0.28)}
                </filter>

                <filter id={darkenFilterId}>
                    {mkShiftFilter(0.68, 0)}
                </filter>

                {mkWhiteFilter(whiteFilterId)}
            </defs>

            <g fill="var(--togglePnum-icon-colour)">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" ry="3" opacity="0.18" />

                <rect
                    x="2.5"
                    y="3"
                    width="11"
                    height="2.9"
                    rx="1.2"
                    ry="1.2"
                    filter={`url(#${lightenFilterId})`}
                />
                <rect
                    x="2.5"
                    y="6.55"
                    width="11"
                    height="2.9"
                    rx="1.2"
                    ry="1.2"
                />
                <rect
                    x="2.5"
                    y="10.1"
                    width="11"
                    height="2.9"
                    rx="1.2"
                    ry="1.2"
                    filter={`url(#${darkenFilterId})`}
                />

                <text
                    x="4.15"
                    y="5.05"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2.55"
                    fontWeight="700"
                    fontFamily="inherit"
                    filter={`url(#${whiteFilterId})`}
                >
                    1
                </text>
                <text
                    x="4.15"
                    y="8.6"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2.55"
                    fontWeight="700"
                    fontFamily="inherit"
                    filter={`url(#${whiteFilterId})`}
                >
                    2
                </text>
                <text
                    x="4.15"
                    y="12.15"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="2.55"
                    fontWeight="700"
                    fontFamily="inherit"
                    filter={`url(#${whiteFilterId})`}
                >
                    3
                </text>

                <rect
                    x="6.1"
                    y="4.1"
                    width="5.9"
                    height="0.8"
                    rx="0.4"
                    ry="0.4"
                    filter={`url(#${whiteFilterId})`}
                />
                <rect
                    x="6.1"
                    y="7.65"
                    width="5.2"
                    height="0.8"
                    rx="0.4"
                    ry="0.4"
                    filter={`url(#${whiteFilterId})`}
                />
                <rect
                    x="6.1"
                    y="11.2"
                    width="5.6"
                    height="0.8"
                    rx="0.4"
                    ry="0.4"
                    filter={`url(#${whiteFilterId})`}
                />
            </g>
        </svg>
    );
}

/**
 * Clear bookmark icon.
 * @returns {ReactElement}
 */
export function MakeClearBookmarkIcon(): ReactElement {
    const whiteFilterId = nextId("kc-clear-bookmark-white");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--clearBookmark"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {mkWhiteFilter(whiteFilterId)}
            </defs>

            <g fill="var(--clearBookmark-icon-colour)">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" ry="3" opacity="0.18" />
                <rect x="2.5" y="2.5" width="11" height="11" rx="2.4" ry="2.4" opacity="0.95" />
            </g>

            <g
                fill="none"
                stroke="var(--clearBookmark-icon-colour)"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${whiteFilterId})`}
            >
                <path d="M4.45 11.32V8.62c0-1.97 1.35-3.32 3.32-3.32h1.97" />
                <polyline points="9.72 3.66 12.43 5.29 9.72 6.92" />
            </g>
        </svg>
    );
}

/**
 * Double-arrow chapter icon.
 * rotation lets you flip it around for next/prev without another icon.
 * @param {number} rotationDeg
 * @returns {ReactElement}
 */
export function MakePrevChapterIcon(rotationDeg = 0): ReactElement {
    const whiteFilterId = nextId("kc-prev-chapter-white");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--prevChapter"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {mkWhiteFilter(whiteFilterId)}
            </defs>

            <g fill="var(--prevChapter-icon-colour)">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" ry="3" opacity="0.18" />
                <rect x="2.5" y="2.5" width="11" height="11" rx="2.4" ry="2.4" opacity="0.95" />
            </g>

            <g
                fill="var(--prevChapter-icon-colour)"
                filter={`url(#${whiteFilterId})`}
                transform={`rotate(${rotationDeg} 8 8)`}
            >
                <polygon points="9.1,4.6 5.7,8 9.1,11.4" />
                <polygon points="12.1,4.6 8.7,8 12.1,11.4" />
            </g>
        </svg>
    );
}

/**
 * Jump-to-chapter icon.
 * @returns {ReactElement}
 */
export function MakeJumpToChapterIcon(): ReactElement {
    const whiteFilterId = nextId("kc-jump-to-chapter-white");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--jumpToChapter"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {mkWhiteFilter(whiteFilterId)}
            </defs>

            <g fill="var(--jumpToChapter-icon-colour)">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" ry="3" opacity="0.18" />
                <rect x="2.5" y="2.5" width="11" height="11" rx="2.4" ry="2.4" opacity="0.95" />
            </g>

            <circle
                cx="8"
                cy="8"
                r="2.1"
                fill="var(--jumpToChapter-icon-colour)"
                filter={`url(#${whiteFilterId})`}
            />
        </svg>
    );
}

/**
 * Info icon.
 * @returns {ReactElement}
 */
export function MakeShowInfoIcon(): ReactElement {
    const whiteFilterId = nextId("kc-show-info-white");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--showInfo"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {mkWhiteFilter(whiteFilterId)}
            </defs>

            <g fill="var(--showInfo-icon-colour)">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" ry="3" opacity="0.18" />
                <rect x="2.5" y="2.5" width="11" height="11" rx="2.4" ry="2.4" opacity="0.95" />
            </g>

            <g fill="var(--showInfo-icon-colour)" filter={`url(#${whiteFilterId})`}>
                <circle cx="8" cy="4.85" r="0.95" />
                <rect x="7.2" y="6.5" width="1.6" height="4.65" rx="0.8" ry="0.8" />
            </g>
        </svg>
    );
}

/**
 * Minus icon for smaller font.
 * @returns {ReactElement}
 */
export function MakeDecreaseFontIcon(): ReactElement {
    const strokeProps = mkStrokeProps("--decreaseFont-icon-colour");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--decreaseFont"
            viewBox="0 0 12 12"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M3 6h6" {...strokeProps} />
        </svg>
    );
}

/**
 * Reset font icon with the little loop arrows.
 * @returns {ReactElement}
 */
export function MakeResetFontIcon(): ReactElement {
    const strokeProps = mkStrokeProps("--resetFont-icon-colour");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--resetFont"
            viewBox="0 0 12 12"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M3.2 4.6a3.8 3.8 0 0 1 5.8-1.4" {...strokeProps} />
            <path d="M8.1 1.9 9 3.4 7.2 3.9" {...strokeProps} />
            <path d="M8.8 7.4a3.8 3.8 0 0 1-5.8 1.4" {...strokeProps} />
            <path d="M3.9 10.1 3 8.6 4.8 8.1" {...strokeProps} />
        </svg>
    );
}

/**
 * Image navigation arrow icon.
 * Base shape points up. Rotate for right, down, and left.
 * @param {number} rotationDeg
 * @returns {ReactElement}
 */
export function MakeImageNavigationArrowIcon(rotationDeg = 0): ReactElement {
    const whiteFilterId = nextId("kc-image-nav-arrow-white");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--imageNavArrow"
            viewBox="0 0 16 16"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <defs>
                {mkWhiteFilter(whiteFilterId)}
            </defs>

            <g fill="var(--imageNavArrow-bg-colour)">
                <rect x="1.5" y="1.5" width="13" height="13" rx="3" ry="3" opacity="0.18" />
                <rect x="2.5" y="2.5" width="11" height="11" rx="2.4" ry="2.4" opacity="0.95" />
            </g>

            <g
                fill="none"
                stroke="#fff"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#${whiteFilterId})`}
                transform={`rotate(${rotationDeg} 8 8)`}
            >
                <path d="M8 11.2V4.8" />
                <path d="M5.4 7.4 8 4.8 10.6 7.4" />
            </g>
        </svg>
    );
}

/**
 * Plus icon for bigger font.
 * @returns {ReactElement}
 */
export function MakeIncreaseFontIcon(): ReactElement {
    const strokeProps = mkStrokeProps("--increaseFont-icon-colour");

    return (
        <svg
            className="reader-ui-icon reader-ui-icon--increaseFont"
            viewBox="0 0 12 12"
            width="1em"
            height="1em"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M3 6h6" {...strokeProps} />
            <path d="M6 3v6" {...strokeProps} />
        </svg>
    );
}

/**
 * Left pointing arrow (story selected)
 * @returns {ReactElement}
 */
export function makeLeftArrow(): ReactElement {
    return (
        <svg
            className="reader-ui-icon reader-ui-icon--storySelected"
            viewBox="14.5 19.5 71 61"
            width="71px"
            height="61px"
            aria-label="Left arrow"
        >
            <path
                d="M45 20 L15 50 L45 80 L45 60 H85 V40 H45 Z"
                fill="var(--menu-button-bg-colour)"
                stroke="var(--nav-border-colour)"
                strokeWidth="1"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Code icon for code blocks in the blog.
 * @returns {ReactElement}
 */
export function MakeCodeIcon(): ReactElement {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="14"
            viewBox="0 0 16 14"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M5 3L1 7L5 11"
                stroke="var(--rss-code-fg)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M11 3L15 7L11 11"
                stroke="var(--rss-code-fg)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M9 1L7 13"
                stroke="var(--rss-code-fg)"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

/**
 * Copy icon for code blocks in the blog.
 * @returns {ReactElement}
 */
export function MakeCopyIcon(): ReactElement {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <rect
                x="2"
                y="5"
                width="9"
                height="9"
                rx="1.75"
                stroke="var(--rss-code-fg)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <rect
                x="5"
                y="2"
                width="9"
                height="9"
                rx="1.75"
                stroke="var(--rss-code-fg)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Checkmark icon for code blocks in the blog.
 * @returns {ReactElement}
 */
export function MakeCheckIcon(): ReactElement {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M3 8.4L6.4 11.8L13 4.2"
                stroke="var(--rss-code-fg)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Share icon for code blocks in the blog.
 * @returns {ReactElement}
 */
export function MakeShareIcon(): ReactElement {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
        >
            <path
                d="M5.8 7.05L10.35 4.45"
                stroke="var(--increaseFont-icon-colour)"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
            <path
                d="M5.8 8.95L10.35 11.55"
                stroke="var(--increaseFont-icon-colour)"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
            <circle
                cx="4"
                cy="8"
                r="2.45"
                fill="var(--increaseFont-icon-colour)"
            />
            <circle
                cx="12"
                cy="3.8"
                r="2.45"
                fill="var(--increaseFont-icon-colour)"
            />
            <circle
                cx="12"
                cy="12.2"
                r="2.45"
                fill="var(--increaseFont-icon-colour)"
            />
        </svg>
    );
}

/**
 * Pulls plain text out of a ReaderIcon.
 * returns empty string if it was a React element.
 * @param {ReaderIcon} icon
 * @returns {string}
 */
export function ReadTextIcon(icon: ReaderIcon): string {
    return typeof icon === "string" ? icon : "";
}

/**
 * Tries to fetch and prep svg markup for the floating button.
 * @param {string} src
 * @returns {Promise<string | null>}
 */
export async function loadSvg(src: string): Promise<string | null> {
    try {
        const response = await fetch(src, { cache: "force-cache" });
        if (!response.ok) return null;

        const rawSvg = await response.text();
        return prepareSvgMarkup(rawSvg, "effects-toggle-button__svg");
    } catch {
        return null;
    }
}