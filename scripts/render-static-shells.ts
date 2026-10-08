import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { renderWindowsInHtml } from "./window-shells.ts";
import { renderRssFilterShell, renderRssLoadingState } from "../src/rss/staticShell.tsx";
import type { MainJson, MainMenuEntry } from "../src/uiFetch.ts";
import { renderMenuShell, renderToggleShell } from "../src/sharedShell.tsx";

const pages = [
    "index.html", "about.html", "blog.html", "chat.html",
    "guestbook.html", "reader.html", "resources.html",
    "crtTest.html"
] as const;

function iconOf(entry: MainMenuEntry): string | null {
    return typeof entry === "string" ? null : entry.icon?.trim() || null;
}

async function readIcon(path: string | null, size: number, cssClass: string): Promise<string | null> {
    if (!path) return null;
    if (!/^\/images\/[a-zA-Z0-9/_-]+\.svg$/.test(path)) {
        throw new Error("Unsupported local SVG path: " + path);
    }

    const raw = await readFile(path.slice(1), "utf8");
    const start = raw.search(/<svg\b/i);
    if (start < 0) throw new Error("No SVG root in " + path);

    const text = raw.slice(start).replace(/<svg\b([^>]*)>/i, (_whole, attributes: string) => {
        const originalWidth = Number.parseFloat(attributes.match(/\bwidth=["']([\d.]+)(?:px)?["']/i)?.[1] ?? "");
        const originalHeight = Number.parseFloat(attributes.match(/\bheight=["']([\d.]+)(?:px)?["']/i)?.[1] ?? "");
        const missingViewBox = !/\bviewBox\s*=/i.test(attributes);
        if (missingViewBox && (!Number.isFinite(originalWidth) || !Number.isFinite(originalHeight))) {
            throw new Error("SVG has no viewBox or intrinsic dimensions: " + path);
        }

        const viewBox = missingViewBox ? ` viewBox="0 0 ${originalWidth} ${originalHeight}"` : "";
        const clean = attributes
            .replace(/\s(?:width|height|class|version|enable-background)=(?:"[^"]*"|'[^']*')/gi, "");
        return `<svg${clean}${viewBox} width="${size}px" height="${size}px" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet" class="${cssClass}" style="width:${size}px;height:${size}px;display:block;flex:0 0 auto;max-width:none;max-height:none">`;
    });

    // Inline SVG fragment identifiers must not collide with those of other
    // icons. The browser renderer already namespaces these during hydration.
    const prefix = `kc-built-${size}-${cssClass.replace(/[^a-z0-9_-]+/gi, "-")}-${path.replace(/[^a-z0-9_-]+/gi, "-")}`;
    const ids = new Set(Array.from(text.matchAll(/\bid=(["'])([^"']+)\1/g), (match) => match[2]));
    const withIds = text.replace(/\bid=(["'])([^"']+)\1/g,
        (_match, quote: string, id: string) => `id=${quote}${prefix}-${id}${quote}`);
    const withPaints = withIds.replace(/url\(#([^)]+)\)/g,
        (_match, id: string) => ids.has(id) ? `url(#${prefix}-${id})` : `url(#${id})`);
    return withPaints.replace(/\b(xlink:href|href)=(["'])#([^"']+)\2/g,
        (_match, name: string, quote: string, id: string) =>
            `${name}=${quote}#${ids.has(id) ? `${prefix}-${id}` : id}${quote}`);
}

function fillEmptyElement(html: string, tag: string, id: string, markup: string): string {
    const pattern = new RegExp(`(<${tag}\\b[^>]*\\bid=["']${id}["'][^>]*>)(\\s*)(<\\/${tag}>)`, "i");
    if (!pattern.test(html)) throw new Error(`Missing empty ${tag}#${id} in generated page`);
    return html.replace(pattern, (_match, opening: string, _space: string, closing: string) =>
        opening + markup + closing
    );
}

function markNavigation(html: string): string {
    return html.replace(/<nav\b([^>]*\bid=["']main-menu["'][^>]*)>/i, (_match, attributes: string) =>
        `<nav${attributes} data-kc-static-shell="1">`
    );
}

function addInlineData(html: string, data: MainJson): string {
    const encoded = JSON.stringify(data).replace(/</g, "\\u003c");
    const payload = `<script id="kc-static-ui-data" type="application/json">${encoded}</script>`;
    return html.replace(/<\/body>/i, payload + "\n</body>");
}

/** Build the terminal's final containers rather than creating them on each visit. */
function renderTerminalShell(html: string): string {
    if (!html.includes('id="terminal-wrapper"')) return html;

    const emptyTerminal = /<div\s+id=["']terminal["']\s*>\s*<\/div>/i;
    if (!emptyTerminal.test(html)) throw new Error("Missing empty terminal source element");

    const shell = '<div id="terminal-scroll"><div id="term"></div></div>';
    return html.replace(emptyTerminal, shell);
}

/** Discover the hashed, lazy esbuild terminal chunk for early network loading. */
async function terminalModulePath(): Promise<string> {
    const files = await readdir("dist/chunks");
    const chunk = files.find((name) => /^terminal-[a-z0-9]+\.js$/i.test(name));
    if (!chunk) throw new Error("Missing locally bundled terminal chunk");
    return "/dist/chunks/" + chunk;
}

function preloadTerminal(html: string, terminalUrl: string): string {
    if (!html.includes('id="terminal-wrapper"')) return html;
    const link = `<link rel="modulepreload" href="${terminalUrl}">`;
    return html.replace(/<\/head>/i, link + "\n</head>");
}

/** Use RSS's real TSX components to finish the blog/resources skeleton at build time. */
function renderRssShell(html: string, page: string): string {
    if (page !== "blog.html" && page !== "resources.html") return html;

    const body = /<div\s+class=["']blog-container["']\s*>\s*<\/div>/i;
    if (!body.test(html)) throw new Error("RSS content mount missing in " + page);

    const content = `<div class="blog-container" data-rss-built="1">${renderRssLoadingState()}</div>`;
    let output = html.replace(body, content);
    if (page === "resources.html") return output;

    const calendar = /<div\s+id=["']kc-blog-cal-filter["'][^>]*>\s*<\/div>/i;
    if (!calendar.test(output)) throw new Error("Blog calendar mount missing in " + page);

    output = output.replace(calendar, renderRssFilterShell());
    return output;
}

function addButtons(html: string, buttons: readonly string[]): string {
    return html.replace(/<\/body>/i, buttons.join("\n") + "\n</body>");
}

async function buildShell(page: string, data: MainJson, iconMap: Readonly<Record<string, string>>, terminalUrl: string): Promise<void> {
    const path = join("templates", page);
    let html = await readFile(path, "utf8");

    // The CRT test page deliberately contains no shared navigation or terminal.
    if (!/<nav\b[^>]*\bid=["']main-menu["']/i.test(html)) {
        await writeFile(page, html, "utf8");
        return;
    }

    html = fillEmptyElement(html, "nav", "main-menu", renderMenuShell(data, iconMap));
    html = markNavigation(html);
    html = fillEmptyElement(
        html, "footer", "main-footer",
        data.footer.replace("${year}", String(new Date().getFullYear()))
    );

    const toggleIcons = {
        theme: await readIcon(data.themeToggle.lightIconPath ?? null, 32, "theme-toggle-button__svg"),
        effects: await readIcon(data.effects.iconPath ?? null, 32, "effects-toggle-button__svg"),
        crt: await readIcon(data.crtUi?.iconPath ?? null, 32, "effects-toggle-button__svg"),
        reader: await readIcon(data.readerModeToggle.enableIconPath ?? null, 32, "theme-toggle-button__svg"),
        speak: await readIcon(data.readAloudToggle.enableIconPath ?? data.readAloudToggle.iconPath ?? null, 32, "theme-toggle-button__svg")
    };

    const buttons = [
        renderToggleShell(
            "theme-toggle", data.themeToggle.title || "Theme", data.themeToggle.light,
            "theme-toggle-button", null, toggleIcons.theme, data.themeToggle.lightIconPath ?? null
        ),
        renderToggleShell(
            "effects-toggle", data.effects.title, data.effects.icon,
            "theme-toggle-button effects-toggle-button", "80px", toggleIcons.effects,
            data.effects.iconPath ?? null, "effects-toggle-button__icon"
        )
    ];

    if (data.crtUi) {
        buttons.push(renderToggleShell(
            "crt-ui-toggle", data.crtUi.title, data.crtUi.icon,
            "theme-toggle-button", "140px", toggleIcons.crt,
            data.crtUi.iconPath ?? null, "effects-toggle-button__icon"
        ));
    }

    if (page === "reader.html") {
        buttons.push(renderToggleShell(
            "reader-toggle", data.readerModeToggle.title || "Reader Mode", data.readerModeToggle.enable,
            "theme-toggle-button", "140px", toggleIcons.reader, data.readerModeToggle.enableIconPath ?? null
        ));
        buttons.push(renderToggleShell(
            "read-aloud-toggle", data.readAloudToggle.title || "Read Aloud", data.readAloudToggle.enable,
            "theme-toggle-button", "200px", toggleIcons.speak,
            data.readAloudToggle.enableIconPath ?? data.readAloudToggle.iconPath ?? null
        ));
    }

    html = renderRssShell(html, page);
    html = preloadTerminal(renderTerminalShell(html), terminalUrl);
    html = renderWindowsInHtml(html, data);
    html = addButtons(html, buttons);
    html = addInlineData(html, data);

    await writeFile(page, html, "utf8");
}

export async function renderStaticShells(): Promise<void> {
    const data = JSON.parse(await readFile("data/main.json", "utf8")) as MainJson;
    const icons = Object.values(data.mainMenu).map(iconOf).filter((path): path is string => !!path);
    const iconMap: Record<string, string> = {};

    for (const path of new Set(icons)) {
        iconMap[path] = await readIcon(path, 16, "reader-ui-icon menu-button-icon") ?? "";
    }

    const terminalUrl = await terminalModulePath();
    for (const page of pages) await buildShell(page, data, iconMap, terminalUrl);
    console.log("[pages] Generated eight flat HTML pages into repository root from templates/.");
}
