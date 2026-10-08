import type { ReactElement } from "react";
import { nextId, mkShiftFilter, mkWhiteFilter } from "./svgPaths.tsx";

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
