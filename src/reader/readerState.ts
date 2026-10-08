import { createReaderButtons } from "./buttonDefs.tsx";
import type { ReaderButtons, DebugApi } from "./types.ts";

declare global {
    interface Window {
        params: URLSearchParams;
        storyPath: string | null;
        storyName: string | null;
        chapter: number;
        fallback: HTMLElement | null;
        chapterCacheKey: string;
        lastKnownChapter: number;
        readerRoot: HTMLElement | null;
        storyPickerRoot: HTMLElement | null;
        buttons: ReaderButtons;

        __kcReaderCtrlObserver?: IntersectionObserver | null;
        readerTopAnchor?: HTMLElement | null;

        debug?: DebugApi;
    }
}

/** Initialise the legacy reader globals before its controllers hydrate the static page. */
window.params = new URLSearchParams(window.location.search);
window.storyPath = window.params.get("story");
window.storyName = window.storyPath ? (window.storyPath.split("/").pop() ?? null) : null;
window.chapter = parseInt(window.params.get("chapter") || "1");

window.fallback = document.getElementById("js-content-fallback");
if (window.fallback) window.fallback.style.display = "none";

window.chapterCacheKey = `chapterCache_${window.storyName}`;
window.lastKnownChapter = parseInt(localStorage.getItem(window.chapterCacheKey) || "0");

window.readerRoot = document.getElementById("reader");
window.storyPickerRoot = document.getElementById("story-picker");
window.buttons = createReaderButtons();
