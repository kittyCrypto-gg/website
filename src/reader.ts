import { removeExistingById, recreateSingleton } from "./domSingletons.ts";
import { replaceTategaki } from "./tategaki.ts";
import MediaStyler from "./mediaStyler.ts";

void recreateSingleton;

const READER_PARA_NUMS_COOKIE = "showParagraphNumbers";
const READER_PARA_NUMS_CLASS = "reader-show-paragraph-numbers";
const PNUM_TOGGLE_SELECTOR = ".btn-toggle-paragraph-numbers";

type ReaderButtonKey =
    | "toggleParagraphNumbers"
    | "clearBookmark"
    | "prevChapter"
    | "jumpToChapter"
    | "nextChapter"
    | "scrollDown"
    | "showInfo"
    | "decreaseFont"
    | "resetFont"
    | "increaseFont"
    | "scrollUp";

interface ReaderButtonDef {
    icon: string;
    action: string;
}

type ReaderButtons = Record<ReaderButtonKey, ReaderButtonDef>;

interface StoriesIndex {
    [storyName: string]: string;
}

interface ChaptersIndexResult {
    chapters: number[];
    urls: string[];
}

interface RenderXmlDocOpts {
    withBookmarks: boolean;
    storyBase: string | null;
    chapter: number | null;
}

interface DebugApi {
    pickXml?: () => Promise<void>;
    renderXmlText?: (xmlText: string) => Promise<void>;
    renderXmlFile?: (file: File) => Promise<void>;
    [k: string]: unknown;
}

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

