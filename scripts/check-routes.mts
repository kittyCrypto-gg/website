import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("site");
const origin = "https://kittycrow.dev";

const pages = [
    "about",
    "blog",
    "chat",
    "crtTest",
    "guestbook",
    "reader",
    "resources"
] as const;

const requiredAssets = [
    "data/main.json",
    "dist/main.js",
    "images/home.svg",
    "styles/styles.css",
    "ui/keyboard.html",
    "favicon.ico",
    "manifest.json",
    "robots.txt",
    ".nojekyll"
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

await requirePath("index.html");
for (const asset of requiredAssets) await requirePath(asset);

for (const page of pages) {
    const canonical = `${page}/index.html`;
    const legacy = `${page}.html`;
    await requirePath(canonical);
    await requirePath(legacy);

    if (!(await exists(canonical)) || !(await exists(legacy))) continue;

    const canonicalHtml = await readFile(resolve(root, canonical), "utf8");
    if (!/<base\s+href=["']\/["']>/i.test(canonicalHtml)) {
        failures.push(`${canonical} does not set <base href="/">`);
    }

    const legacyHtml = await readFile(resolve(root, legacy), "utf8");
    const target = `/${page}/`;
    if (!legacyHtml.includes(`rel="canonical" href="${target}"`)) {
        failures.push(`${legacy} does not declare ${target} as canonical`);
    }
    if (!legacyHtml.includes(`location.replace("${target}"`)) {
        failures.push(`${legacy} does not preserve query/hash while redirecting to ${target}`);
    }
}

const localReferences = new Set<string>();
for (const route of ["/", ...pages.map((page) => `/${page}/`)]) {
    const file = route === "/" ? "index.html" : `${route.slice(1)}index.html`;
    if (!(await exists(file))) continue;

    const html = await readFile(resolve(root, file), "utf8");
    const baseMatch = html.match(/<base\s+href=["']([^"']+)["']/i);
    const base = new URL(baseMatch?.[1] ?? route, `${origin}${route}`);
    const attributes = html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi);

    for (const match of attributes) {
        const value = match[1];
        if (!value || value.startsWith("#")) continue;

        let url: URL;
        try {
            url = new URL(value, base);
        } catch {
            failures.push(`${file} contains an invalid local reference: ${value}`);
            continue;
        }

        if (url.origin !== origin) continue;
        if (url.pathname === "/external") continue;
        localReferences.add(url.pathname);
    }
}

for (const pathname of localReferences) {
    const relative = decodeURIComponent(pathname).replace(/^\/+/, "");
    const candidate = resolve(root, relative || "index.html");

    try {
        const info = await stat(candidate);
        if (info.isDirectory()) await access(resolve(candidate, "index.html"));
    } catch {
        failures.push(`Generated HTML references a missing local path: ${pathname}`);
    }
}

for (const leaked of ["src", "vendor", "node_modules", "package.json", "build.mts"]) {
    if (await exists(leaked)) failures.push(`Build output leaked project source: ${leaked}`);
}

if (failures.length > 0) {
    for (const failure of failures) console.error(`[routes] ${failure}`);
    process.exitCode = 1;
} else {
    console.log(`[routes] ${String(pages.length + 1)} canonical pages and ${String(pages.length)} legacy redirects passed.`);
    console.log(`[routes] ${String(localReferences.size)} same-origin HTML references resolve inside site/.`);
}
