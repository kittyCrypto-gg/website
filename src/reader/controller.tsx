import type { ReactElement } from "react";
import { removeExistingById, recreateSingleton } from "../domSingletons.ts";
import { getReaderNds, replaceTategaki } from "../tategaki.tsx";
import { replaceSsmlAuthoring } from "../ssml.ts";
import MediaStyler from "../mediaStyler.tsx";
import * as config from "../config.ts";
import { render2Frag, render2Mkup } from "../reactHelpers.tsx";
import * as icons from "../icons.tsx";
import * as helpers from "../helpers.ts";
import type {
    ChaptersIndexResult,
    DebugApi,
    ReaderButtonDef,
    ReaderButtons,
    RenderXmlDocOpts,
    StoriesIndex
} from "./types.ts";
import {
    MissingCh,
    ReaderCtrls,
    setButtonIcon
} from "./views.tsx";
import {
    getRCookie,
    initPNumCookie,
    refreshPNum,
    setRCookie,
    togglePNum
} from "./paragraphNumbers.ts";
import {
    buildReaderHtml,
    wrapBookmark
} from "./chapterHtml.tsx";
import {
    initLanguageTipObserver,
    openReaderInfo
} from "./helpModals.tsx";
import {
    detachReaderControls,
    syncControlDock,
    syncTopScrollMode
} from "./controlDock.ts";
import { activateImageNavigation } from "./imageNavigation.tsx";
import { createReaderButtons } from "./buttonDefs.tsx";
import { parseXml, pickFile, readFileText } from "./fileXml.ts";
import {
    injectBookmarksIntoHTML,
    makeStoryKey,
    restoreBookmark,
    restoreLastRead,
    watchBookmarks
} from "./bookmarks.tsx";

void recreateSingleton;


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

/**
 * @returns {number[]}
 */
