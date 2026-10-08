import { getReaderNds, replaceTategaki } from "../tategaki.tsx";
import { replaceSsmlAuthoring } from "../ssml.ts";
import MediaStyler from "../mediaStyler.tsx";
import { render2Mkup } from "../reactHelpers.tsx";
import { MissingCh } from "./views.tsx";
import { buildReaderHtml } from "./chapterHtml.tsx";
import { injectBookmarksIntoHTML, makeStoryKey, restoreBookmark, watchBookmarks } from "./bookmarks.tsx";
import { refreshPNum, setRCookie } from "./paragraphNumbers.ts";
import { syncControlDock, syncTopScrollMode } from "./controlDock.ts";
import { activateImageNavigation } from "./imageNavigation.tsx";
import { initLanguageTipObserver } from "./helpModals.tsx";
import { getStoryBase } from "./storyData.ts";
import { bindNavEvents, refreshTatFont, updateNav } from "./navigation.tsx";
import type { RenderXmlDocOpts } from "./types.ts";

export const media = new MediaStyler();

/**
 * @param {number} n
 * @returns {Promise<void>}
 */
export async function loadCh(n: number): Promise<void> {
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
 * @param {Document} xmlDoc
 * @param {RenderXmlDocOpts} opts
 * @returns {Promise<void>}
 */
export async function renderXmlDoc(xmlDoc: Document, opts: RenderXmlDocOpts): Promise<void> {
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
