import * as helpers from "../helpers.ts";
import { restoreLastRead, makeStoryKey, watchBookmarks } from "./bookmarks.tsx";
import { getRCookie, initPNumCookie } from "./paragraphNumbers.ts";
import { syncControlDock, syncTopScrollMode, detachReaderControls } from "./controlDock.ts";
import { activateImageNavigation } from "./imageNavigation.tsx";
import { initLanguageTipObserver } from "./helpModals.tsx";
import { getStoryBase, discoverChs } from "./storyData.ts";
import { bindNavEvents, injectNav, refreshTatFont } from "./navigation.tsx";
import { populatePicker } from "./storyPicker.ts";
import { loadCh, media } from "./chapterRender.tsx";
import { restoreBookmark } from "./bookmarks.tsx";
import "./readerState.ts";
import "./readerDebug.ts";

/**
 * @returns {Promise<void>}
 */
async function initReader(): Promise<void> {
    await populatePicker(document);
    if (!window.storyPath) return;

    injectNav();
    detachReaderControls();
    initPNumCookie();

    const chapters = await discoverChs();
    window.lastKnownChapter = chapters.length > 0 ? Math.max(...chapters) : 0;

    if (!params.get("chapter")) {
        const bkm = parseInt(
            getRCookie(
                `bookmark_${encodeURIComponent(window.storyPath as unknown as string)}`
            ) as unknown as string
        );

        window.chapter =
            bkm && chapters.includes(bkm)
                ? bkm
                : 1;
    }

    await loadCh(window.chapter);

    const initFont = parseFloat(getRCookie("fontSize") || "") || 1;
    window.readerRoot!.style.setProperty("font-size", `${initFont}em`);
    syncTopScrollMode(document);
}

/**
 * @returns {void}
 */
function bootReader(): void {
    void helpers.waitForDomReady().then(() => {
        restoreLastRead();
        void initReader();
        activateImageNavigation(document);
        media.bindEmailActions();
    });

    document.addEventListener("click", (e: MouseEvent) => {
        const target = e.target as Element | null;
        if (!target) return;

        const button = target.closest("button");
        if (!(button instanceof HTMLButtonElement)) return;

        const bkms = Array.from(document.querySelectorAll(".reader-bookmark"));
        if (!bkms.length) return;

        const scrollDown = button.classList.contains("btn-scroll-down");
        const bottomCtrls = scrollDown
            ? document.querySelector(".reader-controls-bottom") as Element | null
            : null;

        if (scrollDown && !bottomCtrls) return;

        if (scrollDown && bottomCtrls) {
            bottomCtrls.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
            return;
        }

        if (button.classList.contains("btn-scroll-up")) {
            const anchor = window.readerTopAnchor || document.body.firstElementChild || document.body;

            (anchor as Element).scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
        }
    });
}

/**
 * @param {Document} root
 * @returns {Promise<void>}
 */
export async function setupReader(root: Document = document): Promise<void> {
    bindNavEvents(root);
    activateImageNavigation(root);
    refreshTatFont(root);
    watchBookmarks(root);
    initLanguageTipObserver(root);
    detachReaderControls();
    syncTopScrollMode(root);
}

/**
 * @returns {Promise<boolean>}
 */
export async function readerIsFullyLoaded(): Promise<boolean> {
    /**
     * @param {(...args: unknown[]) => void} cb
     * @returns {Promise<unknown>}
     */
    const rafP = async (
        cb: (...args: unknown[]) => void
    ): Promise<unknown> => {
        const done = await new Promise<unknown>((resolve) => {
            requestAnimationFrame(() => {
                cb(resolve);
            });
        });
        return done;
    };

    return new Promise<boolean>((resolve) => {
        /**
         * @param {...unknown[]} _args
         * @returns {Promise<void>}
         */
        const checkReady = async (..._args: unknown[]): Promise<void> => {
            void _args;

            if (
                document.readyState === "complete" &&
                document.querySelectorAll(".reader-bookmark").length > 0
            ) {
                resolve(true);
            }

            await rafP(checkReady);
        };

        void checkReady(resolve);
    });
}

/**
 * @returns {{ storyPath: string | null; chapter: number }}
 */
export function getParams(): { storyPath: string | null; chapter: number } {
    return {
        storyPath: window.storyPath,
        chapter: window.chapter
    };
}

/**
 * @param {string} bookmarkId
 * @returns {void}
 */
export function forceBookmark(bookmarkId: string): void {
    const base = getStoryBase();
    if (!base) return;

    const storyKey = makeStoryKey(base);
    const key = `bookmark_${storyKey}_ch${window.chapter}`;

    const target = document.getElementById(bookmarkId);
    if (!target) {
        console.warn(`No element found with ID "${bookmarkId}".`);
        return;
    }

    localStorage.setItem(key, bookmarkId);
}

if (/\/reader(?:\.html)?(?:\/|$)/.test(window.location.pathname)) bootReader();

export const readerModeFocus = "#reader";

export const readerModeKeep: readonly string[] = [
    "#reader", "#story-picker", "#kc-reader-controls-top", "#kc-reader-controls-bottom"
];
