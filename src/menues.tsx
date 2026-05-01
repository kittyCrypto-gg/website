import { recreateSingleton } from "./domSingletons.ts";
import { prepareSvgMarkup } from "./icons.tsx";

export type MenuToggleCfg = Readonly<{
    icon: string;
    iconPath?: string;
    title: string;
}>;

export type MenuToggleIconSpec = Readonly<{
    size?: number;
    wrapperClass?: string;
    svgClass?: string;
}>;

type ResolvedMenuToggleIconSpec = Readonly<{
    size: number;
    wrapperClass: string;
    svgClass: string;
}>;

export type MenuToggleSpec = Readonly<{
    id: string;
    bottom: string;
    cfg: MenuToggleCfg;
    classes?: readonly string[];
    icon?: MenuToggleIconSpec;
    openModal: () => void | Promise<void>;
}>;

export type MenuToggleHandle = Readonly<{
    button: HTMLButtonElement;
    setConfig: (next: MenuToggleCfg) => void;
}>;

const DEFAULT_CLASSES: readonly string[] = ["theme-toggle-button"];
const DEFAULT_ICON_WRAPPER = "menu-toggle-button__icon";
const DEFAULT_SVG_CLASS = "menu-toggle-button__svg";
const DEFAULT_SVG_SIZE = 16;

const iconTokByBtn = new WeakMap<HTMLButtonElement, number>();

/**
 * Replaces the button contents with a plain-text emoji fallback.
 * @param {HTMLButtonElement} button
 * @param {string} emoji
 * @returns {void}
 */
function emojiIcon(button: HTMLButtonElement, emoji: string): void {
    button.replaceChildren();
    button.textContent = emoji;
}

/**
 * Normalises the requested icon size to a safe positive number.
 * @param {number | undefined} size
 * @returns {number}
 */
function normaliseIconSize(size: number | undefined): number {
    if (typeof size !== "number") return DEFAULT_SVG_SIZE;
    if (!Number.isFinite(size)) return DEFAULT_SVG_SIZE;
    if (size <= 0) return DEFAULT_SVG_SIZE;
    return size;
}

/**
 * Resolves the icon rendering settings from the menu toggle spec.
 * @param {MenuToggleSpec} spec
 * @returns {ResolvedMenuToggleIconSpec}
 */
function resolveIconSpec(spec: MenuToggleSpec): ResolvedMenuToggleIconSpec {
    return {
        size: normaliseIconSize(spec.icon?.size),
        wrapperClass: spec.icon?.wrapperClass ?? DEFAULT_ICON_WRAPPER,
        svgClass: spec.icon?.svgClass ?? DEFAULT_SVG_CLASS
    };
}

/**
 * Fetches and normalises svg markup for use as a floating-button icon.
 * Gives back null on any fetch or parse trouble so callers can fall back to emoji.
 * @param {string} src
 * @param {ResolvedMenuToggleIconSpec} iconSpec
 * @returns {Promise<string | null>}
 */
async function loadSvg(
    src: string,
    iconSpec: ResolvedMenuToggleIconSpec
): Promise<string | null> {
    try {
        const response = await fetch(src, { cache: "force-cache" });
        if (!response.ok) return null;

        const rawSvg = await response.text();
        return prepareSvgMarkup(rawSvg, iconSpec.svgClass, undefined, iconSpec.size);
    } catch {
        return null;
    }
}

/**
 * Builds the wrapper for a fetched svg and hard-applies the requested size.
 * The inline sizing is deliberate so menu icon dimensions are not overridden by
 * unrelated css targeting the svg class.
 * @param {string} markup
 * @param {ResolvedMenuToggleIconSpec} iconSpec
 * @returns {HTMLSpanElement}
 */
function buildSvgWrapper(
    markup: string,
    iconSpec: ResolvedMenuToggleIconSpec
): HTMLSpanElement {
    const wrapper = document.createElement("span");
    wrapper.className = iconSpec.wrapperClass;
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "center";
    wrapper.style.width = `${iconSpec.size}px`;
    wrapper.style.height = `${iconSpec.size}px`;
    wrapper.innerHTML = markup;

    const svg = wrapper.querySelector("svg");
    if (!(svg instanceof SVGElement)) return wrapper;

    svg.style.width = `${iconSpec.size}px`;
    svg.style.height = `${iconSpec.size}px`;
    svg.style.display = "block";
    svg.style.flex = "0 0 auto";
    svg.style.maxWidth = "none";
    svg.style.maxHeight = "none";

    return wrapper;
}

/**
 * Renders either the configured svg icon or the emoji fallback onto the button.
 * Shows the emoji immediately while the svg loads.
 * @param {HTMLButtonElement} button
 * @param {MenuToggleCfg} cfg
 * @param {ResolvedMenuToggleIconSpec} iconSpec
 * @returns {Promise<void>}
 */
async function setBtnIcon(
    button: HTMLButtonElement,
    cfg: MenuToggleCfg,
    iconSpec: ResolvedMenuToggleIconSpec
): Promise<void> {
    const nextToken = (iconTokByBtn.get(button) ?? 0) + 1;
    iconTokByBtn.set(button, nextToken);

    emojiIcon(button, cfg.icon);

    if (!cfg.iconPath) {
        return;
    }

    const markup = await loadSvg(cfg.iconPath, iconSpec);
    if (iconTokByBtn.get(button) !== nextToken) return;
    if (!markup) return;

    button.replaceChildren(buildSvgWrapper(markup, iconSpec));
}

/**
 * Creates or rebuilds the singleton floating button.
 * Icon sizing now lives inside `spec.icon.size` instead of being passed as a
 * separate argument.
 * @param {MenuToggleSpec} spec
 * @returns {MenuToggleHandle}
 */
export function installMenuToggle(spec: MenuToggleSpec): MenuToggleHandle {
    const button = recreateSingleton(
        spec.id,
        () => document.createElement("button"),
        document
    );

    if (!(button instanceof HTMLButtonElement)) {
        throw new Error(`Failed to create menu toggle button: ${spec.id}`);
    }

    const classes = spec.classes ?? DEFAULT_CLASSES;
    for (const cls of classes) {
        button.classList.add(cls);
    }

    const iconSpec = resolveIconSpec(spec);

    button.type = "button";
    button.style.bottom = spec.bottom;

    const setConfig = (next: MenuToggleCfg): void => {
        button.title = next.title;
        button.setAttribute("aria-label", next.title);
        void setBtnIcon(button, next, iconSpec);
    };

    setConfig(spec.cfg);

    button.onclick = () => {
        void spec.openModal();
    };

    if (button.parentElement !== document.body) {
        document.body.appendChild(button);
    }

    return {
        button,
        setConfig
    };
}