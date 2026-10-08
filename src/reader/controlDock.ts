import { removeExistingById } from "../domSingletons.ts";
import { setButtonIcon } from "./views.tsx";

const FLOAT_MARKER_ID = "kc-reader-controls-float-marker";
const SPACER_ID = "kc-reader-controls-spacer";

let bottomObserver: IntersectionObserver | null = null;
let markerAbove = false;
let bottomSeen = false;
let scrollHandler: (() => void) | null = null;
let resizeHandler: (() => void) | null = null;

function isVisible(element: Element | null): boolean {
    if (!(element instanceof HTMLElement)) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    if (style.display === "none") return false;
    if (style.visibility === "hidden") return false;
    if (rect.width <= 0 || rect.height <= 0) return false;

    return rect.bottom > 0 && rect.top < window.innerHeight;
}

export function syncControlDock(
    root: Document = document
): void {
    const controls = root.querySelector<HTMLElement>(
        ".reader-controls-top"
    );
    const marker = root.getElementById(FLOAT_MARKER_ID);
    const spacer = root.getElementById(SPACER_ID);
    const bottomControls = root.querySelector<HTMLElement>(
        ".reader-controls-bottom"
    );

    if (!controls || !marker || !spacer) return;

    markerAbove = marker.getBoundingClientRect().top < 0;
    bottomSeen = isVisible(bottomControls);

    const floating = markerAbove && !bottomSeen;
    controls.classList.toggle("reader-controls-top--floating", floating);
    spacer.style.display = floating ? "block" : "none";
    spacer.style.height = floating
        ? `${controls.getBoundingClientRect().height}px`
        : "0px";
}

export function setTopScrollMode(
    mode: "down" | "up",
    root: Document = document
): void {
    const button = root.querySelector<HTMLButtonElement>(
        ".reader-controls-top .btn-scroll-down, " +
        ".reader-controls-top .btn-scroll-up"
    );

    if (!button) return;

    const up = mode === "up";
    const icon = up
        ? window.buttons.scrollUp.icon
        : window.buttons.scrollDown.icon;
    const action = up
        ? window.buttons.scrollUp.action
        : window.buttons.scrollDown.action;

    setButtonIcon(button, icon);
    button.title = action;
    button.setAttribute("aria-label", action);
    button.classList.toggle("btn-scroll-up", up);
    button.classList.toggle("btn-scroll-down", !up);
}

export function syncTopScrollMode(
    root: Document = document
): void {
    const scrollTop = window.scrollY || window.pageYOffset || 0;
    const viewportHeight = window.innerHeight;
    const documentElement = root.documentElement;
    const body = root.body;
    const scrollHeight = Math.max(
        documentElement.scrollHeight,
        body ? body.scrollHeight : 0
    );

    const distanceTop = scrollTop;
    const distanceBottom = Math.max(
        0,
        scrollHeight - (scrollTop + viewportHeight)
    );

    setTopScrollMode(
        distanceTop > distanceBottom ? "up" : "down",
        root
    );
}

function disconnectExisting(): void {
    window.__kcReaderCtrlObserver?.disconnect();
    window.__kcReaderCtrlObserver = null;

    bottomObserver?.disconnect();
    bottomObserver = null;

    if (scrollHandler) {
        window.removeEventListener("scroll", scrollHandler);
        scrollHandler = null;
    }

    if (resizeHandler) {
        window.removeEventListener("resize", resizeHandler);
        resizeHandler = null;
    }

    markerAbove = false;
    bottomSeen = false;
}

export function detachReaderControls(): void {
    const controls = document.querySelector<HTMLElement>(
        ".reader-controls-top"
    );
    const bottomControls = document.querySelector<HTMLElement>(
        ".reader-controls-bottom"
    );

    if (!controls) return;

    removeExistingById(FLOAT_MARKER_ID);
    removeExistingById(SPACER_ID);
    disconnectExisting();

    const spacer = document.createElement("div");
    spacer.id = SPACER_ID;
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.display = "none";
    spacer.style.height = "0px";
    spacer.style.margin = "0";
    spacer.style.padding = "0";
    spacer.style.border = "0";
    spacer.style.pointerEvents = "none";

    const marker = document.createElement("div");
    marker.id = FLOAT_MARKER_ID;
    marker.setAttribute("aria-hidden", "true");
    marker.style.width = "1px";
    marker.style.height = "1px";
    marker.style.margin = "0";
    marker.style.padding = "0";
    marker.style.border = "0";
    marker.style.opacity = "0";
    marker.style.pointerEvents = "none";

    controls.insertAdjacentElement("afterend", spacer);
    spacer.insertAdjacentElement("afterend", marker);

    const markerObserver = new IntersectionObserver(
        () => syncControlDock(document),
        { threshold: 0 }
    );

    markerObserver.observe(marker);
    window.__kcReaderCtrlObserver = markerObserver;
    window.readerTopAnchor = marker;

    if (bottomControls) {
        bottomObserver = new IntersectionObserver(
            () => syncControlDock(document),
            { threshold: 0 }
        );
        bottomObserver.observe(bottomControls);
    }

    scrollHandler = (): void => {
        syncTopScrollMode(document);
        syncControlDock(document);
    };

    resizeHandler = (): void => {
        syncTopScrollMode(document);
        syncControlDock(document);
    };

    window.addEventListener("scroll", scrollHandler, { passive: true });
    window.addEventListener("resize", resizeHandler);

    requestAnimationFrame(() => {
        syncTopScrollMode(document);
        syncControlDock(document);
    });
}
