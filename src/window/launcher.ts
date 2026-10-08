import { clampLauncherPosition } from "./geometry.ts";
import { createRuntimeLauncher } from "./staticFrame.tsx";
import type { WindowApiOptions } from "./types.ts";

export type LauncherResolution = Readonly<{
    launcher: HTMLElement;
    ownsLauncher: boolean;
}>;

export type LauncherOriginalPosition = Readonly<{
    parent: HTMLElement | null;
    nextSibling: ChildNode | null;
}>;

export type LauncherMove = Readonly<{
    left: number;
    top: number;
}>;

export function resolveLauncher(
    options: WindowApiOptions,
    windowId: string
): LauncherResolution {
    if (options.launcher) {
        return {
            launcher: options.launcher,
            ownsLauncher: false
        };
    }

    const prebuilt = document.getElementById(`window-api-launcher-${windowId}`);
    const title = options.title ?? windowId;
    const src = options.launcherSrc ?? "/images/file.svg";
    const launcher = prebuilt instanceof HTMLImageElement
        ? prebuilt
        : createRuntimeLauncher(
            windowId, title, src, options.closedLnchrDis ?? "inline-block",
            options.initClosed ?? false
        );

    // No duplicate DOM attributes or re-requested image when hydrating HTML.
    if (launcher.getAttribute("src") !== src) launcher.src = src;
    if (launcher.alt !== `${title} icon`) launcher.alt = `${title} icon`;
    if (launcher.title !== `Double-click to open ${title}`) launcher.title = `Double-click to open ${title}`;
    if (launcher.draggable) launcher.draggable = false;
    if (launcher.parentElement !== document.body) document.body.appendChild(launcher);

    return {
        launcher,
        ownsLauncher: true
    };
}

export function extractExternalLauncher(
    frame: HTMLElement,
    launcher: HTMLElement,
    ownsLauncher: boolean
): LauncherOriginalPosition | null {
    if (ownsLauncher) return null;
    if (!frame.contains(launcher)) return null;

    const original: LauncherOriginalPosition = {
        parent: launcher.parentElement,
        nextSibling: launcher.nextSibling
    };

    document.body.appendChild(launcher);
    return original;
}

export function restoreLauncher(
    launcher: HTMLElement | null,
    ownsLauncher: boolean,
    originalParent: HTMLElement | null,
    originalNextSibling: ChildNode | null
): void {
    if (!launcher) return;
    if (ownsLauncher) {
        launcher.remove();
        return;
    }

    const canRestoreBefore =
        originalParent !== null &&
        originalNextSibling !== null &&
        originalNextSibling.parentNode === originalParent;

    if (canRestoreBefore) {
        originalParent.insertBefore(launcher, originalNextSibling);
    }

    if (originalParent && !canRestoreBefore) {
        originalParent.appendChild(launcher);
    }

    launcher.classList.remove("window-launcher", "is-dragging");
    launcher.removeAttribute("data-window-launcher-visible");
    launcher.style.removeProperty("--window-launcher-left");
    launcher.style.removeProperty("--window-launcher-top");
    launcher.style.removeProperty("--window-launcher-display");
    launcher.style.width = "";
    launcher.style.height = "";
    launcher.style.left = "";
    launcher.style.top = "";
}

export function prepareLauncher(
    launcher: HTMLElement,
    size: number,
    closedDisplay: string
): void {
    launcher.classList.add("window-launcher");
    launcher.style.width = `${size}px`;
    launcher.style.height = `${size}px`;

    if (launcher instanceof HTMLImageElement) {
        launcher.style.objectFit = "contain";
    }

    launcher.style.setProperty(
        "--window-launcher-display",
        closedDisplay
    );
}

export function applyLauncherPosition(
    launcher: HTMLElement,
    x: string,
    y: string
): void {
    launcher.style.setProperty("--window-launcher-left", x);
    launcher.style.setProperty("--window-launcher-top", y);
    launcher.style.left = x;
    launcher.style.top = y;
}

export function showLauncher(
    launcher: HTMLElement,
    x: string,
    y: string
): void {
    launcher.classList.add("window-launcher");
    launcher.setAttribute("data-window-launcher-visible", "true");
    applyLauncherPosition(launcher, x, y);
}

/** Keep the server-rendered launcher node when its runtime controller is disposed. */
export function resetStaticLauncher(launcher: HTMLElement, initiallyClosed: boolean): void {
    launcher.classList.remove("is-dragging");
    launcher.style.removeProperty("--window-launcher-left");
    launcher.style.removeProperty("--window-launcher-top");
    launcher.style.removeProperty("left");
    launcher.style.removeProperty("top");
    const visible = String(initiallyClosed);
    if (launcher.getAttribute("data-window-launcher-visible") !== visible) {
        launcher.setAttribute("data-window-launcher-visible", visible);
    }
}

export function hideLauncher(launcher: HTMLElement): void {
    launcher.classList.add("window-launcher");
    launcher.setAttribute("data-window-launcher-visible", "false");
}

export function wireLauncherInteractions(
    launcher: HTMLElement,
    size: number,
    onOpen: () => void,
    onMove: (move: LauncherMove) => void
): () => void {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onDoubleClick = (): void => onOpen();

    const onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) return;

        const rect = launcher.getBoundingClientRect();
        dragging = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;

        launcher.classList.add("is-dragging");
        event.preventDefault();
        event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent): void => {
        if (!dragging) return;

        onMove(
            clampLauncherPosition(
                launcher,
                size,
                event.clientX - offsetX,
                event.clientY - offsetY
            )
        );
    };

    const onPointerUp = (): void => {
        if (!dragging) return;
        dragging = false;
        launcher.classList.remove("is-dragging");
    };

    launcher.addEventListener("dblclick", onDoubleClick);
    launcher.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);

    return (): void => {
        launcher.removeEventListener("dblclick", onDoubleClick);
        launcher.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
    };
}
