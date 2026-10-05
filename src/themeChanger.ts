import * as helpers from "./helpers.ts";
import type { MainThemeEntry } from "./uiFetch.ts";

export type ThemeMap = Readonly<Record<string, MainThemeEntry>>;

const storeKey = "kcTheme";
const callKey = "kcThemeCaller";
const cssKey = "kcThemeCss";
const defKey = "miku";
const linkPrefix = "kc-theme-sheet_";

/**
 * Turns a theme caller into the actual class to apply.
 * @param {string | undefined} val Raw caller from main.json.
 * @returns {string} Class name without a leading dot.
 */
function cleanCall(val: string | undefined): string {
    const clean = (val || "").trim().replace(/^\.+/, "");
    if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return "";
    return clean;
}

/**
 * Reads one saved value without letting storage errors break the page.
 * @param {string} key Storage key to read.
 * @returns {string | null} Stored value when available.
 */
function readStore(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch (_err: unknown) {
        void _err;
        return null;
    }
}

/**
 * Saves one value without letting storage errors break the page.
 * @param {string} key Storage key to write.
 * @param {string} val Value to save.
 * @returns {void}
 */
function saveStore(key: string, val: string): void {
    try {
        window.localStorage.setItem(key, val);
    } catch (_err: unknown) {
        void _err;
    }
}

/**
 * Removes one saved value without letting storage errors break the page.
 * @param {string} key Storage key to remove.
 * @returns {void}
 */
function dropStore(key: string): void {
    try {
        window.localStorage.removeItem(key);
    } catch (_err: unknown) {
        void _err;
    }
}

/**
 * Reads the saved theme key without letting storage errors break the page.
 * @returns {string | null} Saved key when available.
 */
function readSaved(): string | null {
    return readStore(storeKey);
}

/**
 * Saves the picked theme key without letting storage errors break the page.
 * @param {string} key Theme key to save.
 * @returns {void}
 */
function saveKey(key: string): void {
    saveStore(storeKey, key);
}

/**
 * Saves the early boot data used before the main app script runs.
 * @param {string} caller Theme class to add to html.
 * @param {string | undefined} css Theme stylesheet path.
 * @returns {void}
 */
function saveBoot(caller: string, css: string | undefined): void {
    if (!caller) {
        dropStore(callKey);
        dropStore(cssKey);
        return;
    }

    saveStore(callKey, caller);

    if (css) {
        saveStore(cssKey, css);
        return;
    }

    dropStore(cssKey);
}

/**
 * Saves the picked theme and its early boot data.
 * @param {string} key Theme key to save.
 * @param {MainThemeEntry | undefined} theme Theme definition.
 * @returns {void}
 */
function savePick(key: string, theme: MainThemeEntry | undefined): void {
    const caller = cleanCall(theme?.caller);

    saveKey(key);
    saveBoot(caller, theme?.location);
}

/**
 * Gets the theme keys that can remove classes from html.
 * @param {ThemeMap} themes Theme map from main.json.
 * @returns {string[]} Class names that belong to picker themes.
 */
function calls(themes: ThemeMap): string[] {
    return Object.values(themes)
        .map((theme) => cleanCall(theme.caller))
        .filter((caller) => caller.length > 0);
}

/**
 * Creates the stylesheet id for one theme.
 * @param {string} key Theme key from main.json.
 * @returns {string} Stable link id.
 */
function linkId(key: string): string {
    return helpers.makeStableId(linkPrefix, key);
}

/**
 * Adds one stylesheet link if it is not already there.
 * @param {string} key Theme key from main.json.
 * @param {MainThemeEntry} theme Theme definition.
 * @param {Document} root Document to change.
 * @returns {void}
 */
function addSheet(key: string, theme: MainThemeEntry, root: Document): void {
    if (!theme.location) return;

    const id = linkId(key);
    const old = root.getElementById(id);

    if (old instanceof HTMLLinkElement) {
        old.href = theme.location;
        return;
    }

    const link = root.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = theme.location;
    link.dataset.themeKey = key;

    root.head.appendChild(link);
}