function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readChaptersFromCache(): number[] {
    const raw: unknown = JSON.parse(localStorage.getItem(window.chapterCacheKey) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
}

window.params = new URLSearchParams(window.location.search);
window.storyPath = window.params.get("story");
window.storyName = window.storyPath ? (window.storyPath.split("/").pop() ?? null) : null;
window.chapter = parseInt(window.params.get("chapter") || "1");
const apiPath = "https://srv.kittycrypto.gg";

const params = window.params;

window.fallback = document.getElementById("js-content-fallback");
if (window.fallback) window.fallback.style.display = "none";

window.chapterCacheKey = `chapterCache_${window.storyName}`;
window.lastKnownChapter = parseInt(localStorage.getItem(window.chapterCacheKey) || "0");

window.readerRoot = document.getElementById("reader");
window.storyPickerRoot = document.getElementById("story-picker");

window.buttons = {
    toggleParagraphNumbers: { icon: "🔢", action: "Toggle paragraph numbers" },
    clearBookmark: { icon: "↩️", action: "Clear bookmark for this chapter" },
    prevChapter: { icon: "⏪", action: "Previous chapter" },
    jumpToChapter: { icon: "🆗", action: "Jump to chapter" },
    nextChapter: { icon: "⏩", action: "Next chapter" },
    scrollDown: { icon: "⏬", action: "Scroll down" },
    showInfo: { icon: "ℹ️", action: "Show navigation info" },
    decreaseFont: { icon: "➖", action: "Decrease font size" },
    resetFont: { icon: "🔁", action: "Reset font size" },
    increaseFont: { icon: "➕", action: "Increase font size" },
    scrollUp: { icon: "⏫", action: "Scroll up" }
};

// Reader-specific cookie helpers to avoid collision with main.js
/**
 * @param {string} name
 * @param {string} value
 * @param {number} days
 * @param {Document} root
 * @returns {void} This function sets a cookie with a specified name and value, prefixed with "reader_" to avoid collisions. It also accepts an expiration time in days and an optional Document root for scoping the cookie. The cookie is set to expire after the specified number of days and is available across the entire site (path=/). This is useful for storing reader-specific preferences without affecting other cookies that may be used by the main site or other scripts.
 */
function setReaderCookie(name: string, value: string, days = 365, root: Document = document): void {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    root.cookie = `reader_${name}=${value}; expires=${expires}; path=/`;
}

/**
 * @param {string} name
 * @param {Document} root
 * @returns {string | null}
 */
function getReaderCookie(name: string, root: Document = document): string | null {
    const cookies = root.cookie.split("; ");
    const cookie = cookies.find((row) => row.startsWith(`reader_${name}=`));
    return cookie ? cookie.split("=")[1] : null;
}

/**
 * @param {Document} root
 * @returns {void} This function renders paragraph numbers in the reader view by analyzing the structure of the content and determining which bookmarks should have numbers displayed. It calculates the maximum ordinal number from the bookmark IDs to determine the necessary width for the paragraph number column. The function then iterates through the relevant bookmarks, checks if they should have a number rendered based on their content, and either creates or updates a span element with the class "reader-paragraph-num" to display the formatted paragraph number. This enhances readability and navigation within the reader by providing clear numbering for paragraphs that meet certain criteria.
 */
function renderPNum(root: Document = document): void {
    void root;

    const reader = window.readerRoot;
    if (!reader) return;

    const shouldRenderNumber = (bookmarkEl: Element): boolean => {
        const contentEl = bookmarkEl.firstElementChild;
        if (!contentEl) return false;

        const clone = contentEl.cloneNode(true) as Element;

        clone.querySelectorAll(".reader-paragraph-num, .bookmark-emoji").forEach((n) => n.remove());

        if (clone.querySelector("email, sms, tooltip, signature, content, logo")) {
            return false;
        }

        if (clone.querySelector("img, svg, video, audio, iframe")) {
            return false;
        }

        const text = (clone.textContent || "").replace(/\s+/g, "").trim();
        return text.length > 0;
    };

    const allBookmarks = Array.from(reader.querySelectorAll(".reader-bookmark"));

    const numberedBookmarks = allBookmarks.filter(
        (el) => typeof el.id === "string" && /-ch\d+-\d+$/.test(el.id)
    );

    if (numberedBookmarks.length === 0) return;

    const maxOrdinal = Math.max(
        ...numberedBookmarks.map((el) => {
            const m = el.id.match(/-(\d+)$/);
            return m ? Number(m[1]) : 0;
        })
    );

    const digits = String(maxOrdinal).length;

    reader.style.setProperty("--reader-para-num-col-width", `${digits}ch`);
    reader.style.setProperty("--reader-para-num-gap", "0.9em");

    for (const el of numberedBookmarks) {
        const match = el.id.match(/-(\d+)$/);
        if (!match) continue;

        const ordinal = Number(match[1]);
        const label = String(ordinal).padStart(digits, "0");

        const shouldRender = shouldRenderNumber(el);

        let num = el.querySelector(":scope > .reader-paragraph-num") as HTMLSpanElement | null;

        if (!shouldRender) {
            if (num) num.remove();
            continue;
        }

        if (!num) {
            num = document.createElement("span");
            num.className = "reader-paragraph-num";
            num.setAttribute("aria-hidden", "true");
            el.insertAdjacentElement("afterbegin", num);
        }

        if (num.textContent !== label) {
            num.textContent = label;
        }
    }
}

/**
 * @param {boolean} enabled
 * @returns {void} This function enables or disables the display of paragraph numbers in the reader view. It toggles a specific CSS class on the reader element to show or hide paragraph numbers, updates a cookie to remember the user's preference, and synchronizes the state of any toggle buttons in the UI. If paragraph numbers are being disabled, it also removes any existing paragraph number elements from the DOM and clears related CSS properties. This allows users to customize their reading experience by choosing whether or not to display paragraph numbers.
 */
function enablePNum(enabled: boolean): void {
    const reader = window.readerRoot;
    if (!reader) return;

    /**
     * @param {boolean} isEnabled
     * @param {Document} root
     * @returns {void} This function synchronizes the state of paragraph number toggle buttons in the UI based on whether paragraph numbers are enabled or disabled. It selects all elements that match the specified toggle button selector and toggles a "menu-crossed" class on them to visually indicate their state. This ensures that the toggle buttons accurately reflect whether paragraph numbers are currently being displayed in the reader, providing clear feedback to the user about the current setting.
     */
    const syncPNumToggleButtons = (isEnabled: boolean, root: Document = document): void => {
        root.querySelectorAll<HTMLElement>(PNUM_TOGGLE_SELECTOR).forEach((btn) => {
            btn.classList.toggle("menu-crossed", isEnabled);
        });
    };

    /**
     * @param {void} _void
     * @returns {void} This function removes all existing paragraph number elements from the reader view and clears related CSS properties. It selects all elements with the class "reader-paragraph-num" and removes them from the DOM. Additionally, it removes any CSS properties that were set to control the width and gap of the paragraph number column. This is typically called when paragraph numbers are being disabled to clean up any remnants of the numbering system from the reader interface.
     */
    const removeInjectedPNums = (): void => {
        reader.querySelectorAll(".reader-paragraph-num").forEach((n) => n.remove());
        reader.style.removeProperty("--reader-para-num-col-width");
        reader.style.removeProperty("--reader-para-num-gap");
    };

    reader.classList.toggle(READER_PARA_NUMS_CLASS, enabled);
    setReaderCookie(READER_PARA_NUMS_COOKIE, enabled ? "true" : "false");

    syncPNumToggleButtons(enabled, document);

    if (!enabled) {
        removeInjectedPNums();
        return;
    }

    renderPNum(document);
}

/**
 * @param {Document} root
 * @returns {void} This function refreshes the paragraph numbers in the reader view by re-rendering them based on the current content. It checks if the reader element exists and if it currently has paragraph numbers enabled. If both conditions are met, it calls the function to render paragraph numbers again, which will update the numbering to reflect any changes in the content structure. This is useful for ensuring that paragraph numbers remain accurate and up-to-date as the reader content is modified or navigated.
 */
function refreshPNum(root: Document = document): void {
    const reader = window.readerRoot;
    if (!reader) return;
    if (!reader.classList.contains(READER_PARA_NUMS_CLASS)) return;

    renderPNum(root);
}

function togglePNum(): void {
    const reader = window.readerRoot;
    if (!reader) return;

    const next = !reader.classList.contains(READER_PARA_NUMS_CLASS);
    enablePNum(next);
}

function initPNumCookie(): void {
    const v = getReaderCookie(READER_PARA_NUMS_COOKIE);
    enablePNum(v === "true");
}

/**
 * @param {Document} doc
 * @param {readonly string[]} aliases
 * @returns {Element[]}
 */
function getElementsByAliases(doc: Document, aliases: readonly string[]): Element[] {
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
    const hasChapter0 = chapters.includes(0);
    chapter = Number(chapter);
    if (chapter <= 1 && !hasChapter0) return false;
    if (chapter <= 0) return false;
    return true;
}

/**
 * @param {Document} root
 * @returns {void} This function updates the state of the "Previous Chapter" button in the reader interface based on the current chapter and the list of available chapters. It retrieves the chapters from the cache and determines whether the previous chapter button should be enabled or disabled. Then, it selects all elements with the class "btn-prev" and sets their disabled property accordingly. This ensures that users cannot click the previous chapter button when there is no valid previous chapter to navigate to, improving the user experience and preventing errors.
 */
function updatePrevButtonState(root: Document = document): void {
    const chapters = readChaptersFromCache();
    const enablePrev = prevBtnEn(window.chapter, chapters);

    root.querySelectorAll<HTMLButtonElement>(".btn-prev").forEach((btn) => {
        btn.disabled = !enablePrev;
    });
}

/**
 * @param {Document} _root
 * @returns {void} This function clears the bookmark for the current chapter by removing the corresponding entry from localStorage. It constructs a key based on the story's base URL and the current chapter number, and then removes that item from localStorage. After clearing the bookmark, it shows a temporary notice to the user confirming that the bookmark has been cleared for the current chapter. This allows users to reset their progress for a chapter if they wish to start over or remove an outdated bookmark.
 */
function clearBookmarkForCurrentChapter(_root?: Document): void {
    void _root;

    const base = getStoryBaseUrl();
    if (!base) return;

    const storyKey = makeStoryKey(base);
    localStorage.removeItem(`bookmark_${storyKey}_ch${window.chapter}`);
    showTemporaryNotice("Bookmark cleared for this chapter.");
}

/**
 * @param {string} message
 * @param {number} timeout
 * @returns {void} This function displays a temporary notice on the screen with a specified message and automatically removes it after a given timeout. It creates a styled div element that is centered on the screen, sets its text content to the provided message, and appends it to the document body. After the specified timeout duration, the notice is removed from the DOM. This is useful for providing feedback to users about actions they have taken, such as clearing a bookmark or saving progress, without requiring them to dismiss a modal or alert manually.
 */
function showTemporaryNotice(message: string, timeout = 1000): void {
    const notice = document.createElement("div");
    notice.textContent = message;
    notice.style.position = "fixed";
    notice.style.top = "50%";
    notice.style.left = "50%";
    notice.style.transform = "translate(-50%, -50%)";
    notice.style.background = "var(--chatroom-bg-colour)";
    notice.style.color = "var(--chatroom-text-colour)";
    notice.style.padding = "10px 20px";
    notice.style.borderRadius = "8px";
    notice.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    notice.style.zIndex = "9999";
    document.body.appendChild(notice);

    setTimeout(() => {
        notice.remove();
    }, timeout);
}

function ctrlDetach(): void {
    const controls = document.querySelector(".reader-controls-top") as HTMLElement | null;
    if (!controls) return;

    const SENTINEL_ID = "kc-reader-controls-sentinel";

    removeExistingById(SENTINEL_ID);

    if (
        window.__kcReaderCtrlObserver &&
        typeof window.__kcReaderCtrlObserver.disconnect === "function"
    ) {
        window.__kcReaderCtrlObserver.disconnect();
        window.__kcReaderCtrlObserver = null;
    }

    const sentinel = document.createElement("div");
    sentinel.id = SENTINEL_ID;
    sentinel.style.position = "absolute";
    sentinel.style.top = "0";
    sentinel.style.left = "0";
    sentinel.style.width = "1px";
    sentinel.style.height = "1px";

    const parent = controls.parentNode;
    if (!parent) return;

    parent.insertBefore(sentinel, controls);

    const observer = new IntersectionObserver(
        ([entry]: IntersectionObserverEntry[]) => {
            const detached = !entry.isIntersecting;
            controls.classList.toggle("is-detached", detached);
            window.dispatchEvent(
                new CustomEvent("reader:controls-detached", {
                    detail: { detached }
                })
            );
        },
        { threshold: 0 }
    );

    observer.observe(sentinel);

    window.__kcReaderCtrlObserver = observer;
    window.readerTopAnchor = sentinel;
}

// Inject navigation bars at top and bottom
function injectNav(): void {
    const TOP_ID = "kc-reader-controls-top";
    const BOTTOM_ID = "kc-reader-controls-bottom";

    removeExistingById(TOP_ID);
    removeExistingById(BOTTOM_ID);

    const navHTML = `
        <div class="chapter-navigation">
        <button class="btn-toggle-paragraph-numbers">${window.buttons.toggleParagraphNumbers.icon}</button>
        <button class="btn-clear-bookmark">${window.buttons.clearBookmark.icon}</button>
        <button class="btn-prev">${window.buttons.prevChapter.icon}</button>
        <input class="chapter-display" type="text" value="1" readonly style="width: 2ch; text-align: center; border: none; background: transparent; font-weight: bold;" />
        <input class="chapter-input" type="number" min="0" style="width: 2ch; text-align: center;" />
        <button class="btn-jump">${window.buttons.jumpToChapter.icon}</button>
        <button class="chapter-end" disabled style="width: 2ch; text-align: center; font-weight: bold;"></button>
        <button class="btn-next">${window.buttons.nextChapter.icon}</button>
        <button class="btn-scroll-down">${window.buttons.scrollDown.icon}</button>
        <button class="btn-info">${window.buttons.showInfo.icon}</button>
        </div>
        <div class="font-controls">
        <button class="font-decrease">${window.buttons.decreaseFont.icon}</button>
        <button class="font-reset">${window.buttons.resetFont.icon}</button>
        <button class="font-increase">${window.buttons.increaseFont.icon}</button>
        </div>
    `;

    const navTop = document.createElement("div");
    navTop.id = TOP_ID;
    navTop.innerHTML = navHTML;

    const navBottom = navTop.cloneNode(true) as HTMLElement;
    navBottom.id = BOTTOM_ID;

    navTop.classList.add("reader-controls-top");
    navBottom.classList.add("reader-controls-bottom");

    const scrollDownBtn = navBottom.querySelector(".btn-scroll-down") as HTMLButtonElement | null;
    if (scrollDownBtn) {
        scrollDownBtn.textContent = window.buttons.scrollUp.icon;
        scrollDownBtn.classList.remove("btn-scroll-down");
        scrollDownBtn.classList.add("btn-scroll-up");
    }

    if (!window.readerRoot) return;

    window.readerRoot.insertAdjacentElement("beforebegin", navTop);
    window.readerRoot.insertAdjacentElement("afterend", navBottom);
}

// Font size logic
/**
 * @param {number} delta
 */
function updateFontSize(delta = 0): void {
    const current = parseFloat(getReaderCookie("fontSize") || "") || 1;
    const newSize = Math.max(0.7, Math.min(2.0, current + delta));
    setReaderCookie("fontSize", newSize.toFixed(2));
    window.readerRoot!.style.setProperty("font-size", `${newSize}em`);
    refreshTategakiFont();
}

function showNavigationInfo(): void {
    alert(`Navigation Button Guide:
    ${window.buttons.toggleParagraphNumbers.icon}  – ${window.buttons.toggleParagraphNumbers.action}
    ${window.buttons.clearBookmark.icon}  – ${window.buttons.clearBookmark.action}
    ${window.buttons.prevChapter.icon}  – ${window.buttons.prevChapter.action}
    ${window.buttons.jumpToChapter.icon}  – ${window.buttons.jumpToChapter.action}
    ${window.buttons.nextChapter.icon}  – ${window.buttons.nextChapter.action}
    ${window.buttons.scrollDown.icon}  – ${window.buttons.scrollDown.action}
    ${window.buttons.scrollUp.icon}  – ${window.buttons.scrollUp.action}

    Font Controls:
    ${window.buttons.decreaseFont.icon}  – ${window.buttons.decreaseFont.action}
    ${window.buttons.resetFont.icon}  – ${window.buttons.resetFont.action}
    ${window.buttons.increaseFont.icon}  – ${window.buttons.increaseFont.action}`);
}

/**
 * @param {Document} root
 */
function bindNavigationEvents(root: Document = document): void {
    const chapters = readChaptersFromCache();

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
            if (e.key === "Enter") {
                const target = e.target as HTMLInputElement;
                const val = parseInt(target.value, 10);
                if (val >= 0 && val <= window.lastKnownChapter) jumpTo(val);
            }
        });
    });

    root.querySelectorAll<HTMLButtonElement>(".btn-rescan").forEach((btn) => (btn.onclick = async () => {
        localStorage.removeItem(window.chapterCacheKey);
        const chapters = await discoverChapters();
        window.lastKnownChapter = chapters.length > 0 ? Math.max(...chapters) : 0;
        updateNav();
    }));

    root.querySelectorAll<HTMLButtonElement>(".btn-clear-bookmark").forEach((btn) => {
        btn.onclick = () => clearBookmarkForCurrentChapter(root);
    });

    root.querySelectorAll<HTMLButtonElement>(".font-increase").forEach((btn) => (btn.onclick = () => updateFontSize(0.1)));
    root.querySelectorAll<HTMLButtonElement>(".font-decrease").forEach((btn) => (btn.onclick = () => updateFontSize(-0.1)));
    root.querySelectorAll<HTMLButtonElement>(".font-reset").forEach((btn) => (btn.onclick = () => updateFontSize(0)));
    root.querySelectorAll<HTMLButtonElement>(".btn-info").forEach((btn) => (btn.onclick = showNavigationInfo));
}

