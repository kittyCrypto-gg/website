import { removeExistingById } from "./domSingletons.ts";
import { loadSvgPathIcon } from "./icons.tsx";
import { render2Frag } from "./reactHelpers.tsx";
import type { MainJson, MainMenuEntry } from "./uiFetch.ts";
import * as helpers from "./helpers.ts";

/**
 * Makes a safe-ish id chunk out of whatever got passed in.
 * not fancy, just enough for ids really.
 *
 * @param v thing to squash into text
 * @returns cleaned bit for an id
 */
function safePart(v: unknown): string {
    return String(v || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
}
void safePart;

/**
 * Pulls the href out of a menu entry and grabs the icon too if there is one.
 * keeps the string and object cases in one place so the main loop stays less noisy.
 *
 * @param entry one menu item from the json
 * @returns href + maybe an icon path
 */
function readEnt(entry: MainMenuEntry): { href: string; icon: string | null } {
    if (typeof entry === "string") {
        return { href: entry, icon: null };
    }

    return {
        href: entry.href,
        icon: typeof entry.icon === "string" && entry.icon.trim() ? entry.icon : null
    };
}

/**
 * Tries to stick an svg icon onto the menu link.
 * if loading blows up it just quietly gives up, which is fine here tbh.
 *
 * @param btn link element getting the icon
 * @param iconPath where to load the svg from
 * @param root doc to create nodes from
 * @returns resolves when the attempt is done
 */
async function tryIcon(
    btn: HTMLAnchorElement,
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

        btn.insertBefore(iconWrap, btn.firstChild);
        btn.classList.add("menu-button--with-icon");
    } catch (_err: unknown) {
        void _err;
    }
}

/**
 * Builds the main menu links from ui data.
 * clears old copies first so the menu does not duplicate itself like a menace.
 *
 * @param data ui json blob
 * @param root document to work in
 * @returns resolves after the menu is built
 */
export async function createMenu(data: MainJson, root: Document = document): Promise<void> {
    const menu = root.getElementById("main-menu");
    if (!menu) throw new Error("Element #main-menu not found!");

    for (const [text, entry] of Object.entries(data.mainMenu)) {
        const { href, icon } = readEnt(entry);
        const linkId = helpers.makeStableId("kc-main-menu_", text);

        removeExistingById(linkId, root);

        const btn = root.createElement("a");
        const txt = root.createElement("span");

        btn.id = linkId;
        btn.href = href;
        btn.classList.add("menu-button");

        txt.className = "menu-button-text";
        txt.textContent = text;

        btn.appendChild(txt);
        menu.appendChild(btn);

        if (!icon) continue;

        void tryIcon(btn, icon, root);
    }
}