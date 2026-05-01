import { prepareSvgMarkup } from "./icons.tsx";

export type ToggleVisual = Readonly<{
    emoji: string;
    iconPath?: string;
    title?: string;
}>;

export type ToggleIconSpec = Readonly<{
    size?: number;
    wrapperClass?: string;
    svgClass?: string;
}>;

type ResolvedToggleIconSpec = Readonly<{
    size: number;
    wrapperClass: string;
    svgClass: string;
}>;

const DEFAULT_SIZE = 32;
const DEFAULT_WRAPPER_CLASS = "menu-toggle-button__icon";
const DEFAULT_SVG_CLASS = "menu-toggle-button__svg";

const visualMapByButton = new WeakMap<HTMLButtonElement, Map<string, ToggleVisual>>();
const renderTokenByButton = new WeakMap<HTMLButtonElement, number>();
const rawSvgPromiseBySrc = new Map<string, Promise<string>>();

/**
 * @param {number | undefined} size
 * @returns {number}
 */
function normaliseSize(size: number | undefined): number {
    if (typeof size !== "number") return DEFAULT_SIZE;
    if (!Number.isFinite(size)) return DEFAULT_SIZE;
    if (size <= 0) return DEFAULT_SIZE;
    return size;
}

/**
 * @param {ToggleIconSpec | undefined} spec
 * @returns {ResolvedToggleIconSpec}
 */
function resolveSpec(spec: ToggleIconSpec | undefined): ResolvedToggleIconSpec {
    return {
        size: normaliseSize(spec?.size),
        wrapperClass: spec?.wrapperClass ?? DEFAULT_WRAPPER_CLASS,
        svgClass: spec?.svgClass ?? DEFAULT_SVG_CLASS
    };
}

/**
 * @param {HTMLButtonElement} button
 * @param {string} emoji
 * @param {string | undefined} title
 * @returns {void}
 */
function renderEmoji(button: HTMLButtonElement, emoji: string, title: string | undefined): void {
    button.replaceChildren();
    button.textContent = emoji;

    if (title) {
        button.title = title;
        button.setAttribute("aria-label", title);
    }
}

/**
 * @param {string} src
 * @returns {Promise<string>}
 */
async function fetchRawSvg(src: string): Promise<string> {
    const cached = rawSvgPromiseBySrc.get(src);
    if (cached) return cached;

    const pending = fetch(src, { cache: "force-cache" }).then(async (response) => {
        if (!response.ok) {
            throw new Error(`Failed to load SVG icon from "${src}"`);
        }

        return await response.text();
    });

    rawSvgPromiseBySrc.set(src, pending);

    try {
        return await pending;
    } catch (error: unknown) {
        rawSvgPromiseBySrc.delete(src);
        throw error;
    }
}

/**
 * @param {string} iconPath
 * @param {ResolvedToggleIconSpec} resolvedSpec
 * @returns {Promise<string | null>}
 */
async function loadSvgMarkup(
    iconPath: string,
    resolvedSpec: ResolvedToggleIconSpec
): Promise<string | null> {
    try {
        const rawSvg = await fetchRawSvg(iconPath);
        return prepareSvgMarkup(
            rawSvg,
            resolvedSpec.svgClass,
            undefined,
            resolvedSpec.size
        );
    } catch {
        return null;
    }
}

/**
 * @param {string} markup
 * @param {ResolvedToggleIconSpec} resolvedSpec
 * @returns {HTMLSpanElement}
 */
function buildSvgWrapper(
    markup: string,
    resolvedSpec: ResolvedToggleIconSpec
): HTMLSpanElement {
    const wrapper = document.createElement("span");
    wrapper.className = resolvedSpec.wrapperClass;
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.width = `${resolvedSpec.size}px`;
    wrapper.style.height = `${resolvedSpec.size}px`;
    wrapper.innerHTML = markup;

    const svg = wrapper.querySelector("svg");
    if (svg instanceof SVGElement) {
        svg.style.width = `${resolvedSpec.size}px`;
        svg.style.height = `${resolvedSpec.size}px`;
        svg.style.display = "block";
        svg.style.flex = "0 0 auto";
        svg.style.maxWidth = "none";
        svg.style.maxHeight = "none";
    }

    return wrapper;
}

/**
 * @param {HTMLButtonElement} button
 * @param {Readonly<Record<string, ToggleVisual>>} states
 * @returns {void}
 */
export function bindToggleVisuals(
    button: HTMLButtonElement,
    states: Readonly<Record<string, ToggleVisual>>
): void {
    visualMapByButton.set(button, new Map(Object.entries(states)));
}

/**
 * @param {HTMLButtonElement} button
 * @param {string} stateKey
 * @param {ToggleIconSpec} [spec]
 * @returns {Promise<void>}
 */
export async function showToggleVisual(
    button: HTMLButtonElement,
    stateKey: string,
    spec?: ToggleIconSpec
): Promise<void> {
    const visualMap = visualMapByButton.get(button);
    if (!visualMap) return;

    const visual = visualMap.get(stateKey);
    if (!visual) return;

    const resolvedSpec = resolveSpec(spec);
    const nextToken = (renderTokenByButton.get(button) ?? 0) + 1;
    renderTokenByButton.set(button, nextToken);

    renderEmoji(button, visual.emoji, visual.title);

    if (!visual.iconPath) {
        return;
    }

    const markup = await loadSvgMarkup(visual.iconPath, resolvedSpec);
    if (!markup) return;
    if (renderTokenByButton.get(button) !== nextToken) return;

    button.replaceChildren(buildSvgWrapper(markup, resolvedSpec));

    if (visual.title) {
        button.title = visual.title;
        button.setAttribute("aria-label", visual.title);
    }
}