/**
 * @param {Document} root
 */
async function populateStoryPicker(root: Document = document): Promise<void> {
    if (!window.storyPickerRoot) return;
    try {
        const res = await fetch(`${apiPath}/stories.json`);
        if (!res.ok) throw new Error("No stories found");
        const storiesUnknown: unknown = await res.json();

        if (!isRecord(storiesUnknown)) throw new Error("Invalid stories index format");
        const stories = storiesUnknown as StoriesIndex;

        const select = root.createElement("select");
        select.className = "story-selector";
        select.innerHTML = `<option value="">Select a story...</option>`;

        Object.keys(stories).forEach((name) => {
            const opt = root.createElement("option");
            opt.value = name;
            opt.textContent = name;
            if (name === window.storyName) opt.selected = true;
            select.appendChild(opt);
        });

        select.onchange = () => {
            if (select.value) {
                window.location.search = `?story=${encodeURIComponent(select.value)}&chapter=1`;
            }
        };

        window.storyPickerRoot.appendChild(select);
    } catch (err) {
        console.warn("No stories found or failed to load stories.json", err);
    }
}

/**
 * @param {string | null} storyName
 * @returns {string | null}
 */
function getStoryBaseUrl(storyName: string | null = null): string | null {
    const name = storyName || window.storyName || (window.storyPath ? window.storyPath.split("/").pop() : null);
    if (!name) return null;
    return `${apiPath}/stories/${encodeURIComponent(name)}`;
}

