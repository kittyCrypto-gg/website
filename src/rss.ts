import { Clusteriser } from "./clusterise.ts";
import * as config from "./config.ts";

declare const marked: {
    /**
     * @param {string} markdown
     * @returns {string}
     */
    parse: (markdown: string) => string;
};

type BlogWrapperResult = Readonly<{
    scrollBox: HTMLDivElement | null;
    blogContainer: HTMLDivElement;
}>;

type RssPost = Readonly<{
    title: string;
    description: string;
    content: string;
    pubDate: string;
    author: string;
    guid: string;
}>;

let blogClusteriser: Clusteriser | null = null;

/**
 * Ensure .blog-container is inside .rss-scroll-2, creating/wrapping as needed.
 * @returns {BlogWrapperResult | null}
 */
function ensureBlogScrollWrapper(): BlogWrapperResult | null {
    if (window.location.pathname.includes("blog.html")) {
        const blogContainer = document.querySelector(".blog-container");
        if (!(blogContainer instanceof HTMLDivElement)) return null;
        return { scrollBox: null, blogContainer };
    }

    const wrapper = document.querySelector(".blog-wrapper");
    if (!(wrapper instanceof HTMLElement)) return null;

    let scrollBox: Element | null = wrapper.querySelector(".rss-scroll-2");
    let blogContainer: Element | null = wrapper.querySelector(".blog-container");

    if (!(blogContainer instanceof HTMLDivElement)) {
        const created = document.createElement("div");
        created.className = "blog-container";
        blogContainer = created;
    }

    if (!(scrollBox instanceof HTMLDivElement)) {
        const created = document.createElement("div");
        created.className = "rss-scroll-2";
        created.appendChild(blogContainer);
        scrollBox = created;

        Array.from(wrapper.children).forEach((child) => {
            if (child === scrollBox) return;
            if (!(child instanceof Element)) return;
            if (!child.classList.contains("blog-container")) return;
            wrapper.removeChild(child);
        });

        const hdr = wrapper.querySelector(".comments-header");
        const afterHdr = hdr?.nextSibling ?? null;

        if (afterHdr) wrapper.insertBefore(scrollBox, afterHdr);
        else wrapper.appendChild(scrollBox);
    }

    if (!scrollBox.contains(blogContainer)) scrollBox.appendChild(blogContainer);

    if (!(scrollBox instanceof HTMLDivElement) || !(blogContainer instanceof HTMLDivElement)) return null;

    return { scrollBox, blogContainer };
}

/**
 * @returns {void}
 */
function adjustBlogScrollHeight(): void {
    const result = ensureBlogScrollWrapper();
    const scrollBox = result?.scrollBox ?? null;
    if (!scrollBox) return;

    const posts = Array.from(scrollBox.querySelectorAll<HTMLElement>(".rss-post-block"));
    if (posts.length === 0) return;

    const scrollTop = scrollBox.scrollTop;
    let firstIndex = 0;

    for (let i = 0; i < posts.length; i += 1) {
        if ((posts[i]?.offsetTop ?? 0) <= scrollTop) {
            firstIndex = i;
            continue;
        }
        break;
    }

    const secondIndex = firstIndex + 1 < posts.length ? firstIndex + 1 : firstIndex;

    const firstHeight = posts[firstIndex]?.offsetHeight ?? 0;
    const secondHeight = posts[secondIndex]?.offsetHeight ?? 0;

    scrollBox.style.maxHeight =
        firstIndex === secondIndex ? `${firstHeight}px` : `${firstHeight + secondHeight}px`;
}

/**
 * @returns {void}
 */
function setupDynamicScrollBox(): void {
    const result = ensureBlogScrollWrapper();
    const scrollBox = result?.scrollBox ?? null;
    if (!scrollBox) return;

    scrollBox.addEventListener("transitionend", () => adjustBlogScrollHeight(), true);
    scrollBox.addEventListener("scroll", () => adjustBlogScrollHeight(), { passive: true });
    window.addEventListener("resize", () => adjustBlogScrollHeight());
}

/**
 * @returns {void}
 */
function triggerAdjustOnToggles(): void {
    const blog = document.querySelector(".blog-container");
    if (!(blog instanceof HTMLElement)) return;

    blog.addEventListener("click", (ev) => {
        const t = ev.target;
        if (!(t instanceof Element)) return;
        if (!t.closest(".rss-post-toggle")) return;

        window.setTimeout(() => adjustBlogScrollHeight(), 350);
    });
}

/**
 * Utility: Parse the XML and extract items
 * @param {string} xml
 * @returns {RssPost[]}
 */