function readChCache(): number[] {
    const raw: unknown = JSON.parse(localStorage.getItem(window.chapterCacheKey) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

window.params = new URLSearchParams(window.location.search);
window.storyPath = window.params.get("story");
window.storyName = window.storyPath ? (window.storyPath.split("/").pop() ?? null) : null;
window.chapter = parseInt(window.params.get("chapter") || "1");

const params = window.params;

window.fallback = document.getElementById("js-content-fallback");
if (window.fallback) window.fallback.style.display = "none";

window.chapterCacheKey = `chapterCache_${window.storyName}`;
window.lastKnownChapter = parseInt(localStorage.getItem(window.chapterCacheKey) || "0");

window.readerRoot = document.getElementById("reader");
window.storyPickerRoot = document.getElementById("story-picker");

window.buttons = createReaderButtons();

/**
 * @param {Document} doc
 * @param {readonly string[]} aliases
 * @returns {Element[]}
 */
function getElsByAliases(doc: Document, aliases: readonly string[]): Element[] {
    for (const tag of aliases) {
        const found = doc.getElementsByTagName(tag);
        if (found.length > 0) return Array.from(found);
    }
    return [];
}

/**
 * @param {number} chapter
 * @param {number[]} chapters
 * @returns {boolean}
 */
function prevBtnEn(chapter: number, chapters: number[]): boolean {
    const hasCh0 = chapters.includes(0);
    chapter = Number(chapter);
    if (chapter <= 1 && !hasCh0) return false;
    if (chapter <= 0) return false;
    return true;
}

/**
 * @param {Document} root
 * @returns {void}
 */
function updatePrevBtn(root: Document = document): void {
    const chapters = readChCache();
    const enablePrev = prevBtnEn(window.chapter, chapters);

    root.querySelectorAll<HTMLButtonElement>(".btn-prev").forEach((btn) => {
        btn.disabled = !enablePrev;
    });
}

/**
 * @param {Document} _root
 * @returns {void}
 */
function clearBkm(_root?: Document): void {
    void _root;

    const base = getStoryBase();
    if (!base) return;

    const storyKey = makeStoryKey(base);
    localStorage.removeItem(`bookmark_${storyKey}_ch${window.chapter}`);
    showTmpNotice("Bookmark cleared for this chapter.");
}

/**
 * @param {string} msg
 * @param {number} timeout
 * @returns {void}
 */
function showTmpNotice(msg: string, timeout = 1000): void {
    const note = document.createElement("div");
    note.textContent = msg;
    note.style.position = "fixed";
    note.style.top = "50%";
    note.style.left = "50%";
    note.style.transform = "translate(-50%, -50%)";
    note.style.background = "var(--chatroom-bg-colour)";
    note.style.color = "var(--chatroom-text-colour)";
    note.style.padding = "10px 20px";
    note.style.borderRadius = "8px";
    note.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    note.style.zIndex = "9999";
    document.body.appendChild(note);

    setTimeout(() => {
        note.remove();
    }, timeout);
}

/**
 * @returns {void}
 */
function injectNav(): void {
    const TOP_ID = "kc-reader-controls-top";
    const BOTTOM_ID = "kc-reader-controls-bottom";

    const existingTop = document.getElementById(TOP_ID);
    const existingBottom = document.getElementById(BOTTOM_ID);

    // Build-time DOM is already structurally complete. Hydration only
    // reveals those controls and binds events as story data arrives.
    if (existingTop && existingBottom) {
        existingTop.removeAttribute("hidden");
        existingBottom.removeAttribute("hidden");
        return;
    }

    // Backwards compatibility for HTML generated before static reader shells.
    removeExistingById(TOP_ID);
    removeExistingById(BOTTOM_ID);

    const navTop = document.createElement("div");
    navTop.id = TOP_ID;
    navTop.classList.add("reader-controls-top");
    navTop.appendChild(render2Frag(<ReaderCtrls />));

    const navBottom = document.createElement("div");
    navBottom.id = BOTTOM_ID;
    navBottom.classList.add("reader-controls-bottom");
    navBottom.appendChild(render2Frag(<ReaderCtrls bottom />));

    if (!window.readerRoot) return;
    window.readerRoot.insertAdjacentElement("beforebegin", navTop);
    window.readerRoot.insertAdjacentElement("afterend", navBottom);
}

/**
 * @param {number} delta
 * @returns {void}
 */
function updateFont(delta = 0): void {
    const cur = parseFloat(getRCookie("fontSize") || "") || 1;
    const next = Math.max(0.7, Math.min(2.0, cur + delta));
    setRCookie("fontSize", next.toFixed(2));
    window.readerRoot!.style.setProperty("font-size", `${next}em`);
    refreshTatFont();
}

/**
 * @param {Document} root
 * @returns {void}
 */
function bindNavEvents(root: Document = document): void {
    const chapters = readChCache();

    root.querySelectorAll<HTMLButtonElement>(".btn-toggle-paragraph-numbers").forEach((btn) => {
        btn.onclick = () => togglePNum();
    });

    root.querySelectorAll<HTMLButtonElement>(".btn-prev").forEach((btn) => (btn.onclick = () => {
        if (!prevBtnEn(window.chapter, chapters)) {
            btn.disabled = true;
            return;
        }
        jumpTo(window.chapter - 1);
    }));

    root.querySelectorAll<HTMLButtonElement>(".btn-next").forEach((btn) => (btn.onclick = () => {
        if (window.chapter < window.lastKnownChapter) jumpTo(window.chapter + 1);
    }));

    root.querySelectorAll<HTMLButtonElement>(".btn-jump").forEach((btn) => {
        btn.onclick = () => {
            const input = btn.parentElement!.querySelector(".chapter-input") as HTMLInputElement | null;
            if (!input) return;

            const val = parseInt(input.value, 10);
            if (!isNaN(val) && val >= 0 && val <= window.lastKnownChapter) {
                jumpTo(val);
            }
        };
    });

    root.querySelectorAll<HTMLInputElement>(".chapter-input").forEach((input) => {
        input.value = String(window.chapter);
        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key !== "Enter") return;

            const target = e.target as HTMLInputElement;
            const val = parseInt(target.value, 10);
            if (val >= 0 && val <= window.lastKnownChapter) jumpTo(val);
        });
    });

    root.querySelectorAll<HTMLButtonElement>(".btn-rescan").forEach((btn) => (btn.onclick = async () => {
        localStorage.removeItem(window.chapterCacheKey);
        const chapters = await discoverChs();
        window.lastKnownChapter = chapters.length > 0 ? Math.max(...chapters) : 0;
        updateNav();
    }));

    root.querySelectorAll<HTMLButtonElement>(".btn-clear-bookmark").forEach((btn) => {
        btn.onclick = () => clearBkm(root);
    });

    root.querySelectorAll<HTMLButtonElement>(".font-increase").forEach((btn) => (btn.onclick = () => updateFont(0.1)));
    root.querySelectorAll<HTMLButtonElement>(".font-decrease").forEach((btn) => (btn.onclick = () => updateFont(-0.1)));
    root.querySelectorAll<HTMLButtonElement>(".font-reset").forEach((btn) => (btn.onclick = () => updateFont(0)));
    root.querySelectorAll<HTMLButtonElement>(".btn-info").forEach((btn) => (btn.onclick = openReaderInfo));
}

