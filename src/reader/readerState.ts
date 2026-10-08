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

