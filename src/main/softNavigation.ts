/**
 * Keep the xterm DOM and live mikuOS process while navigating among the
 * site's regular static pages. Page HTML is still served normally to bots,
 * hard reloads and browsers without JavaScript.
 */
const SOFT_PAGES = new Set(["index", "about", "blog", "resources", "guestbook"]);

function page(path: string): string | null {
    const normalised = path.replace(/^\/+|\/+$/g, "").replace(/\.html$/, "");
    const name = normalised || "index";
    return SOFT_PAGES.has(name) ? name : null;
}

function destination(anchor: HTMLAnchorElement, event: MouseEvent): URL | null {
    if (event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
    if (anchor.hasAttribute("download") ||
        (anchor.target && anchor.target !== "_self")) return null;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin || !page(url.pathname)) return null;
    if (!page(location.pathname)) return null;
    if (url.pathname === location.pathname && url.search === location.search) return null;
    return url;
}

export function installSoftNavigation(onRoute: () => void): void {
    let navigating = false;

    const visit = async (url: URL, push: boolean): Promise<void> => {
        if (navigating) return;
        navigating = true;
        try {
            const response = await fetch(url.href, { credentials: "same-origin" });
            if (!response.ok) throw new Error("Page returned HTTP " + response.status);
            const incomingDocument = new DOMParser().parseFromString(
                await response.text(), "text/html");
            const current = document.querySelector<HTMLElement>(".frame-content");
            const next = incomingDocument.querySelector<HTMLElement>(".frame-content");
            const liveShell = current?.querySelector<HTMLElement>("#shell-wrapper");
            const liveMenu = current?.querySelector<HTMLElement>("#main-menu");
            if (!current || !next || !liveShell || !liveMenu) {
                throw new Error("Destination lacks the shared website shell");
            }
            const replacement = document.importNode(next, true);
            const shellSlot = replacement.querySelector("#shell-wrapper");
            const menuSlot = replacement.querySelector("#main-menu");
            if (!shellSlot || !menuSlot) throw new Error("Missing destination terminal slot");
            shellSlot.replaceWith(liveShell);
            menuSlot.replaceWith(liveMenu);
            current.className = replacement.className;
            current.replaceChildren(...Array.from(replacement.childNodes));
            document.title = incomingDocument.title;
            if (push) history.pushState({ kcSoft: true }, "", url);
            window.scrollTo(0, 0);
            onRoute();
        } catch (error) {
            console.warn("[mikuOS navigation] Falling back to document navigation", error);
            location.assign(url.href);
        } finally {
            navigating = false;
        }
    };

    document.addEventListener("click", (event: MouseEvent) => {
        const anchor = event.target instanceof Element
            ? event.target.closest<HTMLAnchorElement>("a[href]")
            : null;
        if (!anchor) return;
        const url = destination(anchor, event);
        if (!url) return;
        event.preventDefault();
        void visit(url, true);
    });

    window.addEventListener("popstate", () => {
        if (!page(location.pathname)) return;
        void visit(new URL(location.href), false);
    });
}
