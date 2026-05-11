import * as icons from "./icons.tsx";
import { render2Frag } from "./reactHelpers.tsx";
import { initThemes, setTheme, type ThemeMap } from "./themeChanger.ts";
import type { MainJson, MainMenuEntry, MainThemeEntry } from "./uiFetch.ts";
import * as helpers from "./helpers.ts";

type ThemeEls = Readonly<{
    root: HTMLElement;
    body: HTMLDivElement;
    hdr: HTMLElement;
    btn: HTMLButtonElement;
}>;

const themeBodyId = "main-menu-themes-body";

/**
 * Pulls the href out of a menu entry and grabs the icon too if there is one.
 * @param {MainMenuEntry} entry One menu item from the json.
 * @returns {{ href: string; icon: string | null }} Link href and maybe an icon path.
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
 * @param {HTMLAnchorElement} btn Link element getting the icon.
 * @param {string} iconPath Where to load the svg from.
 * @param {Document} root Document to create nodes from.
 * @returns {Promise<void>} Resolves when the attempt is done.
 */
async function tryIcon(
    btn: HTMLAnchorElement,
    iconPath: string,
    root: Document = document
): Promise<void> {
    try {
        const icon = await icons.loadSvgPathIcon(
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
 * Adds one normal menu link.
 * @param {HTMLElement} row Row that receives the link.
 * @param {string} text Visible link text.
 * @param {MainMenuEntry} entry Menu entry from main.json.
 * @param {Document} root Document to create nodes from.
 * @returns {void}
 */
function addLink(row: HTMLElement, text: string, entry: MainMenuEntry, root: Document): void {
    const { href, icon } = readEnt(entry);
    const btn = root.createElement("a");
    const txt = root.createElement("span");

    btn.id = helpers.makeStableId("kc-main-menu_", text);
    btn.href = href;
    btn.classList.add("menu-button");

    txt.className = "menu-button-text";
    txt.textContent = text;

    btn.appendChild(txt);
    row.appendChild(btn);

    if (!icon) return;

    void tryIcon(btn, icon, root);
}

/**
 * Gets the text used for one theme radio label.
 * @param {string} key Theme key from main.json.
 * @param {MainThemeEntry} theme Theme definition.
 * @returns {string} Visible theme label.
 */
function themeText(key: string, theme: MainThemeEntry): string {
    return theme.name?.trim() || key;
}

/**
 * Render helper for the shared collapse wiring.
 * @param {boolean} open Whether the drawer is open.
 * @returns {DocumentFragment} Plus or minus icon fragment.
 */
function renderTgl(open: boolean): DocumentFragment {
    return render2Frag(open ? icons.MakeDecreaseFontIcon() : icons.MakeIncreaseFontIcon());
}

/**
 * Finds the collapsible theme picker bits.
 * @param {HTMLElement} root Theme picker shell.
 * @returns {ThemeEls | null} Theme elements, or null when the shell is incomplete.
 */
function themeEls(root: HTMLElement): ThemeEls | null {
    const body = root.querySelector(".menu-theme-body");
    const hdr = root.querySelector("[data-menu-theme-head]");
    const btn = root.querySelector("[data-menu-theme-tgl]");

    if (!(body instanceof HTMLDivElement)) return null;
    if (!(hdr instanceof HTMLElement)) return null;
    if (!(btn instanceof HTMLButtonElement)) return null;

    return {
        root,
        body,
        hdr,
        btn
    };
}

/**
 * Opens or closes the theme drawer using the shared helper animation.
 * @param {HTMLElement} root Theme picker shell.
 * @param {boolean} open Whether to open the drawer.
 * @returns {void}
 */
function setThemeDraw(root: HTMLElement, open: boolean): void {
    const els = themeEls(root);
    if (!els) return;

    helpers.animateCollapsibleOpen({
        root: els.root,
        body: els.body,
        header: els.hdr,
        toggle: els.btn,
        open,
        renderIcon: renderTgl,
        rootDatasetKey: "menuThemesOpen",
        collapseLabel: "Collapse theme picker",
        expandLabel: "Expand theme picker",
        collapseTitle: "Collapse theme picker",
        expandTitle: "Expand theme picker"
    });
}

/**
 * Wires the theme picker drawer closed by default.
 * @param {HTMLElement} root Theme picker shell.
 * @returns {void}
 */
function wireThemes(root: HTMLElement): void {
    const els = themeEls(root);
    if (!els) return;

    helpers.setCollapsibleOpen({
        root: els.root,
        body: els.body,
        header: els.hdr,
        toggle: els.btn,
        open: false,
        renderIcon: renderTgl,
        rootDatasetKey: "menuThemesOpen",
        collapseLabel: "Collapse theme picker",
        expandLabel: "Expand theme picker",
        collapseTitle: "Collapse theme picker",
        expandTitle: "Expand theme picker"
    });

    els.body.style.maxHeight = "0px";

    helpers.wireCollapsibleHeader({
        header: els.hdr,
        toggle: els.btn,
        getOpen: () => els.root.dataset.menuThemesOpen === "1",
        setOpen: (open: boolean) => {
            setThemeDraw(els.root, open);
        },
        wiredKey: "menuThemesWired"
    });
}

/**
 * Adds one theme radio option.
 * @param {HTMLElement} row Theme radio row.
 * @param {ThemeMap} map Full theme map.
 * @param {string} key Theme key from main.json.
 * @param {MainThemeEntry} theme Theme definition.
 * @param {string} active Current theme key.
 * @param {Document} root Document to create nodes from.
 * @returns {void}
 */
function addTheme(
    row: HTMLElement,
    map: ThemeMap,
    key: string,
    theme: MainThemeEntry,
    active: string,
    root: Document
): void {
    const opt = root.createElement("span");
    const rad = root.createElement("input");
    const lbl = root.createElement("label");
    const id = helpers.makeStableId("kc-theme_", key);

    opt.className = "menu-theme-item";

    rad.id = id;
    rad.type = "radio";
    rad.name = "site-theme";
    rad.value = key;
    rad.className = "menu-theme-radio";
    rad.checked = key === active;

    lbl.className = "menu-theme-label";
    lbl.htmlFor = id;
    lbl.textContent = themeText(key, theme);

    rad.addEventListener("change", () => {
        if (!rad.checked) return;
        setTheme(map, key, true, root);
    });

    opt.append(rad, lbl);
    row.appendChild(opt);
}

/**
 * Builds the row of theme radio buttons.
 * @param {ThemeMap} map Theme map from main.json.
 * @param {Document} root Document to create nodes from.
 * @returns {HTMLElement | null} Theme row, or null when no themes exist.
 */
function themeRow(map: ThemeMap, root: Document): HTMLElement | null {
    const entries = Object.entries(map);
    if (entries.length === 0) return null;

    const row = root.createElement("div");
    const active = initThemes(map, root);

    row.id = "main-menu-themes";
    row.className = "menu-themes";
    row.setAttribute("role", "radiogroup");
    row.setAttribute("aria-label", "Theme");

    entries.forEach(([key, theme]) => {
        addTheme(row, map, key, theme, active, root);
    });

    return row;
}

/**
 * Builds the visible theme picker label.
 * @param {Document} root Document to create nodes from.
 * @returns {HTMLElement} Theme picker label.
 */
function themeTitle(root: Document): HTMLElement {
    const title = root.createElement("span");
    const badge = root.createElement("span");
    const text = root.createElement("span");

    title.className = "menu-theme-title";
    badge.className = "menu-theme-new";
    badge.textContent = "New!";
    text.className = "menu-theme-prompt";
    text.textContent = "Pick a theme!";

    title.append(badge, text);
    return title;
}

/**
 * Builds the collapsible theme picker shell.
 * @param {ThemeMap} map Theme map from main.json.
 * @param {Document} root Document to create nodes from.
 * @returns {HTMLElement | null} Theme shell, or null when no themes exist.
 */
function themeShell(map: ThemeMap, root: Document): HTMLElement | null {
    const row = themeRow(map, root);
    if (!row) return null;

    const shell = root.createElement("section");
    const hdr = root.createElement("header");
    const actions = root.createElement("span");
    const btn = root.createElement("button");
    const body = root.createElement("div");
    const inner = root.createElement("div");
    const cap = root.createElement("span");

    shell.id = "main-menu-theme-shell";
    shell.className = "menu-theme-shell";

    hdr.className = "menu-theme-head kc-click-header";
    hdr.dataset.menuThemeHead = "1";
    hdr.role = "button";
    hdr.tabIndex = 0;
    hdr.appendChild(themeTitle(root));

    actions.className = "menu-theme-actions kc-click-header__actions";

    btn.type = "button";
    btn.className = "menu-theme-toggle kc-round-icon-btn kc-click-header__control";
    btn.dataset.menuThemeTgl = "1";
    btn.setAttribute("aria-controls", themeBodyId);

    actions.appendChild(btn);
    hdr.appendChild(actions);

    body.id = themeBodyId;
    body.className = "menu-theme-body";

    inner.className = "menu-theme-inner";

    cap.className = "menu-theme-caption";
    cap.textContent = "Themes:";

    inner.append(cap, row);
    body.appendChild(inner);
    shell.append(hdr, body);

    wireThemes(shell);

    return shell;
}

/**
 * Builds the main menu links from ui data.
 * Clears old copies first so the menu does not duplicate itself like a menace.
 * @param {MainJson} data UI json blob.
 * @param {Document} root Document to work in.
 * @returns {Promise<void>} Resolves after the menu is built.
 */
export async function createMenu(data: MainJson, root: Document = document): Promise<void> {
    const menu = root.getElementById("main-menu");
    if (!menu) throw new Error("Element #main-menu not found!");

    const links = root.createElement("div");
    links.id = "main-menu-links";
    links.className = "menu-links";

    Object.entries(data.mainMenu).forEach(([text, entry]) => {
        addLink(links, text, entry, root);
    });

    const themes = themeShell(data.themes ?? {}, root);

    menu.replaceChildren(links);

    if (themes) {
        menu.appendChild(themes);
    }
}