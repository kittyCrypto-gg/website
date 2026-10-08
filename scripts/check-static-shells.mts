import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const routes = [
    "index.html", "about.html", "blog.html",
    "chat.html", "guestbook.html", "reader.html",
    "resources.html"
] as const;

const errors: string[] = [];
const matches = (html: string, re: RegExp): string[] =>
    Array.from(html.matchAll(re), (match) => match[1] ?? "");

for (const path of routes) {
    const html = await readFile(resolve(path), "utf8");
    const frameIds = matches(html, /\bdata-kc-static-window="([^"]+)"/g);
    const launcherIds = matches(html, /\bdata-kc-static-window-launcher="([^"]+)"/g);

    if (!html.includes('data-kc-static-shell="1"')) errors.push(path + ": static navigation missing");
    if (!html.includes('id="main-menu-links"')) errors.push(path + ": navigation links missing");
    if (!html.includes('id="main-menu-themes"')) errors.push(path + ": theme picker missing");
    if (!html.includes('id="kc-static-ui-data"')) errors.push(path + ": embedded UI configuration missing");
    const effectsButton = html.match(/<button\b[^>]*id="effects-toggle"[^>]*>[\s\S]*?<\/button>/i)?.[0] ?? "";
    if (!effectsButton.includes('viewBox="0 0 48 48"')) {
        errors.push(path + ": iMac G3 SVG must keep its original 48x48 coordinate system");
    }
    if (!effectsButton.includes("url(#kc-built-32-")) {
        errors.push(path + ": iMac G3 SVG gradient references are not namespaced");
    }
    for (const svg of html.matchAll(/<svg\b([^>]*)>/gi)) {
        if (/\bviewBox=/.test(svg[1] ?? "")) continue;
        errors.push(path + ": inline SVG without a viewBox");
    }
    if (!/<footer\b[^>]*\bid="main-footer"[^>]*>\s*[^\s<]/i.test(html)) {
        errors.push(path + ": empty generated footer");
    }

    if (frameIds.length === 0) errors.push(path + ": no pre-rendered window frames");
    if (frameIds.length !== new Set(frameIds).size) {
        errors.push(path + ": duplicate pre-rendered window ids");
    }
    if (frameIds.length !== launcherIds.length) {
        errors.push(path + ": frame and launcher counts differ");
    }

    for (const id of frameIds) {
        if (!html.includes(`id="${id}-header"`)) errors.push(path + ": missing window header: " + id);
        if (!html.includes(`id="${id}-body"`)) errors.push(path + ": missing window body: " + id);
        if (!html.includes(`id="window-api-launcher-${id}"`)) errors.push(path + ": missing launcher: " + id);
    }

    console.log(`[shells] ${path}: ${frameIds.length} pre-rendered windows`);
}

for (const error of errors) console.error("[shells] " + error);

if (errors.length > 0) process.exitCode = 1;
else console.log("[shells] Seven shared pages have pre-rendered navigation, footer, controls and window frames.");
