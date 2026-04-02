import { removeExistingById } from "./domSingletons.ts";
import { loadSvgPathIcon } from "./icons.tsx";
import { render2Frag } from "./reactHelpers.tsx";
import type { MainJson, MainMenuEntry } from "./uiFetch.ts";

/**
 * @param {unknown} v Value to convert.
 * @returns {string} Sanitised string suitable for an id fragment.
 */
function toSafeIdPart(v: unknown): string {
    return String(v || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

/**
 * @param {string} prefix Prefix for id.
 * @param {unknown} value Value to incorporate.
 * @returns {string} Stable id.
 */
function makeStableId(prefix: string, value: unknown): string {
    const part = toSafeIdPart(value);
    return part ? `${prefix}${part}` : `${prefix}x`;
}

/**
 * @param {MainMenuEntry} entry
 * @returns {{ href: string; icon: string | null }}
 */
function readMainMenuEntry(entry: MainMenuEntry): { href: string; icon: string | null } {
    if (typeof entry === "string") {
        return { href: entry, icon: null };
    }

    return {
        href: entry.href,
        icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon : null
    };
}

/**
 * @param {HTMLAnchorElement} button
 * @param {string} iconPath
 * @param {Document} root
 * @returns {Promise<void>}
 */
async function tryAttachMenuIcon(
    button: HTMLAnchorElement,
    iconPath: string,
    root: Document = document
): Promise<void> {
    try {
        const icon = await loadSvgPathIcon(
            iconPath,
            "reader-ui-icon menu-button-icon"
        );

        const iconWrap = root.createElement("span");
        iconWrap.className = "menu-button-icon-wrap";
        iconWrap.setAttribute("aria-hidden", "true");
        iconWrap.appendChild(render2Frag(icon));

        button.insertBefore(iconWrap, button.firstChild);
        button.classList.add("menu-button--with-icon");
    } catch (_error: unknown) {
        void _error;
    }
}

/**
 * @param {MainJson} data UI data.
 * @param {Document} [root=document] Document to operate on.
 * @returns {Promise<void>} Resolves after menu creation.
 */
export async function createMenu(data: MainJson, root: Document = document): Promise<void> {
    const menu = root.getElementById("main-menu");
    if (!menu) throw new Error("Element #main-menu not found!");

    for (const [text, entry] of Object.entries(data.mainMenu)) {
        const { href, icon } = readMainMenuEntry(entry);
        const linkId = makeStableId("kc-main-menu_", text);

        removeExistingById(linkId, root);

        const button = root.createElement("a");
        const textWrap = root.createElement("span");

        button.id = linkId;
        button.href = href;
        button.classList.add("menu-button");

        textWrap.className = "menu-button-text";
        textWrap.textContent = text;

        button.appendChild(textWrap);
        menu.appendChild(button);

        if (!icon) continue;

        void tryAttachMenuIcon(button, icon, root);
    }
}