const mediaStyler = new MediaStyler();

/**
 * @param {number} n
 */
async function loadChapter(n: number): Promise<void> {
    window.chapter = n;
    try {
        const base = getStoryBaseUrl();
        if (!base) throw new Error("No story selected.");

        const res = await fetch(`${base}/chapt${n}.xml`);
        if (!res.ok) throw new Error("Chapter not found");
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        const paras = getElementsByAliases(xmlDoc, ["w:p", "paragraph"]);

        let htmlContent = paras
            .map((p) => {
                const isCleaned = p.tagName === "paragraph";
                const pPr = isCleaned ? null : p.getElementsByTagName("w:pPr")[0];
                let style = "";
                if (!isCleaned && pPr) {
                    const styleEl = pPr.getElementsByTagName("w:pStyle")[0];
                    if (styleEl) style = styleEl.getAttribute("w:val") || "";
                }
                let tag = "p";
                let className = "reader-paragraph";
                if (style === "Title") {
                    tag = "h1";
                    className = "reader-title";
                } else if (style === "Heading1" || style === "Heading2") {
                    tag = "h2";
                    className = "reader-subtitle";
                } else if (style === "Quote") {
                    tag = "blockquote";
                    className = "reader-quote";
                } else if (style === "IntenseQuote") {
                    tag = "blockquote";
                    className = "reader-quote reader-intense";
                }
                const runs = isCleaned
                    ? Array.from(p.childNodes)
                        .map((node) =>
                            node.nodeType === 1
                                ? new XMLSerializer().serializeToString(node)
                                : (node.textContent || "")
                        )
                        .join("")
                    : Array.from(p.getElementsByTagName("w:r"))
                        .map((run) => {
                            const text = Array.from(run.getElementsByTagName("w:t"))
                                .map((t) => t.textContent || "")
                                .join("");
                            const rPr = run.getElementsByTagName("w:rPr")[0];
                            const spanClass: string[] = [];
                            if (rPr) {
                                if (rPr.getElementsByTagName("w:b").length) spanClass.push("reader-bold");
                                if (rPr.getElementsByTagName("w:i").length) spanClass.push("reader-italic");
                                if (rPr.getElementsByTagName("w:u").length) spanClass.push("reader-underline");
                                if (rPr.getElementsByTagName("w:strike").length) spanClass.push("reader-strike");
                                if (rPr.getElementsByTagName("w:smallCaps").length) spanClass.push("reader-smallcaps");
                            }
                            return `<span class="${spanClass.join(" ")}">${text}</span>`;
                        })
                        .join("");

                return `<${tag} class="${className}">${runs}</${tag}>`;
            })
            .join("\n");

        htmlContent = await mediaStyler.replaceEmails(htmlContent);
        htmlContent = await mediaStyler.replaceSmsMessages(htmlContent);
        htmlContent = await replaceTategaki(htmlContent);
        htmlContent = replaceImageTags(htmlContent);
        htmlContent = await mediaStyler.replaceTooltips(htmlContent);
        htmlContent = await injectBookmarksIntoHTML(htmlContent, base, window.chapter);

        window.readerRoot!.innerHTML = htmlContent;
        await mediaStyler.replaceSVGs(window.readerRoot!);

        requestAnimationFrame(() => {
            refreshPNum(document);
        });

        observeAndSaveBookmarkProgress(document);

        requestAnimationFrame(() => {
            restoreBookmark(base, window.chapter);
        });

        activateImageNavigation(document);

        updateNav(document);
        bindNavigationEvents(document);
        setReaderCookie(`bookmark_${makeStoryKey(base)}`, String(window.chapter));
        window.scrollTo(0, 0);
    } catch (err) {
        window.readerRoot!.innerHTML = `
            <div class="chapter-404">
                <h2>📕 Chapter ${n} Not Found</h2>
                <p>Looks like this XML chapter doesn't exist yet.</p>
            </div>
        `;
        console.error(err);
    }
}

