import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const origin = "https://kittycrow.dev";
const pages = [
    "index", "about", "blog", "chat", "crtTest",
    "guestbook", "reader", "resources"
] as const;

const requiredAssets = [
    "data/main.json",
    "dist/main.js",
    "images/home.svg",
    "styles/styles.css",
    "ui/keyboard.html",
    "favicon.ico",
    "manifest.json",
    "robots.txt"
] as const;

const failures: string[] = [];
const exists = async (path: string): Promise<boolean> => {
    try {
        await access(resolve(root, path));
        return true;
    } catch {
        return false;
    }
};

const requirePath = async (path: string): Promise<void> => {
    if (!(await exists(path))) failures.push(`Missing generated path: ${path}`);
};

for (const page of pages) {
    const path = `${page}.html`;
    await requirePath(path);
}

for (const asset of requiredAssets) await requirePath(asset);

if (await exists("site")) failures.push("The obsolete site/ output directory still exists");

const localReferences = new Set<string>();
for (const page of pages) {
    const path = `${page}.html`;
    if (!(await exists(path))) continue;

    const html = await readFile(resolve(root, path), "utf8");
    const baseMatch = html.match(/<base\s+href=["']([^"']+)["']/i);
    const base = new URL(baseMatch?.[1] ?? "/", origin + "/");
    const attributes = html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi);

    for (const match of attributes) {
        const value = match[1];
        if (!value || value.startsWith("#")) continue;

        let url: URL;
        try {
            url = new URL(value, base);
        } catch {
            failures.push(`${path} contains an invalid local reference: ${value}`);
            continue;
        }

        if (url.origin !== origin) continue;
        if (url.pathname === "/external") continue;
        localReferences.add(url.pathname);
    }
}

async function resolvesLocally(pathname: string): Promise<boolean> {
    const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
    const clean = relative.replace(/\/+$/, "");
    const candidates = [relative || "index.html", clean + ".html"];

    for (const candidatePath of candidates) {
        const candidate = resolve(root, candidatePath);
        try {
            const info = await stat(candidate);
            if (info.isFile()) return true;
        } catch {
            // Check the next representation, including clean routes backed by .html.
        }
    }

    return false;
}

for (const pathname of localReferences) {
    if (await resolvesLocally(pathname)) continue;
    failures.push(`Generated HTML references a missing local path: ${pathname}`);
}

if (failures.length > 0) {
    for (const failure of failures) console.error("[routes] " + failure);
    process.exitCode = 1;
} else {
    console.log(`[routes] ${pages.length} generated root HTML pages found, with no site/ output.`);
    console.log(`[routes] ${localReferences.size} same-origin HTML references resolve to files or .html clean-route targets.`);
}