// /**
//  * @param {Document} root
//  * @returns {Promise<void>}
//  */
// async function populatePicker(root: Document = document): Promise<void> {
//     if (!window.storyPickerRoot) return;
//     try {
//         const res = await fetch(`${config.storiesIndexURL}`);
//         if (!res.ok) throw new Error("No stories found");
//         const storiesUnknown: unknown = await res.json();

//         if (!helpers.isRecord(storiesUnknown)) throw new Error("Invalid stories index format");
//         const stories = storiesUnknown as StoriesIndex;

//         const select = root.createElement("select");
//         select.className = "story-selector";
//         select.setAttribute("id", "reader-story-selector");
//         select.innerHTML = render2Mkup(<option value="">Select a story...</option>);

//         Object.keys(stories).forEach((name) => {
//             const opt = root.createElement("option");
//             opt.value = name;
//             opt.textContent = name;
//             if (name === window.storyName) opt.selected = true;
//             select.appendChild(opt);
//         });

//         select.onchange = () => {
//             if (select.value) {
//                 window.location.search = `?story=${encodeURIComponent(select.value)}&chapter=1`;
//             }
//         };

//         window.storyPickerRoot.appendChild(select);
//     } catch (err) {
//         console.warn("No stories found or failed to load stories.json", err);
//     }
// }

/**
 * @param {Document} root
 * @returns {Promise<void>}
 */
