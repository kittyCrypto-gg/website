import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import type { ChaptersIndexResult, StoriesIndex } from "./types.ts";

/**
 * @returns {number[]}
 */
export function readChCache(): number[] {
    const raw: unknown = JSON.parse(localStorage.getItem(window.chapterCacheKey) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

/**
 * @param {string | null} storyName
 * @returns {string | null}
 */
export function getStoryBase(storyName: string | null = null): string | null {
    const name = storyName || window.storyName || (window.storyPath ? window.storyPath.split("/").pop() : null);
    if (!name) return null;
    return `${config.storiesURL}/${encodeURIComponent(name)}`;
}

/**
 * @param {string} storyName
 * @returns {Promise<ChaptersIndexResult>}
 */
export async function getChapters(storyName: string): Promise<ChaptersIndexResult> {
    const indexRes = await fetch(`${config.storiesIndexURL}`);
    if (!indexRes.ok) throw new Error("Failed to load stories index");

    const indexUnknown: unknown = await indexRes.json();
    if (!helpers.isRecord(indexUnknown)) throw new Error("Invalid stories index format");
    const index = indexUnknown as StoriesIndex;

    const files = index[storyName];
    if (!Array.isArray(files)) return { chapters: [], urls: [] };

    const base = getStoryBase(storyName);

    const chapters = files
        .map((f) => {
            if (typeof f !== "string") return null;
            const m = /^chapt(\d+)\.xml$/i.exec(f);
            return m ? Number(m[1]) : null;
        })
        .filter((n): n is number => Number.isInteger(n))
        .sort((a, b) => a - b);

    const urls = chapters.map((n) => `${String(base)}/chapt${n}.xml`);

    return { chapters, urls };
}

/**
 * @param {string | null} storyName
 * @returns {Promise<number[]>}
 */
export async function discoverChs(storyName: string | null = null): Promise<number[]> {
    const { chapters } = await getChapters(storyName || String(window.storyName));

    const last = chapters.length > 0 ? Math.max(...chapters) : 0;
    window.lastKnownChapter = last;

    localStorage.setItem(window.chapterCacheKey, JSON.stringify(chapters));
    return chapters;
}

/**
 * @param {number} n
 * @returns {void}
 */
export function jumpTo(n: number): void {
    const curStoryPath =
        decodeURIComponent(window.storyPath as unknown as string) ||
        localStorage.getItem("currentStoryPath");

    if (!curStoryPath) {
        alert("No story selected. Please select a story first.");
        return;
    }

    localStorage.setItem("currentStoryPath", curStoryPath);

    const encodedPath = encodeURIComponent(curStoryPath);
    window.location.search = `?story=${encodedPath}&chapter=${n}`;
}
