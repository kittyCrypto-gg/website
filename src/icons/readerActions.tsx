import type { ReactElement } from "react";
import { nextId, mkWhiteFilter, mkStrokeProps, prepareSvgMarkup, type ReaderIcon } from "./svgPaths.tsx";

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