async function populatePicker(root: Document = document): Promise<void> {
    const picker = window.storyPickerRoot;
    if (!picker) return;

    const makePickerHint = (): HTMLDivElement => {
        const hint = root.createElement("div");

        hint.className = "story-dropdown__hint";
        hint.textContent = "Pick a story...";
        hint.setAttribute("aria-hidden", "true");

        return hint;
    };

    const makeSizerItem = (text: string, className = ""): HTMLDivElement => {
        const item = root.createElement("div");

        item.className = ["story-dropdown__sizer-item", className]
            .filter(Boolean)
            .join(" ");

        item.textContent = text;

        return item;
    };

    try {
        const res = await fetch(`${config.storiesIndexURL}`);
        if (!res.ok) throw new Error("No stories found");

        const storiesUnknown: unknown = await res.json();

        if (!helpers.isRecord(storiesUnknown)) {
            throw new Error("Invalid stories index format");
        }

        const stories = storiesUnknown as StoriesIndex;
        const storyNames = Object.keys(stories);

        const makeStoryHref = (storyName: string): string =>
            `${window.location.pathname}?story=${encodeURIComponent(storyName)}&chapter=1`;

        const makeStoryItem = (storyName: string): HTMLAnchorElement => {
            const item = root.createElement("a");

            item.className = "story-dropdown__item";
            item.href = makeStoryHref(storyName);
            item.textContent = storyName;

            if (storyName === window.storyName) {
                item.classList.add("is-current");
                item.setAttribute("aria-current", "page");
            }

            return item;
        };

        const existing = picker.querySelector(".story-dropdown[data-kc-story-static]");
        const dropdown = existing instanceof HTMLDivElement ? existing : root.createElement("div");
        dropdown.className = "story-dropdown";

        const button = dropdown.querySelector<HTMLButtonElement>("#reader-story-selector") ?? root.createElement("button");
        button.id = "reader-story-selector";
        button.type = "button";
        button.className = "story-dropdown__button";
        button.textContent = window.storyName || "Pick a story...";
        button.setAttribute("aria-haspopup", "true");

        const sizer = dropdown.querySelector<HTMLDivElement>(".story-dropdown__sizer") ?? root.createElement("div");
        sizer.replaceChildren();
        sizer.className = "story-dropdown__sizer";
        sizer.setAttribute("aria-hidden", "true");

        sizer.appendChild(makeSizerItem("Pick a story...", "story-dropdown__sizer-item--hint"));

        storyNames
            .map((storyName) => makeSizerItem(storyName))
            .forEach((item) => sizer.appendChild(item));

        const menu = dropdown.querySelector<HTMLDivElement>(".story-dropdown__content") ?? root.createElement("div");
        menu.replaceChildren();
        menu.className = "story-dropdown__content";

        menu.appendChild(makePickerHint());

        storyNames
            .map(makeStoryItem)
            .forEach((item) => menu.appendChild(item));

        if (!(existing instanceof HTMLDivElement)) picker.replaceChildren(dropdown);
        if (button.parentElement !== dropdown) dropdown.appendChild(button);
        if (sizer.parentElement !== dropdown) dropdown.appendChild(sizer);
        if (menu.parentElement !== dropdown) dropdown.appendChild(menu);
    } catch (err) {
        console.warn("No stories found or failed to load stories.json", err);
    }
}

/**
 * @param {string | null} storyName
 * @returns {string | null}
 */
function getStoryBase(storyName: string | null = null): string | null {
    const name = storyName || window.storyName || (window.storyPath ? window.storyPath.split("/").pop() : null);
    if (!name) return null;
    return `${config.storiesURL}/${encodeURIComponent(name)}`;
}

const media = new MediaStyler();

/**
 * @param {number} n
 * @returns {Promise<void>}
 */
