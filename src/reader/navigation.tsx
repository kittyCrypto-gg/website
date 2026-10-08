import { removeExistingById } from "../domSingletons.ts";
import { render2Frag } from "../reactHelpers.tsx";
import { ReaderCtrls } from "./views.tsx";
import { readChCache, getStoryBase, discoverChs, jumpTo } from "./storyData.ts";
import { getRCookie, setRCookie, togglePNum } from "./paragraphNumbers.ts";
import { makeStoryKey } from "./bookmarks.tsx";
import { openReaderInfo } from "./helpModals.tsx";
import { syncTopScrollMode } from "./controlDock.ts";

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
export function injectNav(): void {
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
export function bindNavEvents(root: Document = document): void {
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

/**
 * @param {Document} root
 * @returns {void}
 */
export function refreshTatFont(root: Document = document): void {
    const px = parseFloat(getComputedStyle(window.readerRoot as unknown as Element).fontSize);
    root
        .querySelectorAll<SVGTextElement>(".tategaki-container svg text")
        .forEach((t) => t.setAttribute("font-size", String(px)));
}

/**
 * @param {Document} root
 * @returns {void}
 */
export function updateNav(root: Document = document): void {
    root.querySelectorAll<HTMLInputElement>(".chapter-display").forEach((el) => (el.value = String(window.chapter)));
    root.querySelectorAll<HTMLButtonElement>(".chapter-end").forEach((btn) => (btn.textContent = String(window.lastKnownChapter)));

    root.querySelectorAll<HTMLButtonElement>(".btn-next").forEach((btn) => {
        btn.disabled = window.chapter === window.lastKnownChapter;
    });

    updatePrevBtn(root);
    syncTopScrollMode(root);
}