/**
 * Removes one theme stylesheet link if it exists.
 * @param {string} key Theme key from main.json.
 * @param {Document} root Document to change.
 * @returns {void}
 */
function dropSheet(key: string, root: Document): void {
    const old = root.getElementById(linkId(key));
    if (old instanceof HTMLLinkElement) old.remove();
}

/**
 * Removes every theme stylesheet except the active one.
 * @param {ThemeMap} themes Theme map from main.json.
 * @param {string} keep Theme key to keep loaded.
 * @param {Document} root Document to change.
 * @returns {void}
 */
function dropSheets(themes: ThemeMap, keep: string, root: Document): void {
    Object.keys(themes).forEach((key) => {
        if (key !== keep) dropSheet(key, root);
    });

    root.querySelectorAll<HTMLLinkElement>("link[data-theme-key]").forEach((link) => {
        if (link.dataset.themeKey !== keep) link.remove();
    });
}

/**
 * Loads only the active theme stylesheet and removes inactive theme stylesheets.
 * @param {ThemeMap} themes Theme map from main.json.
 * @param {string} key Active theme key.
 * @param {Document} root Document to change.
 * @returns {void}
 */
function loadSheet(themes: ThemeMap, key: string, root: Document): void {
    const theme = themes[key];

    if (theme) {
        addSheet(key, theme, root);
    }

    dropSheets(themes, key, root);
}

/**
 * Finds the default theme key.
 * @param {ThemeMap} themes Theme map from main.json.
 * @returns {string} Default theme key.
 */
function baseKey(themes: ThemeMap): string {
    if (themes[defKey]) return defKey;

    const hit = Object.entries(themes).find(([, theme]) => !cleanCall(theme.caller));
    return hit ? hit[0] : "";
}

/**
 * Finds which declared theme is already on the html element.
 * @param {ThemeMap} themes Theme map from main.json.
 * @param {HTMLElement} html Root html element.
 * @returns {string} Theme key found on html, or an empty string.
 */
function keyFromHtml(themes: ThemeMap, html: HTMLElement): string {
    const hit = Object.entries(themes).find(([, theme]) => {
        const caller = cleanCall(theme.caller);
        return caller.length > 0 && html.classList.contains(caller);
    });

    return hit ? hit[0] : "";
}

/**
 * Resolves the key that should be selected on start.
 * @param {ThemeMap} themes Theme map from main.json.
 * @param {HTMLElement} html Root html element.
 * @returns {string} Initial theme key.
 */
function initKey(themes: ThemeMap, html: HTMLElement): string {
    const saved = readSaved();
    if (saved && themes[saved]) return saved;

    const fromHtml = keyFromHtml(themes, html);
    if (fromHtml) return fromHtml;

    return baseKey(themes);
}

/**
 * Applies a theme class to html while leaving dark-mode and light-mode alone.
 * @param {ThemeMap} themes Theme map from main.json.
 * @param {string} key Theme key to apply.
 * @param {boolean} keep Whether to save the choice.
 * @param {Document} root Document to change.
 * @returns {string} Applied theme key.
 */
export function setTheme(
    themes: ThemeMap,
    key: string,
    keep: boolean = true,
    root: Document = document
): string {
    const html = root.documentElement;
    const next = themes[key] ? key : baseKey(themes);
    const theme = themes[next];
    const caller = cleanCall(theme?.caller);

    loadSheet(themes, next, root);

    html.classList.remove(...calls(themes));

    if (caller) {
        html.classList.add(caller);
    }

    if (keep && next) {
        savePick(next, theme);
    }

    return next;
}

/**
 * Loads the active theme CSS and restores the saved picker state.
 * @param {ThemeMap} themes Theme map from main.json.
 * @param {Document} root Document to change.
 * @returns {string} Active theme key.
 */
export function initThemes(themes: ThemeMap, root: Document = document): string {
    return setTheme(themes, initKey(themes, root.documentElement), false, root);
}