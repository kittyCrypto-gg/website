import * as h from "../helpers.ts";
import { mountWindow, type WindowHandle } from "../window.ts";
import { hydNtcs, popNtcs } from "./hydrate.ts";
import { readSeen, saveSeen } from "./storage.ts";
import type { Ntc } from "./types.ts";

const WINDOW_ID = "kc-ntcs";
const WINDOW_STORE_KEY = "window-api:" + WINDOW_ID + ":state";
const ROOT_ID = "kc-notices";
const CARD_SELECTOR = ".ntcs-card[data-ntc-id]";
const MIN_WIDTH = 800;
const CHROME_HEIGHT = 56;

function getDomIds(root: HTMLElement): readonly string[] {
    return Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR))
        .map((element) => element.dataset.ntcId || "")
        .filter((id) => id.length > 0);
}

function attachClose(
    windowHandle: WindowHandle,
    root: HTMLElement,
    cleanup?: () => void
): void {
    const frame = windowHandle.getFrameElement();
    if (!(frame instanceof HTMLElement)) return;

    const close = frame.querySelector(".window-controls .btn.close");
    if (!(close instanceof HTMLButtonElement)) return;

    close.addEventListener("click", () => {
        const ids = getDomIds(root);
        if (ids.length > 0) saveSeen([...readSeen(), ...ids]);
        cleanup?.();

        window.requestAnimationFrame(() => {
            windowHandle.dispose();
            root.remove();
        });
    });
}

function getContentHeight(
    windowHandle: WindowHandle,
    root: HTMLElement
): number {
    const frame = windowHandle.getFrameElement();
    if (!(frame instanceof HTMLElement)) return Math.ceil(root.scrollHeight);

    const oldFrame = {
        height: frame.style.height,
        minHeight: frame.style.minHeight,
        maxHeight: frame.style.maxHeight
    };
    const oldRoot = {
        height: root.style.height,
        minHeight: root.style.minHeight,
        maxHeight: root.style.maxHeight
    };

    frame.style.height = "auto";
    frame.style.minHeight = "";
    frame.style.maxHeight = "none";
    root.style.height = "auto";
    root.style.minHeight = "";
    root.style.maxHeight = "none";

    const height = Math.ceil(root.scrollHeight);
    Object.assign(frame.style, oldFrame);
    Object.assign(root.style, oldRoot);
    return height;
}

function fitWindow(windowHandle: WindowHandle, root: HTMLElement): void {
    const frame = windowHandle.getFrameElement();
    if (!(frame instanceof HTMLElement)) return;

    const width = String(MIN_WIDTH) + "px";
    frame.style.width = width;
    frame.style.minWidth = width;
    root.style.width = width;
    root.style.minWidth = width;

    const contentHeight = getContentHeight(windowHandle, root);
    const neededFrameHeight = contentHeight + CHROME_HEIGHT;
    const capped = neededFrameHeight > window.innerHeight;
    const frameHeight = capped ? "100vh" : String(neededFrameHeight) + "px";
    const rootHeight = capped
        ? "calc(100vh - " + String(CHROME_HEIGHT) + "px)"
        : String(contentHeight) + "px";

    frame.style.height = frameHeight;
    frame.style.minHeight = frameHeight;
    frame.style.maxHeight = frameHeight;
    root.style.height = rootHeight;
    root.style.minHeight = rootHeight;
    root.style.maxHeight = rootHeight;
}

function requestFit(windowHandle: WindowHandle, root: HTMLElement): void {
    window.requestAnimationFrame(() => fitWindow(windowHandle, root));
    window.setTimeout(() => fitWindow(windowHandle, root), 280);
}

function makeWindow(root: HTMLElement): WindowHandle {
    root.classList.add("ntcs-window");
    return mountWindow(root, {
        id: WINDOW_ID,
        title: "Website Notices",
        mountTarget: document.body,
        initFloat: true,
        initClosed: false,
        initMini: false,
        showCloseBttn: true,
        showMiniBttn: true,
        showFloatBttn: true
    });
}

function attachFit(
    windowHandle: WindowHandle,
    root: HTMLElement
): () => void {
    const onResize = (): void => fitWindow(windowHandle, root);
    window.addEventListener("resize", onResize);
    return (): void => window.removeEventListener("resize", onResize);
}

function initialFrameHeight(root: HTMLElement): number {
    return Math.min(
        window.innerHeight,
        Math.ceil(root.scrollHeight) + CHROME_HEIGHT
    );
}

export function mountNotices(notices: readonly Ntc[]): void {
    const old = document.getElementById(ROOT_ID);
    old?.remove();

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.style.width = String(MIN_WIDTH) + "px";
    root.style.minWidth = String(MIN_WIDTH) + "px";
    document.body.appendChild(root);

    popNtcs(root, notices);

    h.ensCtrWinState({
        storeKey: WINDOW_STORE_KEY,
        width: MIN_WIDTH,
        height: initialFrameHeight(root),
        force: true
    });

    const handle = makeWindow(root);
    handle.open();

    const stopFit = attachFit(handle, root);
    const onToggle = (): void => requestFit(handle, root);
    attachClose(handle, root, stopFit);
    hydNtcs(root, onToggle);
    window.requestAnimationFrame(() => fitWindow(handle, root));
}