/**
 * @param {string} storyName
 * @returns {Promise<ChaptersIndexResult>}
 */
export async function getChapters(storyName: string): Promise<ChaptersIndexResult> {
    const indexRes = await fetch(`${apiPath}/stories.json`);
    if (!indexRes.ok) throw new Error("Failed to load stories index");

    const indexUnknown: unknown = await indexRes.json();
    if (!isRecord(indexUnknown)) throw new Error("Invalid stories index format");
    const index = indexUnknown as StoriesIndex;

    const files = index[storyName];
    if (!Array.isArray(files)) return { chapters: [], urls: [] };

    const base = getStoryBaseUrl(storyName);

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
async function discoverChapters(storyName: string | null = null): Promise<number[]> {
    const { chapters } = await getChapters(storyName || String(window.storyName));

    const last = chapters.length > 0 ? Math.max(...chapters) : 0;
    window.lastKnownChapter = last;

    localStorage.setItem(window.chapterCacheKey, JSON.stringify(chapters));
    return chapters;
}

/**
 * @param {number} n
 */
function jumpTo(n: number): void {
    let currentStoryPath = decodeURIComponent(window.storyPath as unknown as string) || localStorage.getItem("currentStoryPath");

    if (!currentStoryPath) {
        alert("No story selected. Please select a story first.");
        return;
    }

    localStorage.setItem("currentStoryPath", currentStoryPath);

    const encodedPath = encodeURIComponent(currentStoryPath);
    window.location.search = `?story=${encodedPath}&chapter=${n}`;
}

/**
 * @param {string} htmlContent
 * @returns {string}
 */
function replaceImageTags(htmlContent: string): string {
    const imageWithAltRegex = /::img:url:(.*?):alt:(.*?)::/g;

    htmlContent = htmlContent.replace(imageWithAltRegex, (_match, url: string, alt: string) => {
        return `
            <div class="chapter-image-container">
                <img 
                src="${url.trim()}" 
                alt="${alt.trim()}" 
                class="chapter-image" 
                loading="lazy" 
                onerror="this.onerror=null; this.src='/path/to/fallback-image.png'; this.alt='Image not found';"
                />
            </div>
        `;
    });

    const imageWithoutAltRegex = /::img:url:(.*?)::/g;
    return htmlContent.replace(imageWithoutAltRegex, (_match, url: string) => {
        return `
            <div class="chapter-image-container">
                <img 
                src="${url.trim()}" 
                alt="Chapter Image" 
                class="chapter-image" 
                loading="lazy" 
                onerror="this.onerror=null; this.src='/path/to/fallback-image.png'; this.alt='Image not found';"
                />
            </div>
        `;
    });
}

/**
 * @param {Document} root
 */
function refreshTategakiFont(root: Document = document): void {
    const px = parseFloat(getComputedStyle(window.readerRoot as unknown as Element).fontSize);
    root
        .querySelectorAll<SVGTextElement>(".tategaki-container svg text")
        .forEach((t) => t.setAttribute("font-size", String(px)));
}

/**
 * @param {Document} root
 */
function updateNav(root: Document = document): void {
    root.querySelectorAll<HTMLInputElement>(".chapter-display").forEach((el) => (el.value = String(window.chapter)));
    root.querySelectorAll<HTMLButtonElement>(".chapter-end").forEach((btn) => (btn.textContent = String(window.lastKnownChapter)));

    root.querySelectorAll<HTMLButtonElement>(".btn-next").forEach((btn) => {
        btn.disabled = window.chapter === window.lastKnownChapter;
    });

    updatePrevButtonState(root);
}

async function initReader(): Promise<void> {
    await populateStoryPicker(document);
    if (!window.storyPath) return;

    injectNav();
    ctrlDetach();
    initPNumCookie();

    const chapters = await discoverChapters();
    window.lastKnownChapter = chapters.length > 0 ? Math.max(...chapters) : 0;

    if (!params.get("chapter")) {
        const bookmark = parseInt(getReaderCookie(`bookmark_${encodeURIComponent(window.storyPath as unknown as string)}`) as unknown as string);
        if (bookmark && chapters.includes(bookmark)) {
            window.chapter = bookmark;
        } else {
            window.chapter = 1;
        }
    }

    await loadChapter(window.chapter);

    const initialFont = parseFloat(getReaderCookie("fontSize") || "") || 1;
    window.readerRoot!.style.setProperty("font-size", `${initialFont}em`);
}

/**
 * @param {Document} root
 */
export function activateImageNavigation(root: Document = document): void {
    root.querySelectorAll(".image-nav").forEach((nav) => nav.remove());

    root.querySelectorAll(".chapter-image-container").forEach((containerEl) => {
        const container = containerEl as HTMLElement;
        const image = container.querySelector(".chapter-image") as HTMLImageElement;

        const navOverlay = document.createElement("div");
        navOverlay.classList.add("image-nav");
        navOverlay.innerHTML = `
            <button class="btn-up">⬆️</button>
            <div class="horizontal">
                <button class="btn-left">⬅️</button>
                <button class="btn-center">⏺️</button>
                <button class="btn-right">➡️</button>
            </div>
            <button class="btn-down">⬇️</button>
        `;

        container.appendChild(navOverlay);

        let posX = 50;
        let posY = 50;
        const step = 5;

        const updatePosition = (): void => {
            image.style.transformOrigin = `${posX}% ${posY}%`;
        };

        const startHold = (onHold: () => void): void => {
            const interval = window.setInterval(onHold, 100);
            const stopHold = (): void => {
                clearInterval(interval);
                root.removeEventListener("mouseup", stopHold);
                root.removeEventListener("touchend", stopHold);
                root.removeEventListener("mouseleave", stopHold);
            };
            root.addEventListener("mouseup", stopHold);
            root.addEventListener("touchend", stopHold);
            root.addEventListener("mouseleave", stopHold);
            onHold();
        };

        (navOverlay.querySelector(".btn-up") as HTMLButtonElement).addEventListener("mousedown", () => {
            startHold(() => {
                posY = Math.max(0, posY - step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-down") as HTMLButtonElement).addEventListener("mousedown", () => {
            startHold(() => {
                posY = Math.min(100, posY + step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-left") as HTMLButtonElement).addEventListener("mousedown", () => {
            startHold(() => {
                posX = Math.max(0, posX - step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-right") as HTMLButtonElement).addEventListener("mousedown", () => {
            startHold(() => {
                posX = Math.min(100, posX + step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-up") as HTMLButtonElement).addEventListener("touchstart", () => {
            startHold(() => {
                posY = Math.max(0, posY - step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-down") as HTMLButtonElement).addEventListener("touchstart", () => {
            startHold(() => {
                posY = Math.min(100, posY + step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-left") as HTMLButtonElement).addEventListener("touchstart", () => {
            startHold(() => {
                posX = Math.max(0, posX - step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-right") as HTMLButtonElement).addEventListener("touchstart", () => {
            startHold(() => {
                posX = Math.min(100, posX + step);
                updatePosition();
            });
        });

        (navOverlay.querySelector(".btn-center") as HTMLButtonElement).addEventListener("click", () => {
            posX = 50;
            posY = 50;
            updatePosition();
        });

        const toggleZoom = (): void => {
            if (image.classList.contains("active")) {
                image.classList.remove("active");
                navOverlay.classList.remove("active");
            } else {
                image.classList.add("active");
                navOverlay.classList.add("active");
            }
        };

        image.addEventListener("click", toggleZoom);

        container.addEventListener("mouseleave", () => {
            navOverlay.classList.remove("active");
        });

        enableImageSwipeNavigation(
            image,
            () => posX,
            () => posY,
            (x, y) => {
                posX = x;
                posY = y;
                updatePosition();
            }
        );
    });

    function enableImageSwipeNavigation(
        image: HTMLImageElement,
        getX: () => number,
        getY: () => number,
        setPosition: (x: number, y: number) => void
    ): void {
        let startX = 0;
        let startY = 0;
        let lastX = 0;
        let lastY = 0;
        let isSwiping = false;

        image.addEventListener(
            "touchstart",
            (e: TouchEvent) => {
                if (!image.classList.contains("active")) return;
                if (e.touches.length === 1) {
                    isSwiping = true;
                    startX = lastX = e.touches[0].clientX;
                    startY = lastY = e.touches[0].clientY;
                }
            },
            { passive: true }
        );

        image.addEventListener(
            "touchmove",
            (e: TouchEvent) => {
                if (!isSwiping || e.touches.length !== 1) return;

                const currentX = e.touches[0].clientX;
                const currentY = e.touches[0].clientY;

                const deltaX = currentX - lastX;
                const deltaY = currentY - lastY;
                lastX = currentX;
                lastY = currentY;

                const pxToPercent = 300;
                let newX = getX() - (deltaX / pxToPercent) * 100;
                let newY = getY() - (deltaY / pxToPercent) * 100;

                newX = Math.min(100, Math.max(0, newX));
                newY = Math.min(100, Math.max(0, newY));
                setPosition(newX, newY);
            },
            { passive: true }
        );

        image.addEventListener("touchend", () => {
            isSwiping = false;
        });
    }
}

/**
 * @param {string} storyBase
 * @returns {string}
 */
function makeStoryKey(storyBase: string): string {
    return encodeURIComponent(storyBase).replace(/\W/g, "_");
}

/**
 * @param {string} htmlContent
 * @param {string} storyBase
 * @param {number} chapter
 * @returns {Promise<string>}
 */
export async function injectBookmarksIntoHTML(
    htmlContent: string,
    storyBase: string,
    chapter: number
): Promise<string> {
    const storyKey = makeStoryKey(storyBase);
    const bookmarkId = localStorage.getItem(`bookmark_${storyKey}_ch${chapter}`);
    let counter = 0;

    const isMeaningfulInnerHtml = (innerHtml: string): boolean => {
        if (/<(img|svg|video|audio|iframe)\b/i.test(innerHtml)) return true;

        const text = innerHtml
            .replace(/<[^>]*>/g, "")
            .replace(/&nbsp;|&#160;/gi, "")
            .replace(/\s+/g, "")
            .trim();

        return text.length > 0;
    };

    return htmlContent.replace(
        /<(p|h1|h2|blockquote)(.*?)>([\s\S]*?)<\/\1>/g,
        (match: string, tag: string, attrs: string, inner: string) => {
            if (!isMeaningfulInnerHtml(inner)) return match;

            const id = `bm-${storyKey}-ch${chapter}-${counter}`;
            counter += 1;

            const emojiSpan =
                id === bookmarkId ? `<span class="bookmark-emoji" aria-label="bookmark">🔖</span> ` : "";

            return `<div class="reader-bookmark" id="${id}"><${tag}${attrs}>${emojiSpan}${inner}</${tag}></div>`;
        }
    );
}

/**
 * @param {Document} root
 */
function observeAndSaveBookmarkProgress(root: Document = document): void {
    const bookmarks = Array.from(root.querySelectorAll<HTMLElement>(".reader-bookmark"));
    const observer = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) return;

                const target = entry.target as HTMLElement;
                const id = target.id;
                const match = id.match(/^bm-([^]+)-ch(\d+)-\d+$/);
                if (!match) return;

                const storyKey = match[1];
                const chapter = match[2];
                const key = `bookmark_${storyKey}_ch${chapter}`;
                const newIndex = bookmarks.findIndex((el) => el.id === id);

                if (newIndex === bookmarks.length - 1) {
                    localStorage.removeItem(key);
                    return;
                }

                const savedId = localStorage.getItem(key);
                const savedIndex = bookmarks.findIndex((el) => el.id === savedId);
                if (newIndex <= savedIndex) return;

                localStorage.setItem(key, id);
            }
        },
        {
            threshold: 0.6
        }
    );

    setTimeout(() => {
        bookmarks.forEach((el) => observer.observe(el));
    }, 1000);
}

/**
 * @param {string} storyBase
 * @param {number} chapter
 */
function restoreBookmark(storyBase: string, chapter: number): void {
    const storyKey = makeStoryKey(storyBase);
    const key = `bookmark_${storyKey}_ch${chapter}`;
    const id = localStorage.getItem(key);
    if (!id) return;

    const bookmarkDiv = document.getElementById(id);
    if (!bookmarkDiv) return;

    const nextBookmark = bookmarkDiv.nextElementSibling as Element | null;
    if (nextBookmark) {
        const scrollY = nextBookmark.getBoundingClientRect().top;
        window.scrollTo({ top: scrollY, behavior: "smooth" });
    }

    bookmarkDiv.classList.add("reader-highlight");

    setTimeout(() => {
        bookmarkDiv.classList.add("fade-out");
        bookmarkDiv.addEventListener(
            "transitionend",
            () => {
                bookmarkDiv.classList.remove("reader-highlight", "fade-out");
            },
            { once: true }
        );
    }, 5000);
}

function restoreLastStoryRead(): void {
    const story = window.params.get("story");
    const chapter = window.chapter;
    const lastKey = "lastStoryRead";

    if (story && chapter !== null) {
        localStorage.setItem(lastKey, JSON.stringify({ story, chapter }));
        return;
    }

    const last = localStorage.getItem(lastKey);
    if (!last) return;

    try {
        const parsed: unknown = JSON.parse(last);
        if (!isRecord(parsed)) return;

        const storyVal = parsed["story"];
        const chapterVal = parsed["chapter"];

        if (typeof storyVal !== "string") return;
        if (chapterVal === null) return;

        const encoded = `?story=${encodeURIComponent(storyVal)}&chapter=${String(chapterVal)}`;
        window.location.search = encoded;
    } catch (e) {
        console.warn("Failed to parse lastStoryRead:", e);
    }
}

function initiateReader(): void {
    document.addEventListener("DOMContentLoaded", () => {
        restoreLastStoryRead();
        void initReader();
        activateImageNavigation(document);
        mediaStyler.bindEmailActions();
    });

    document.addEventListener("click", (e: MouseEvent) => {
        const target = e.target as Element | null;
        if (!target) return;

        const bookmarks = Array.from(document.querySelectorAll(".reader-bookmark"));
        if (!bookmarks.length) return;

        if (target.classList.contains("btn-scroll-down")) {
            const upBtn = document.querySelector(".btn-scroll-up") as Element | null;
            if (!upBtn) return;
            upBtn.scrollIntoView({ behavior: "smooth" });
            return;
        }

        if (target.classList.contains("btn-scroll-up")) {
            const anchor =
                window.readerTopAnchor || document.body.firstElementChild || document.body;

            (anchor as Element).scrollIntoView({
                behavior: "smooth",
                block: "start"
            });
            return;
        }
    });
}

/**
 * @param {Document} root
 * @returns {Promise<void>}
 */
export async function setupReader(root: Document = document): Promise<void> {
    bindNavigationEvents(root);
    activateImageNavigation(root);
    refreshTategakiFont(root);
    observeAndSaveBookmarkProgress(root);
}

/**
 * @returns {Promise<boolean>}
 */
export async function readerIsFullyLoaded(): Promise<boolean> {
    const requestAnimationFramePromise = async (
        callback: (...args: unknown[]) => void
    ): Promise<unknown> => {
        const done = await new Promise<unknown>((resolve) => {
            requestAnimationFrame(() => {
                callback(resolve);
            });
        });
        return done;
    };

    return new Promise<boolean>((resolve) => {
        const checkReady = async (..._args: unknown[]): Promise<void> => {
            void _args;
            if (
                document.readyState === "complete" &&
                document.querySelectorAll(".reader-bookmark").length > 0
            ) {
                resolve(true);
            }
            await requestAnimationFramePromise(checkReady);
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
 */
export function forceBookmark(bookmarkId: string): void {
    const base = getStoryBaseUrl();
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
 */
async function renderXmlDoc(xmlDoc: Document, opts: RenderXmlDocOpts): Promise<void> {
    const paras = getElementsByAliases(xmlDoc, ["w:p", "paragraph"]);

    let htmlContent: unknown = paras
        .map((p) => {
            const isCleaned = p.tagName === "paragraph";
            const pPr = isCleaned ? null : p.getElementsByTagName("w:pPr")[0];
            let style = "";

            if (!isCleaned && pPr) {
                const styleEl = pPr.getElementsByTagName("w:pStyle")[0];
                if (styleEl) style = styleEl.getAttribute("w:val") || "";
            }

            let tag = "p";
            let className = "reader-paragraph";

            if (style === "Title") {
                tag = "h1";
                className = "reader-title";
            } else if (style === "Heading1" || style === "Heading2") {
                tag = "h2";
                className = "reader-subtitle";
            } else if (style === "Quote") {
                tag = "blockquote";
                className = "reader-quote";
            } else if (style === "IntenseQuote") {
                tag = "blockquote";
                className = "reader-quote reader-intense";
            }

            const runs = isCleaned
                ? Array.from(p.childNodes)
                    .map((n) =>
                        n.nodeType === 1 ? new XMLSerializer().serializeToString(n) : (n.textContent || "")
                    )
                    .join("")
                : Array.from(p.getElementsByTagName("w:r"))
                    .map((run) => {
                        const text = Array.from(run.getElementsByTagName("w:t"))
                            .map((t) => t.textContent || "")
                            .join("");

                        const rPr = run.getElementsByTagName("w:rPr")[0];
                        const spanClass: string[] = [];

                        if (rPr) {
                            if (rPr.getElementsByTagName("w:b").length) spanClass.push("reader-bold");
                            if (rPr.getElementsByTagName("w:i").length) spanClass.push("reader-italic");
                            if (rPr.getElementsByTagName("w:u").length) spanClass.push("reader-underline");
                            if (rPr.getElementsByTagName("w:strike").length) spanClass.push("reader-strike");
                            if (rPr.getElementsByTagName("w:smallCaps").length) spanClass.push("reader-smallcaps");
                        }

                        return `<span class="${spanClass.join(" ")}">${text}</span>`;
                    })
                    .join("");

            return `<${tag} class="${className}">${runs}</${tag}>`;
        })
        .join("\n");

    // Preserve original behaviour (these are async in mediaStyler)
    htmlContent = mediaStyler.replaceEmails(htmlContent as string) as unknown;
    htmlContent = mediaStyler.replaceSmsMessages(htmlContent as string) as unknown;
    htmlContent = replaceTategaki(htmlContent as string) as unknown;
    htmlContent = replaceImageTags(htmlContent as string);

    if (opts.withBookmarks && opts.storyBase && Number.isInteger(opts.chapter)) {
        htmlContent = injectBookmarksIntoHTML(htmlContent as string, opts.storyBase, opts.chapter as number) as unknown;
    }

    window.readerRoot!.innerHTML = htmlContent as string;
    await mediaStyler.replaceSVGs(window.readerRoot!);

    requestAnimationFrame(() => {
        refreshPNum(document);
    });

    observeAndSaveBookmarkProgress(document);
    activateImageNavigation(document);
    bindNavigationEvents(document);
    refreshTategakiFont(document);

    if (opts.withBookmarks && opts.storyBase && Number.isInteger(opts.chapter)) {
        requestAnimationFrame(() => {
            restoreBookmark(opts.storyBase as string, opts.chapter as number);
        });
    }
}

/**
 * @param {string} xmlText
 * @returns {Document}
 */
function parseXmlText(xmlText: string): Document {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "application/xml");

    const parseError = xmlDoc.getElementsByTagName("parsererror")[0];
    if (parseError) {
        const msg = parseError.textContent || "Invalid XML";
        throw new Error(msg);
    }

    return xmlDoc;
}

/**
 * @param {string} accept
 * @returns {Promise<File | null>}
 */
function pickSingleFile(accept: string): Promise<File | null> {
    return new Promise<File | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.style.display = "none";

        input.addEventListener(
            "change",
            () => {
                const file = input.files && input.files[0] ? input.files[0] : null;
                input.remove();
                resolve(file);
            },
            { once: true }
        );

        document.body.appendChild(input);
        input.click();
    });
}

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsText(file);
    });
}

window.debug = window.debug || {};

window.debug.pickXml = async function (): Promise<void> {
    const file = await pickSingleFile(".xml,application/xml,text/xml");
    if (!file) return;

    const xmlText = await readFileAsText(file);
    const xmlDoc = parseXmlText(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

window.debug.renderXmlText = async function (xmlText: string): Promise<void> {
    const xmlDoc = parseXmlText(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

window.debug.renderXmlFile = async function (file: File): Promise<void> {
    const xmlText = await readFileAsText(file);
    const xmlDoc = parseXmlText(xmlText);

    await renderXmlDoc(xmlDoc, {
        withBookmarks: false,
        storyBase: null,
        chapter: null
    });
};

if (/\/reader(?:\.html)?(?:\/|$)/.test(window.location.pathname)) initiateReader();