async function loadCh(n: number): Promise<void> {
    window.chapter = n;
    try {
        const base = getStoryBase();
        if (!base) throw new Error("No story selected.");

        const res = await fetch(`${base}/chapt${n}.xml`);
        if (!res.ok) throw new Error("Chapter not found");
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        const readerNodes = getReaderNds(xmlDoc);

        let htmlContent = buildReaderHtml(readerNodes);

        htmlContent = await media.replaceEmails(htmlContent);
        htmlContent = await media.replaceSmsMessages(htmlContent);
        htmlContent = await replaceTategaki(htmlContent);
        htmlContent = await replaceSsmlAuthoring(htmlContent);
        htmlContent = await media.replaceImageTags(htmlContent);
        htmlContent = await media.replaceTooltips(htmlContent);
        htmlContent = await injectBookmarksIntoHTML(htmlContent, base, window.chapter);

        window.readerRoot!.innerHTML = htmlContent;
        await media.replaceSVGs(window.readerRoot!);

        requestAnimationFrame(() => {
            refreshPNum(document);
        });

        watchBookmarks(document);

        requestAnimationFrame(() => {
            restoreBookmark(base, window.chapter);
            syncTopScrollMode(document);
            syncControlDock(document);
        });

        activateImageNavigation(document);

        updateNav(document);
        bindNavEvents(document);
        initLanguageTipObserver(document);
        setRCookie(`bookmark_${makeStoryKey(base)}`, String(window.chapter));
        window.scrollTo(0, 0);
    } catch (err) {
        window.readerRoot!.innerHTML = render2Mkup(<MissingCh chapter={n} />);
        console.error(err);
    }
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
async function discoverChs(storyName: string | null = null): Promise<number[]> {
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
function jumpTo(n: number): void {
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

/**
 * @param {Document} root
 * @returns {void}
 */
function refreshTatFont(root: Document = document): void {
    const px = parseFloat(getComputedStyle(window.readerRoot as unknown as Element).fontSize);
    root
        .querySelectorAll<SVGTextElement>(".tategaki-container svg text")
        .forEach((t) => t.setAttribute("font-size", String(px)));
}

/**
 * @param {Document} root
 * @returns {void}
 */
function updateNav(root: Document = document): void {
    root.querySelectorAll<HTMLInputElement>(".chapter-display").forEach((el) => (el.value = String(window.chapter)));
    root.querySelectorAll<HTMLButtonElement>(".chapter-end").forEach((btn) => (btn.textContent = String(window.lastKnownChapter)));

    root.querySelectorAll<HTMLButtonElement>(".btn-next").forEach((btn) => {
        btn.disabled = window.chapter === window.lastKnownChapter;
    });

    updatePrevBtn(root);
    syncTopScrollMode(root);
}

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

/**
 * @param {Document} xmlDoc
 * @param {RenderXmlDocOpts} opts
 * @returns {Promise<void>}
 */
async function renderXmlDoc(xmlDoc: Document, opts: RenderXmlDocOpts): Promise<void> {
    const readerNodes = getReaderNds(xmlDoc);

    let htmlContent: string = buildReaderHtml(readerNodes);

    htmlContent = await media.replaceEmails(htmlContent);
    htmlContent = await media.replaceSmsMessages(htmlContent);
    htmlContent = await replaceTategaki(htmlContent);
    htmlContent = await replaceSsmlAuthoring(htmlContent);
    htmlContent = await media.replaceImageTags(htmlContent);

    if (opts.withBookmarks && opts.storyBase && Number.isInteger(opts.chapter)) {
        htmlContent = await injectBookmarksIntoHTML(
            htmlContent,
            opts.storyBase,
            opts.chapter as number
        );
    }

    window.readerRoot!.innerHTML = htmlContent;
    await media.replaceSVGs(window.readerRoot!);

    requestAnimationFrame(() => {
        refreshPNum(document);
    });

    watchBookmarks(document);
    activateImageNavigation(document);
    bindNavEvents(document);
    initLanguageTipObserver(document);
    refreshTatFont(document);
    syncTopScrollMode(document);
    syncControlDock(document);

    if (opts.withBookmarks && opts.storyBase && Number.isInteger(opts.chapter)) {
        requestAnimationFrame(() => {
            restoreBookmark(opts.storyBase as string, opts.chapter as number);
            syncTopScrollMode(document);
            syncControlDock(document);
        });
    }
}

window.debug = window.debug || {};

window.debug.pickXml = async function (): Promise<void> {
    const file = await pickFile(".xml,application/xml,text/xml");
    if (!file) return;

    const xmlText = await readFileText(file);
    const xmlDoc = parseXml(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

window.debug.renderXmlText = async function (xmlText: string): Promise<void> {
    const xmlDoc = parseXml(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

window.debug.renderXmlFile = async function (file: File): Promise<void> {
    const xmlText = await readFileText(file);
    const xmlDoc = parseXml(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

if (/\/reader(?:\.html)?(?:\/|$)/.test(window.location.pathname)) bootReader();

export const readerModeFocus = "#reader";

export const readerModeKeep: readonly string[] = [
    "#reader",
    "#story-picker",
    "#kc-reader-controls-top",
    "#kc-reader-controls-bottom"
];