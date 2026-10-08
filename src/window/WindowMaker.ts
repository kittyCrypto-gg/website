import type { WindowApiOptions, WindowHandle } from "./types.ts";
import { WindowEvents } from "./WindowEvents.ts";
import { captureContentLayout, captureFramePadding, captureFrameStyle, restoreFrameStyle } from "./styleSnapshot.ts";
import { clearMinimisedBodyLayout, clearMinimisedFrameLayout, clearMountedContentLayout, clearMountedFrameLayout } from "./layout.ts";
import { resolveLauncher, extractExternalLauncher, restoreLauncher, resetStaticLauncher } from "./launcher.ts";

/** Window feature: WindowMaker responsibility. */
export class WindowMaker extends WindowEvents {
    /**
     * Turns the supplied element into a managed window by building its header,
     * wrapping its original content into a generic content root, wiring controls and events,
     * and applying the current state.
     *
     * Calling this more than once on the same instance is a no-op.
     *
     * @param {HTMLElement} element The DOM element to manage as a window frame.
     * @returns {this} The current instance for chaining.
     * @throws {Error} Thrown when the element is already mounted by another window instance.
     */
    public makeWindow(element: HTMLElement): this {
        if (this.frameEl) return this;

        if (element.dataset.windowApiMounted === "true") {
            throw new Error(`Element is already mounted as a window: ${element.id || this.windowId}`);
        }

        this.frameEl = element;
        this.ogParent = element.parentElement;
        this.ogNxtSibling = element.nextSibling;

        // Measure the original content layout without the pre-rendered frame
        // class. Restore it synchronously before attaching window behaviour.
        const staticFrame = element.dataset.kcStaticWindow === this.windowId;
        if (staticFrame) element.classList.remove("window-frame");

        this.frameStyle = captureFrameStyle(element);
        this.framePadding = captureFramePadding(element);
        this.contentLayout = captureContentLayout(element);

        if (staticFrame) element.classList.add("window-frame");

        const launcherResolution = resolveLauncher(this.options, this.windowId);
        this.launcherEl = launcherResolution.launcher;
        this.ownsLauncher = launcherResolution.ownsLauncher;

        const originalLauncherPosition = this.frameEl
            ? extractExternalLauncher(
                this.frameEl,
                this.launcherEl,
                this.ownsLauncher
            )
            : null;

        this.launcherOriginalParent = originalLauncherPosition?.parent ?? null;
        this.launcherOriginalNextSibling = originalLauncherPosition?.nextSibling ?? null;
        this.mntFrame();
        this.buildWindow();
        this.seedPos();
        this.wireControls();
        this.wireFrameDrag();
        this.wireLauncher();
        this.wireFrameFocus();
        this.wireViewportRzs();
        this.observeFloatRzs();

        element.dataset.windowApiMounted = "true";
        element.dataset.windowId = this.windowId;

        this.applyState();
        this.qLaytChng();

        return this;
    }

    /**
     * Removes all event listeners, disconnects observers, restores DOM structure
     * and inline styles, and releases internal element references.
     *
     * @returns {void}
     */
    public dispose(): void {
        for (const cleanup of this.cleanupFns) {
            cleanup();
        }

        this.cleanupFns = [];

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }

        this.restoreFrame();

        const builtFrame = this.frameEl?.dataset.kcStaticWindow === this.windowId;
        // A pre-rendered frame belongs to the HTML document. Teardown must
        // detach listeners and clear runtime state without destroying its nodes.
        if (!builtFrame && this.frameEl && this.contentRootEl) {
            while (this.contentRootEl.firstChild) {
                this.frameEl.appendChild(this.contentRootEl.firstChild);
            }
        }

        if (!builtFrame) this.headerEl?.remove();
        if (!builtFrame) this.bodyEl?.remove();
        this.dockedPlaceholderEl?.remove();

        const frame = this.frameEl;

        if (frame) {
            frame.removeAttribute("data-window-api-mounted");
            frame.removeAttribute("data-window-id");
            frame.removeAttribute("data-window-floating");
            frame.removeAttribute("data-window-maximised");
            frame.removeAttribute("data-window-minimised");
            frame.removeAttribute("data-window-closed");
            frame.classList.remove("window-frame", "floating", "maximised", "minimised", "closed");
        }

        if (builtFrame && frame) {
            frame.classList.add("window-frame");
            frame.classList.toggle("closed", this.options.initClosed ?? false);
            frame.classList.toggle("minimised", this.options.initMini ?? false);
            frame.classList.toggle("floating", this.options.initFloat ?? this.options.initFloatPos !== undefined);
        }

        if (frame) clearMinimisedFrameLayout(frame);
        if (frame && this.bodyEl) clearMinimisedBodyLayout(this.bodyEl);
        if (frame) clearMountedFrameLayout(frame);
        if (frame && this.bodyEl && this.contentRootEl) {
            clearMountedContentLayout(
                frame,
                this.bodyEl,
                this.contentRootEl
            );
        }

        if (frame && this.frameStyle) {
            restoreFrameStyle(frame, this.frameStyle);
        }

        const builtLauncher = this.launcherEl?.dataset.kcStaticWindowLauncher === this.windowId;
        if (builtLauncher && this.launcherEl) {
            resetStaticLauncher(this.launcherEl, this.options.initClosed ?? false);
        }
        if (!builtLauncher) {
            restoreLauncher(
                this.launcherEl,
                this.ownsLauncher,
                this.launcherOriginalParent,
                this.launcherOriginalNextSibling
            );
        }

        if (builtFrame && this.floatButtonEl) this.floatButtonEl.hidden = false;

        this.frameEl = null;
        this.headerEl = null;
        this.bodyEl = null;
        this.contentRootEl = null;
        this.closeButtonEl = null;
        this.minimiseButtonEl = null;
        this.floatButtonEl = null;
        this.titleEl = null;
        this.launcherEl = null;
        this.launcherOriginalParent = null;
        this.launcherOriginalNextSibling = null;
        this.dockedPlaceholderEl = null;
        this.isMountedInFloatingHost = false;
    }

}

/**
 * Mounts a single element as a managed window immediately.
 *
 * This is the runtime API for code-driven windows, unlike instantiateWindows,
 * which is for config-driven batch bootstrapping.
 *
 * @param {HTMLElement} element - Element to convert into a window.
 * @param {WindowApiOptions} [options={}] - Window options.
 * @returns {WindowHandle} Window controller.
 */
export function mountWindow(
    element: HTMLElement,
    options: WindowApiOptions = {}
): WindowHandle {
    const maker = new WindowMaker(options);
    maker.makeWindow(element);
    return maker;
}

