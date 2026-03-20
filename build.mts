import { readdir } from "node:fs/promises";
import path from "node:path";
import * as esbuild from "esbuild";

/**
 * @param {string} filePath
 * @returns {string}
 */
function norm(filePath: string): string {
    return filePath.replaceAll("\\", "/");
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walk(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });

    const nested = await Promise.all(
        entries.map(async (entry): Promise<string[]> => {
            const fullPath = path.join(dir, entry.name);
            return entry.isDirectory() ? walk(fullPath) : [fullPath];
        })
    );

    return nested.flat();
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isEntry(filePath: string): boolean {
    const file = norm(filePath);

    if (!file.startsWith("src/")) return false;
    if (file.endsWith(".d.ts")) return false;

    return file.endsWith(".ts") || file.endsWith(".tsx");
}

/**
 * @returns {Promise<string[]>}
 */
async function getEntries(): Promise<string[]> {
    const allFiles = await walk("src");
    return allFiles.filter(isEntry).sort((a, b) => a.localeCompare(b));
}

const entryPoints = await getEntries();

if (entryPoints.length === 0) {
    throw new Error("No entry points found under src.");
}

await esbuild.build({
    entryPoints,
    outdir: "dist",
    outbase: "src",
    bundle: true,
    splitting: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    entryNames: "[dir]/[name]",
    chunkNames: "chunks/[name]-[hash]",
    logLevel: "info"
});