import * as helpers from "../helpers.ts";
import { render2Mkup } from "../reactHelpers.tsx";
import { wrapBookmark } from "./chapterHtml.tsx";

export function makeStoryKey(storyBase: string): string {
    return encodeURIComponent(storyBase).replace(/\W/g, "_");
}

function isMeaningfulBookmarkContent(innerHtml: string): boolean {
    if (/<(img|svg|video|audio|iframe)\b/i.test(innerHtml)) return true;

    const text = innerHtml
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;|&#160;/gi, "")
        .replace(/\s+/g, "")
        .trim();

    return text.length > 0;
}

export async function injectBookmarksIntoHTML(
    htmlContent: string,
    storyBase: string,
    chapter: number
): Promise<string> {
    const storyKey = makeStoryKey(storyBase);
    const bookmarkId = localStorage.getItem(
        `bookmark_${storyKey}_ch${chapter}`
    );
    let counter = 0;

    return htmlContent.replace(
        /<(p|h1|h2|blockquote)(.*?)>([\s\S]*?)<\/\1>/g,
        (match: string, tag: string, attrs: string, inner: string) => {
            if (!isMeaningfulBookmarkContent(inner)) return match;

            const id = `bm-${storyKey}-ch${chapter}-${counter}`;
            counter += 1;

            const emoji = id === bookmarkId
                ? `${render2Mkup(
                    <span className="bookmark-emoji" aria-label="bookmark">🔖</span>
                )} `
                : "";

            return wrapBookmark(
                id,
                `<${tag}${attrs}>${emoji}${inner}</${tag}>`
            );
        }
    );
}

export function watchBookmarks(root: Document = document): void {
    const bookmarks = Array.from(
        root.querySelectorAll<HTMLElement>(".reader-bookmark")
    );

    const observer = new IntersectionObserver(
        (entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) return;

                const target = entry.target as HTMLElement;
                const id = target.id;
                const match = id.match(/^bm-([^]+)-ch(\d+)-\d+$/);
                if (!match) return;

                const storyKey = match[1];
                const chapter = match[2];
                const key = `bookmark_${storyKey}_ch${chapter}`;
                const nextIndex = bookmarks.findIndex(
                    (element) => element.id === id
                );

                if (nextIndex === bookmarks.length - 1) {
                    localStorage.removeItem(key);
                    return;
                }

                const savedId = localStorage.getItem(key);
                const savedIndex = bookmarks.findIndex(
                    (element) => element.id === savedId
                );

                if (nextIndex <= savedIndex) return;
                localStorage.setItem(key, id);
            }
        },
        { threshold: 0.6 }
    );

    setTimeout(() => {
        for (const bookmark of bookmarks) observer.observe(bookmark);
    }, 1000);
}

export function restoreBookmark(
    storyBase: string,
    chapter: number
): void {
    const storyKey = makeStoryKey(storyBase);
    const id = localStorage.getItem(
        `bookmark_${storyKey}_ch${chapter}`
    );

    if (!id) return;

    const bookmark = document.getElementById(id);
    if (!bookmark) return;

    const next = bookmark.nextElementSibling;
    if (next) {
        window.scrollTo({
            top: window.scrollY + next.getBoundingClientRect().top,
            behavior: "smooth"
        });
    }

    bookmark.classList.add("reader-highlight");

    setTimeout(() => {
        bookmark.classList.add("fade-out");
        bookmark.addEventListener(
            "transitionend",
            () => bookmark.classList.remove("reader-highlight", "fade-out"),
            { once: true }
        );
    }, 5000);
}

export function restoreLastRead(): void {
    const story = window.params.get("story");
    const chapter = window.chapter;
    const key = "lastStoryRead";

    if (story && chapter !== null) {
        localStorage.setItem(key, JSON.stringify({ story, chapter }));
        return;
    }

    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!helpers.isRecord(parsed)) return;

        const storyValue = parsed["story"];
        const chapterValue = parsed["chapter"];

        if (typeof storyValue !== "string") return;
        if (chapterValue === null) return;

        window.location.search =
            `?story=${encodeURIComponent(storyValue)}` +
            `&chapter=${String(chapterValue)}`;
    } catch (error) {
        console.warn("Failed to parse lastStoryRead:", error);
    }
}