function parseRSS(xml: string): RssPost[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");

    return Array.from(doc.querySelectorAll("item")).map((item) => {
        const contentTags = item.getElementsByTagName("content:encoded");
        const contentEncoded = (contentTags.length ? (contentTags[0]?.textContent ?? "") : "").trim();

        return {
            title: (item.querySelector("title")?.textContent ?? "").trim(),
            description: (item.querySelector("description")?.textContent ?? "").trim(),
            content: contentEncoded,
            pubDate: (item.querySelector("pubDate")?.textContent ?? "").trim(),
            author: ((item.querySelector("author")?.textContent ?? "Kitty").trim() || "Kitty"),
            guid: (item.querySelector("guid")?.textContent ?? "").trim()
        };
    });
}

/**
 * Utility: Format date to yyyy.mm.dd
 * @param {string} dateStr
 * @returns {string}
 */
function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}.${m}.${day}`;
}

/**
 * Render a single post as HTML string
 * @param {RssPost} post
 * @returns {string}
 */
function renderPost(post: RssPost): string {
    const contentHtml = marked.parse(post.content);

    return `
        <div class="rss-post-block">
        <div class="rss-post-toggle" tabindex="0" role="button" aria-expanded="false">
            <div class="rss-post-header">
            <span class="summary-arrow">▶️</span>
            <span class="rss-post-title">${post.title}</span>
            <span class="rss-post-date">${formatDate(post.pubDate)}</span>
            </div>
            <div class="rss-post-meta"><span class="rss-post-author">By: ${post.author}</span></div>
            <div class="rss-post-summary summary-collapsed">
            <span class="summary-text">${post.description}</span>
            </div>
        </div>
        <div class="rss-post-content content-collapsed" style="overflow: hidden; max-height: 0;">${contentHtml}</div>
        </div>
    `;
}

/**
 * Attach toggle logic to a post element
 * @param {HTMLElement} postDiv
 * @returns {void}
 */
function attachToggleLogic(postDiv: HTMLElement): void {
    const toggleDiv = postDiv.querySelector(".rss-post-toggle");
    if (!(toggleDiv instanceof HTMLElement)) return;

    const headerDiv = toggleDiv.querySelector(".rss-post-header");
    if (!(headerDiv instanceof HTMLElement)) return;

    const arrowSpan = headerDiv.querySelector(".summary-arrow");
    if (!(arrowSpan instanceof HTMLElement)) return;

    const contentEl = postDiv.querySelector(".rss-post-content");
    if (!(contentEl instanceof HTMLElement)) return;

    const contentDiv: HTMLElement = contentEl;
    const toggleRef: HTMLElement = toggleDiv;
    const arrowRef: HTMLElement = arrowSpan;

    /**
     * @returns {void}
     */
    function togglePost(): void {
        const expanded = contentDiv.classList.toggle("content-expanded");
        contentDiv.classList.toggle("content-collapsed", !expanded);
        toggleRef.setAttribute("aria-expanded", expanded ? "true" : "false");

        if (expanded) {
            arrowRef.textContent = "🔽";
            contentDiv.style.maxHeight = `${contentDiv.scrollHeight}px`;
        } else {
            arrowRef.textContent = "▶️";
            contentDiv.style.maxHeight = "0px";
        }

        toggleRef.blur();
    }

    toggleRef.addEventListener("click", () => togglePost());
    toggleRef.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        togglePost();
    });

    contentDiv.addEventListener("click", () => {
        if (!contentDiv.classList.contains("content-expanded")) return;
        togglePost();
    });
}

/**
 * @param {HTMLElement} container
 * @returns {void}
 */
function attachAllToggles(container: HTMLElement): void {
    container.querySelectorAll<HTMLElement>(".rss-post-block").forEach((postDiv) => {
        attachToggleLogic(postDiv);
    });
}

/**
 * Fetch and render the feed
 * @returns {Promise<void>}
 */
async function loadBlogFeed(): Promise<void> {
    const result = ensureBlogScrollWrapper();
    if (!result) return;

    const { blogContainer: container } = result;
    container.innerHTML = "";

    const response = await fetch(`${config.RSS_BACKEND_URL}`);
    if (!response.ok) {
        throw new Error(`RSS fetch error: ${response.status} ${response.statusText}`);
    }

    const xmlText = await response.text();
    const posts = parseRSS(xmlText);
    const rows = posts.map((post) => renderPost(post));

    if (!blogClusteriser) {
        blogClusteriser = new Clusteriser(container);
        await blogClusteriser.init();
    }

    blogClusteriser.update(rows);

    window.requestAnimationFrame(() => {
        attachAllToggles(container);
        triggerAdjustOnToggles();
        setupDynamicScrollBox();
        window.setTimeout(() => adjustBlogScrollHeight(), 100);
    });
}

window.addEventListener("DOMContentLoaded", () => {
    void loadBlogFeed();
});