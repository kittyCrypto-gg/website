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
 * @returns {boolean}
 */
function isBlogPath(): boolean {
    return window.location.pathname.toLowerCase().includes("blog");
}

/**
 * On the blog page, ensure the surrounding containers do not clamp height/overflow.
 * @returns {void}
 */
function applyBlogPageLayoutHints(): void {
    if (!isBlogPath()) return;

    const frame = document.querySelector(".frame");
    if (frame instanceof HTMLElement) {
        frame.style.height = "auto";
        frame.style.maxHeight = "none";
        frame.style.overflow = "visible";
    }

    const frameContent = document.querySelector(".frame-content");
    if (frameContent instanceof HTMLElement) {
        frameContent.style.height = "auto";
        frameContent.style.maxHeight = "none";
        frameContent.style.overflow = "visible";
    }

    const mainContent = document.querySelector("#main-content");
    if (mainContent instanceof HTMLElement) {
        mainContent.style.height = "auto";
        mainContent.style.maxHeight = "none";
        mainContent.style.overflow = "visible";
    }

    const blogWrapper = document.querySelector(".blog-wrapper");
    if (blogWrapper instanceof HTMLElement) {
        blogWrapper.style.height = "auto";
        blogWrapper.style.maxHeight = "none";
        blogWrapper.style.overflow = "visible";
    }

    const blogContainer = document.querySelector(".blog-container");
    if (blogContainer instanceof HTMLElement) {
        blogContainer.style.height = "auto";
        blogContainer.style.maxHeight = "none";
        blogContainer.style.overflow = "visible";
    }
}

/**
 * Ensure .blog-container is inside .rss-scroll-2, creating/wrapping as needed.
 * @returns {BlogWrapperResult | null}
 */
function ensureBlogScrollWrapper(): BlogWrapperResult | null {
    if (isBlogPath()) {
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
 * @param {RssPost} post
 * @returns {string}
 */
function renderPost(post: RssPost): string {
    const contentHtml = marked.parse(post.content);
    const expanded = isBlogPath();

    const arrow = expanded ? "🔽" : "▶️";
    const ariaExpanded = expanded ? "true" : "false";
    const contentClass = expanded ? "rss-post-content content-expanded" : "rss-post-content content-collapsed";
    const contentStyle = expanded ? "overflow: visible; max-height: none;" : "overflow: hidden; max-height: 0;";

    return `
        <div class="rss-post-block">
        <div class="rss-post-toggle" ${expanded ? "" : 'tabindex="0" role="button"'} aria-expanded="${ariaExpanded}">
            <div class="rss-post-header">
            <span class="summary-arrow">${arrow}</span>
            <span class="rss-post-title">${post.title}</span>
            <span class="rss-post-date">${formatDate(post.pubDate)}</span>
            </div>
            <div class="rss-post-meta"><span class="rss-post-author">By: ${post.author}</span></div>
            <div class="rss-post-summary summary-collapsed">
            <span class="summary-text">${post.description}</span>
            </div>
        </div>
        <div class="${contentClass}" style="${contentStyle}">${contentHtml}</div>
        </div>
    `;
}

/**
 * @param {HTMLElement} postDiv
 * @returns {void}
 */
function configurePostLinks(postDiv: HTMLElement): void {
    Array.from(postDiv.querySelectorAll<HTMLAnchorElement>("a[href]")).forEach((link) => {
        if (link.dataset.rssNewTab === "1") return;
        link.dataset.rssNewTab = "1";

        link.target = "_blank";
        link.rel = "noopener noreferrer";

        link.addEventListener("click", (ev) => {
            ev.stopPropagation();
        });
    });
}

/**
 * Force a post open and remove interactivity (blog page only).
 * @param {HTMLElement} postDiv
 * @returns {void}
 */
function lockPostExpanded(postDiv: HTMLElement): void {
    const toggleDiv = postDiv.querySelector(".rss-post-toggle");
    if (!(toggleDiv instanceof HTMLElement)) return;

    const headerDiv = toggleDiv.querySelector(".rss-post-header");
    if (headerDiv instanceof HTMLElement) {
        const arrowSpan = headerDiv.querySelector(".summary-arrow");
        if (arrowSpan instanceof HTMLElement) arrowSpan.textContent = "🔽";
    }

    toggleDiv.setAttribute("aria-expanded", "true");
    toggleDiv.removeAttribute("role");
    toggleDiv.removeAttribute("tabindex");
    toggleDiv.style.cursor = "default";

    const contentEl = postDiv.querySelector(".rss-post-content");
    if (!(contentEl instanceof HTMLElement)) return;

    contentEl.classList.add("content-expanded");
    contentEl.classList.remove("content-collapsed");
    contentEl.style.maxHeight = "none";
    contentEl.style.overflow = "visible";

    configurePostLinks(postDiv);
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

    configurePostLinks(postDiv);

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

    toggleRef.addEventListener("click", (ev) => {
        const clickPath = ev.composedPath();
        const clickedAnchor = clickPath.find((node) => node instanceof HTMLAnchorElement);
        if (clickedAnchor) return;

        togglePost();
    });

    toggleRef.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        togglePost();
    });

    contentDiv.addEventListener("click", (ev) => {
        if (!contentDiv.classList.contains("content-expanded")) return;

        const clickPath = ev.composedPath();
        const clickedInteractive = clickPath.find((node) =>
            node instanceof HTMLAnchorElement ||
            node instanceof HTMLButtonElement ||
            node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement ||
            node instanceof HTMLSelectElement ||
            node instanceof HTMLLabelElement
        );
        if (clickedInteractive) return;

        togglePost();
    });
}

/**
 * @param {HTMLElement} container
 * @returns {void}
 */
function attachAllToggles(container: HTMLElement): void {
    const posts = Array.from(container.querySelectorAll<HTMLElement>(".rss-post-block"));
    if (posts.length === 0) return;

    if (isBlogPath()) {
        posts.forEach((postDiv) => lockPostExpanded(postDiv));
        return;
    }

    posts.forEach((postDiv) => attachToggleLogic(postDiv));
}

/**
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
    const blogPage = isBlogPath();

    if (blogPage) {
        container.innerHTML = rows.join("");
    }

    if (!blogPage) {
        if (!blogClusteriser) {
            blogClusteriser = new Clusteriser(container);
            await blogClusteriser.init();
        }
        blogClusteriser.update(rows);
    }

    window.requestAnimationFrame(() => {
        attachAllToggles(container);

        if (blogPage) {
            applyBlogPageLayoutHints();
            return;
        }

        triggerAdjustOnToggles();
        setupDynamicScrollBox();
        window.setTimeout(() => adjustBlogScrollHeight(), 100);
    });
}

window.addEventListener("DOMContentLoaded", () => {
    applyBlogPageLayoutHints();
    void loadBlogFeed();
});