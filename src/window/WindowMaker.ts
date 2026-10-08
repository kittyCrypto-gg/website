import type {
    ContentLayout,
    FramePadding,
    FrameStyle,
    MutableWindowState,
    WindowApiOptions,
    WindowHandle
} from "./types.ts";
import {
    captureContentLayout,
    captureFramePadding,
    captureFrameStyle,
    restoreFrameStyle
} from "./styleSnapshot.ts";
import {
    createControlButton,
    shouldShowButton
} from "./controls.ts";
import {
    clampFramePosition,
    clampLauncherPosition,
    parsePx
} from "./geometry.ts";
import {
    persistWindowState,
    readWindowState,
    resolveWindowId,
    sanitiseWindowId
} from "./state.ts";
import {
    applyContentRootLayout,
    applyMinimisedBodyLayout,
    applyMinimisedFrameLayout,
    applyMountedContentLayout,
    applyMountedFrameLayout,
    clearMinimisedBodyLayout,
    clearMinimisedFrameLayout,
    clearMountedContentLayout,
    clearMountedFrameLayout
} from "./layout.ts";
import {
    applyLauncherPosition,
    extractExternalLauncher,
    hideLauncher,
    prepareLauncher,
    resolveLauncher,
    restoreLauncher,
    showLauncher,
    wireLauncherInteractions
} from "./launcher.ts";
import {
    observeFrameResize,
    wireFrameDrag as wireFrameDragInteraction,
    wireFrameFocus as wireFrameFocusInteraction,
    wireViewportResize
} from "./interactions.ts";

/**
 * Manages a DOM element as a draggable desktop-style window with persisted state,
 * launcher integration, floating and maximised modes, nested-window support,
 * and cleanup support.
 */
export class WindowMaker {
    private static zIndexCounter = 1000;
    private static readonly launcherSize = 48;

    private readonly options: WindowApiOptions;
    private readonly windowId: string;
    private readonly storageKey: string;

    private state: MutableWindowState;

    private frameEl: HTMLElement | null = null;
    private headerEl: HTMLDivElement | null = null;
    private bodyEl: HTMLDivElement | null = null;
    private contentRootEl: HTMLDivElement | null = null;

    private closeButtonEl: HTMLButtonElement | null = null;
    private minimiseButtonEl: HTMLButtonElement | null = null;
    private floatButtonEl: HTMLButtonElement | null = null;
    private titleEl: HTMLSpanElement | null = null;

    private launcherEl: HTMLElement | null = null;
    private ownsLauncher = false;
    private launcherOriginalParent: HTMLElement | null = null;
    private launcherOriginalNextSibling: ChildNode | null = null;

    private ogParent: HTMLElement | null = null;
    private ogNxtSibling: ChildNode | null = null;
    private originalContentNodes: ChildNode[] = [];
    private frameStyle: FrameStyle | null = null;
    private framePadding: FramePadding | null = null;
    private contentLayout: ContentLayout | null = null;

    private dockedPlaceholderEl: Comment | null = null;
    private isMountedInFloatingHost = false;

    private resizeObserver: ResizeObserver | null = null;
    private cleanupFns: Array<() => void> = [];
    private layoutQueued = false;
    private hadStoredState = false;

    /**
     * Creates a new window controller instance and loads any previously persisted state.
     *
     * @param {WindowApiOptions} [options={}] Runtime configuration for window behaviour, mounting, launcher handling, floating host handling, button visibility, floating spawn position, and initial state.
     * @returns {void}
     */
    public constructor(options: WindowApiOptions = {}) {
        this.options = options;
        this.windowId = resolveWindowId(options.id);
        this.storageKey = `window-api:${this.windowId}:state`;

        const restored = readWindowState(
            this.storageKey,
            options
        );

        this.state = restored.state;
        this.hadStoredState = restored.hadStoredState;
    }

    /**
     * @param {unknown} target Raw mount target from JSON.
     * @returns {HTMLElement | null} Resolved target element, or null when not found.
     */
    public static resolveMountTarget(target: unknown): HTMLElement | null {
        if (typeof target !== "string") {
            return null;
        }

        const selector = target.trim();

        if (!selector) {
            return null;
        }

        if (selector === "body") {
            return document.body;
        }

        if (selector === "html") {
            return document.documentElement;
        }

        const element = document.querySelector(selector);
        return element instanceof HTMLElement ? element : null;
    }

    /**
     * @param {string} windowId Window id to normalise for storage keys.
     * @returns {string} Sanitised window id.
     */
    public static sanitiseWindowId(windowId: string): string {
        return sanitiseWindowId(windowId);
    }

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
     * Opens the window and ensures it is not minimised.
     *
     * @returns {void}
     */
    public open(): void {
        this.state.closed = false;
        this.state.mini = false;
        this.persistState();
        this.applyState();
    }

    /**
     * Closes the window and clears any minimised state.
     *
     * @returns {void}
     */
    public close(): void {
        this.captureLaunchrPos();
        this.state.closed = true;
        this.state.mini = false;
        this.persistState();
        this.applyState();
    }

    /**
     * Minimises the window.
     *
     * If the window is maximised, its saved bounds are restored first.
     * If the window is floating, it is docked before being minimised.
     *
     * @returns {void}
     */
    public minimise(): void {
        if (this.state.mini) return;

        if (this.state.maxi) {
            this.restoreBnds();
            this.state.maxi = false;
        }

        if (this.state.float) {
            this.state.float = false;
        }

        this.state.mini = true;
        this.persistState();
        this.applyState();
    }

    /**
     * Restores a minimised window back to its visible state.
     *
     * @returns {void}
     */
    public restore(): void {
        if (!this.state.mini) return;

        this.state.mini = false;
        this.persistState();
        this.applyState();
    }

    /**
     * Toggles the window between docked and floating modes.
     *
     * If floating is being turned off while maximised, the previous bounds are restored first.
     * On the first transition into floating mode without stored state, the current bounds are captured.
     *
     * @returns {void}
     */
    public toggleFloating(): void {
        if (!this.frameEl) return;
        if (this.state.mini) return;

        if (this.state.float && this.state.maxi) {
            this.restoreBnds();
            this.state.maxi = false;
        }

        if (this.state.float) {
            this.state.float = false;
            this.persistState();
            this.applyState();
            return;
        }

        if (!this.hadStoredState) {
            this.captureBounds();
        }

        this.state.float = true;
        this.persistState();
        this.applyState();
    }

    /**
     * Toggles maximised mode for the window.
     *
     * Entering maximised mode forces the window into floating mode and stores a restore snapshot.
     * Toggling again restores the previous bounds.
     *
     * @returns {void}
     */
    public toggleMaximised(): void {
        if (!this.frameEl) return;
        if (this.state.mini) return;

        if (this.state.float && this.state.maxi) {
            this.restoreBnds();
            this.state.maxi = false;
            this.persistState();
            this.applyState();
            return;
        }

        this.saveBndsSnp();
        this.state.float = true;
        this.state.maxi = true;
        this.persistState();
        this.applyState();
    }

    /**
     * Reports whether the window is currently closed.
     *
     * @returns {boolean} True when the window is closed.
     */
    public isClosed(): boolean {
        return this.state.closed;
    }

    /**
     * Reports whether the window is currently minimised.
     *
     * @returns {boolean} True when the window is minimised.
     */
    public isMinimised(): boolean {
        return this.state.mini;
    }

    /**
     * Reports whether the window is currently floating.
     *
     * @returns {boolean} True when the window is floating.
     */
    public isFloating(): boolean {
        return this.state.float;
    }

    /**
     * Returns the managed frame element, if the window has been mounted.
     *
     * @returns {HTMLElement | null} The managed frame element, or null if not mounted.
     */
    public getFrameElement(): HTMLElement | null {
        return this.frameEl;
    }

    /**
     * Returns the resolved window identifier used for storage and element IDs.
     *
     * @returns {string} The stable window identifier.
     */
    public getWindowId(): string {
        return this.windowId;
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

        if (this.frameEl && this.contentRootEl) {
            while (this.contentRootEl.firstChild) {
                this.frameEl.appendChild(this.contentRootEl.firstChild);
            }
        }

        this.headerEl?.remove();
        this.bodyEl?.remove();
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

        restoreLauncher(
            this.launcherEl,
            this.ownsLauncher,
            this.launcherOriginalParent,
            this.launcherOriginalNextSibling
        );

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

    /**
     * Persists the current window state.
     *
     * @returns {void}
     */
    private persistState(): void {
        if (!persistWindowState(this.storageKey, this.state)) return;
        this.hadStoredState = true;
    }

    /**
     * Mounts the frame into the configured docked mount target when it is not already attached.
     *
     * @returns {void}
     */
    private mntFrame(): void {
        if (!this.frameEl) return;
        if (this.frameEl.parentElement) return;

        const target = this.options.mountTarget ?? document.body;

        if (this.options.insertAtStart && target.firstChild) {
            target.insertBefore(this.frameEl, target.firstChild);
            return;
        }

        target.appendChild(this.frameEl);
    }

    /**
     * Returns the mount target used while the frame is floating.
     *
     * @returns {HTMLElement} The floating mount target.
     */
    private getFloatMntTrgt(): HTMLElement {
        return this.options.floatMntTrgt ?? document.body;
    }

    /**
     * Moves the frame into the floating mount target while leaving a placeholder behind
     * so it can later return to its exact docked position.
     *
     * @returns {void}
     */
    private moveFr2FloatHost(): void {
        if (!this.frameEl) return;

        const floatingHost = this.getFloatMntTrgt();
        const currentParent = this.frameEl.parentElement;

        if (currentParent === floatingHost) {
            this.isMountedInFloatingHost = true;
            return;
        }

        if (!this.dockedPlaceholderEl) {
            this.dockedPlaceholderEl = document.createComment(`window-api:${this.windowId}:dock`);
        }

        if (currentParent) {
            currentParent.insertBefore(this.dockedPlaceholderEl, this.frameEl);
        }

        floatingHost.appendChild(this.frameEl);
        this.isMountedInFloatingHost = true;
    }

    /**
     * Restores the frame to its previous docked DOM position.
     *
     * When a placeholder exists it is used as the source of truth. Otherwise the original
     * parent and sibling are used as a fallback.
     *
     * @returns {void}
     */
    private restoreFrame(): void {
        if (!this.frameEl) return;

        if (this.dockedPlaceholderEl?.parentNode) {
            this.dockedPlaceholderEl.parentNode.insertBefore(this.frameEl, this.dockedPlaceholderEl);
            this.dockedPlaceholderEl.remove();
            this.dockedPlaceholderEl = null;
            this.isMountedInFloatingHost = false;
            return;
        }

        const dockedParent = this.ogParent ?? this.options.mountTarget ?? null;
        if (!dockedParent) return;

        if (this.frameEl.parentElement === dockedParent) {
            this.isMountedInFloatingHost = false;
            return;
        }

        if (this.ogNxtSibling && this.ogNxtSibling.parentNode === dockedParent) {
            dockedParent.insertBefore(this.frameEl, this.ogNxtSibling);
        } else {
            dockedParent.appendChild(this.frameEl);
        }

        this.isMountedInFloatingHost = false;
    }

    /**
     * Builds the runtime window structure by creating a header, controls, title,
     * a generated content root, and a body wrapper, then moving the frame's original
     * child nodes into that content root.
     *
     * @returns {void}
     * @throws {Error} Thrown when called without a frame element.
     */
    private buildWindow(): void {
        if (!this.frameEl) {
            throw new Error("Cannot build window without a content element");
        }

        // Static pages already contain the complete frame. Hydrate those
        // exact nodes rather than moving the content and rebuilding controls.
        if (this.frameEl.dataset.kcStaticWindow === this.windowId) {
            this.hydrateStaticFrame();
            return;
        }

        this.originalContentNodes = Array.from(this.frameEl.childNodes);

        const header = document.createElement("div");
        header.id = `${this.windowId}-header`;
        header.className = "window-header";

        const controls = document.createElement("div");
        controls.className = "window-controls";

        const closeButton = shouldShowButton(this.options, "close")
            ? createControlButton(this.windowId, "close", "Close")
            : null;
        const minimiseButton = shouldShowButton(this.options, "minimise")
            ? createControlButton(this.windowId, "minimise", "Minimise / restore")
            : null;
        const floatButton = shouldShowButton(this.options, "float")
            ? createControlButton(this.windowId, "float", "Float / dock")
            : null;

        const title = document.createElement("span");
        title.id = `${this.windowId}-title`;
        title.className = "window-title";
        title.textContent = this.options.title ?? this.frameEl.getAttribute("data-window-title") ?? "Window";

        const body = document.createElement("div");
        body.id = `${this.windowId}-body`;
        body.className = "window-body";

        const contentRoot = document.createElement("div");
        contentRoot.className = "window-content-root";
        contentRoot.dataset.windowContentRoot = "true";

        for (const node of this.originalContentNodes) {
            contentRoot.appendChild(node);
        }

        if (closeButton) {
            controls.appendChild(closeButton);
        }

        if (minimiseButton) {
            controls.appendChild(minimiseButton);
        }

        if (floatButton) {
            controls.appendChild(floatButton);
        }

        header.appendChild(controls);
        header.appendChild(title);
        body.appendChild(contentRoot);

        this.frameEl.appendChild(header);
        this.frameEl.appendChild(body);

        this.headerEl = header;
        this.bodyEl = body;
        this.contentRootEl = contentRoot;
        this.closeButtonEl = closeButton;
        this.minimiseButtonEl = minimiseButton;
        this.floatButtonEl = floatButton;
        this.titleEl = title;

        if (this.contentRootEl && this.contentLayout) {
            applyContentRootLayout(
                this.contentRootEl,
                this.contentLayout
            );
        }
    }

    /**
     * Attaches the controller to a window structure emitted by the page build.
     * Performs no replacements or content relocation.
     */
    private hydrateStaticFrame(): void {
        const frame = this.frameEl;
        if (!frame) return;

        const header = frame.querySelector(":scope > .window-header");
        const body = frame.querySelector(":scope > .window-body");
        const contentRoot = body?.querySelector(":scope > [data-window-content-root='true']");
        const title = header?.querySelector(".window-title");
        if (!(header instanceof HTMLDivElement)) throw new Error("Static window header missing");
        if (!(body instanceof HTMLDivElement)) throw new Error("Static window body missing");
        if (!(contentRoot instanceof HTMLDivElement)) throw new Error("Static window content missing");
        if (!(title instanceof HTMLSpanElement)) throw new Error("Static window title missing");

        this.headerEl = header;
        this.bodyEl = body;
        this.contentRootEl = contentRoot;
        this.titleEl = title;
        this.closeButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="close"]');
        this.minimiseButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="minimise"]');
        this.floatButtonEl = header.querySelector<HTMLButtonElement>('[data-window-role="float"]');
        this.originalContentNodes = Array.from(contentRoot.childNodes);

        if (this.contentLayout) applyContentRootLayout(contentRoot, this.contentLayout);
    }

    /**
     * Seeds the initial frame and launcher positions from the element's current layout
     * when no stored state exists yet.
     *
     * A configured floating spawn position is preserved and only width and height are
     * taken from the current layout in that case.
     *
     * @returns {void}
     */
    private seedPos(): void {
        if (!this.frameEl) return;
        if (this.hadStoredState) return;

        const rect = this.frameEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const shouldPreserveConfiguredFloatingPosition =
            this.state.float && this.options.initFloatPos !== undefined;

        this.state.width = `${rect.width}px`;
        this.state.height = `${rect.height}px`;

        if (shouldPreserveConfiguredFloatingPosition) {
            return;
        }

        this.state.x = `${rect.left}px`;
        this.state.y = `${rect.top}px`;
        this.state.launcherX = `${rect.left}px`;
        this.state.launcherY = `${rect.top}px`;
    }

    /**
     * Captures the frame's current bounds into the active state.
     *
     * This is used when switching into floating mode before any previous layout
     * has been stored.
     *
     * @returns {void}
     */
    private captureBounds(): void {
        if (!this.frameEl) return;

        const rect = this.frameEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        this.state.x = `${rect.left}px`;
        this.state.y = `${rect.top}px`;
        this.state.width = `${rect.width}px`;
        this.state.height = `${rect.height}px`;
    }

    /**
     * Captures the launcher position from the close control, falling back to the frame origin.
     *
     * @returns {void}
     */
    private captureLaunchrPos(): void {
        const anchor = this.getClseAnchorPos();

        this.state.launcherX = `${anchor.left}px`;
        this.state.launcherY = `${anchor.top}px`;
    }

    /**
     * Resolves the screen position that should be used for the closed launcher.
     *
     * The close button's top-left corner is preferred so the icon appears where the user
     * last interacted. If that cannot be measured, the frame's top-left corner is used,
     * followed by the previously stored launcher position.
     *
     * @returns {{ left: number; top: number }} The clamped launcher anchor position.
     */
    private getClseAnchorPos(): { left: number; top: number } {
        const closeButtonRect = this.closeButtonEl?.getBoundingClientRect();

        if (closeButtonRect && closeButtonRect.width > 0 && closeButtonRect.height > 0) {
            return clampLauncherPosition(this.launcherEl, WindowMaker.launcherSize, closeButtonRect.left, closeButtonRect.top);
        }

        const frameRect = this.frameEl?.getBoundingClientRect();

        if (frameRect && frameRect.width > 0 && frameRect.height > 0) {
            return clampLauncherPosition(this.launcherEl, WindowMaker.launcherSize, frameRect.left, frameRect.top);
        }

        return clampLauncherPosition(this.launcherEl, WindowMaker.launcherSize, 
            parsePx(this.state.launcherX, 10),
            parsePx(this.state.launcherY, 10)
        );
    }

    /**
     * Wires the header control buttons and header double-click behaviour.
     *
     * @returns {void}
     */
    private wireControls(): void {
        if (!this.headerEl) return;

        const onClose = (event: MouseEvent): void => {
            event.stopPropagation();
            this.close();
        };

        const onMinimise = (event: MouseEvent): void => {
            event.stopPropagation();

            if (this.state.mini) {
                this.restore();
                return;
            }

            this.minimise();
        };

        const onFloat = (event: MouseEvent): void => {
            event.stopPropagation();
            this.toggleFloating();
        };

        const onHeaderDoubleClick = (event: MouseEvent): void => {
            const target = event.target;
            if (target instanceof HTMLElement && target.closest("button")) return;

            event.stopPropagation();
            this.toggleMaximised();
        };

        this.closeButtonEl?.addEventListener("click", onClose);
        this.minimiseButtonEl?.addEventListener("click", onMinimise);
        this.floatButtonEl?.addEventListener("click", onFloat);
        this.headerEl.addEventListener("dblclick", onHeaderDoubleClick);

        this.cleanupFns.push(() => {
            this.closeButtonEl?.removeEventListener("click", onClose);
            this.minimiseButtonEl?.removeEventListener("click", onMinimise);
            this.floatButtonEl?.removeEventListener("click", onFloat);
            this.headerEl?.removeEventListener("dblclick", onHeaderDoubleClick);
        });
    }

    /**
     * Enables dragging for the frame while it is floating and not maximised.
     *
     * @returns {void}
     */
    private wireFrameDrag(): void {
        const header = this.headerEl;
        const frame = this.frameEl;
        if (!header || !frame) return;

        this.cleanupFns.push(
            wireFrameDragInteraction(
                header,
                frame,
                () => this.state.float && !this.state.maxi,
                () => this.bring2Front(),
                (next) => {
                    this.state.x = `${next.left}px`;
                    this.state.y = `${next.top}px`;
                    this.applyFloatGeo();
                    this.syncLnchr2Fr();
                },
                () => {
                    this.persistState();
                    this.qLaytChng();
                }
            )
        );
    }

    /**
     * Wires launcher open and drag behaviour.
     *
     * @returns {void}
     */
    private wireLauncher(): void {
        const launcher = this.launcherEl;
        if (!launcher) return;

        prepareLauncher(
            launcher,
            WindowMaker.launcherSize,
            this.options.closedLnchrDis ?? "inline-block"
        );
        applyLauncherPosition(
            launcher,
            this.state.launcherX,
            this.state.launcherY
        );

        const cleanup = wireLauncherInteractions(
            launcher,
            WindowMaker.launcherSize,
            () => this.open(),
            (next) => {
                this.state.launcherX = `${next.left}px`;
                this.state.launcherY = `${next.top}px`;
                applyLauncherPosition(
                    launcher,
                    this.state.launcherX,
                    this.state.launcherY
                );
                this.persistState();
            }
        );

        this.cleanupFns.push(cleanup);
    }

    /**
     * Wires focus behaviour for floating frames.
     *
     * @returns {void}
     */
    private wireFrameFocus(): void {
        const frame = this.frameEl;
        if (!frame) return;

        this.cleanupFns.push(
            wireFrameFocusInteraction(
                frame,
                () => this.state.float,
                () => this.bring2Front()
            )
        );
    }

    /**
     * Wires viewport resize handling for floating frames.
     *
     * @returns {void}
     */
    private wireViewportRzs(): void {
        const frame = this.frameEl;
        if (!frame) return;

        this.cleanupFns.push(
            wireViewportResize(
                frame,
                () => this.state.float && !this.state.maxi,
                () => ({ x: this.state.x, y: this.state.y }),
                (next) => {
                    this.state.x = `${next.left}px`;
                    this.state.y = `${next.top}px`;
                    this.persistState();
                    this.applyFloatGeo();
                    this.qLaytChng();
                }
            )
        );
    }

    /**
     * Observes floating frame size changes for persistence.
     *
     * @returns {void}
     */
    private observeFloatRzs(): void {
        const frame = this.frameEl;
        if (!frame) return;

        this.resizeObserver = observeFrameResize(
            frame,
            () => this.state.float && !this.state.maxi,
            (size) => {
                this.state.width = `${size.width}px`;
                this.state.height = `${size.height}px`;
                this.persistState();
                this.qLaytChng();
            }
        );
    }

    /**
     * Raises the floating frame above other managed windows by incrementing the shared z-index counter.
     *
     * @returns {void}
     */
    private bring2Front(): void {
        if (!this.frameEl) return;
        if (!this.state.float) return;

        WindowMaker.zIndexCounter += 1;
        this.frameEl.style.zIndex = String(WindowMaker.zIndexCounter);
        this.frameEl.style.setProperty("--window-z-index", String(WindowMaker.zIndexCounter));
    }

    /**
     * Applies the current state to the DOM by updating classes, data attributes,
     * visibility, geometry, launcher state, DOM host placement, and layout notifications.
     *
     * @returns {void}
     */
    private applyState(): void {
        if (!this.frameEl) return;

        if (this.state.maxi) {
            this.state.float = true;
        }

        this.frameEl.classList.add("window-frame");
        this.frameEl.classList.toggle("floating", this.state.float);
        this.frameEl.classList.toggle("maximised", this.state.maxi);
        this.frameEl.classList.toggle("minimised", this.state.mini);
        this.frameEl.classList.toggle("closed", this.state.closed);

        this.frameEl.dataset.windowFloating = String(this.state.float);
        this.frameEl.dataset.windowMaximised = String(this.state.maxi);
        this.frameEl.dataset.windowMinimised = String(this.state.mini);
        this.frameEl.dataset.windowClosed = String(this.state.closed);

        const launcher = this.launcherEl;

        if (this.state.closed && launcher) {
            showLauncher(
                launcher,
                this.state.launcherX,
                this.state.launcherY
            );
        }

        if (this.state.closed) {
            this.frameEl.style.display = "none";
            this.qLaytChng();
            return;
        }

        if (launcher) hideLauncher(launcher);
        this.frameEl.style.display = this.frameStyle?.display ?? "";
        if (this.frameEl) applyMountedFrameLayout(this.frameEl);
        if (this.frameEl && this.bodyEl && this.contentRootEl && this.framePadding) {
            applyMountedContentLayout(
                this.frameEl,
                this.bodyEl,
                this.contentRootEl,
                this.framePadding
            );
        }

        if (this.state.float) {
            this.moveFr2FloatHost();
            this.applyFloatGeo();
            this.bring2Front();
        } else {
            this.restoreFrame();
            this.clearFloatGeo();
        }

        this.applyBodVis();
        this.qLaytChng();
    }

    /**
     * Applies floating or maximised positioning styles to the frame.
     *
     * @returns {void}
     */
    private applyFloatGeo(): void {
        if (!this.frameEl) return;
        if (!this.state.float) return;

        if (this.state.maxi) {
            this.frameEl.style.position = "fixed";
            this.frameEl.style.left = "0px";
            this.frameEl.style.top = "0px";
            this.frameEl.style.width = "100vw";
            this.frameEl.style.height = "100vh";
            this.frameEl.style.maxWidth = "100vw";
            this.frameEl.style.maxHeight = "100vh";
            (this.frameEl.style as CSSStyleDeclaration & { resize?: string }).resize = "none";
            this.frameEl.style.setProperty("--window-left", "0px");
            this.frameEl.style.setProperty("--window-top", "0px");
            this.frameEl.style.setProperty("--window-width", "100vw");
            this.frameEl.style.setProperty("--window-height", "100vh");
            return;
        }

        this.frameEl.style.position = "fixed";
        this.frameEl.style.left = this.state.x;
        this.frameEl.style.top = this.state.y;
        this.frameEl.style.width = this.state.width || "50%";
        this.frameEl.style.height = this.state.height || "";
        this.frameEl.style.maxWidth = "100vw";
        this.frameEl.style.maxHeight = "100vh";
        (this.frameEl.style as CSSStyleDeclaration & { resize?: string }).resize = "both";

        this.frameEl.style.setProperty("--window-left", this.state.x);
        this.frameEl.style.setProperty("--window-top", this.state.y);
        this.frameEl.style.setProperty("--window-width", this.state.width || "50%");
        this.frameEl.style.setProperty("--window-height", this.state.height || "auto");
    }

    /**
     * Restores the frame's original non-floating geometry styles.
     *
     * @returns {void}
     */
    private clearFloatGeo(): void {
        if (!this.frameEl || !this.frameStyle) return;

        this.frameEl.style.position = this.frameStyle.position;
        this.frameEl.style.left = this.frameStyle.left;
        this.frameEl.style.top = this.frameStyle.top;
        this.frameEl.style.width = this.frameStyle.width;
        this.frameEl.style.height = this.frameStyle.height;
        this.frameEl.style.maxWidth = this.frameStyle.maxWidth;
        this.frameEl.style.maxHeight = this.frameStyle.maxHeight;
        (this.frameEl.style as CSSStyleDeclaration & { resize?: string }).resize =
            this.frameStyle.resize;
        this.frameEl.style.zIndex = this.frameStyle.zIndex;
    }

    /**
     * Updates body visibility and control visibility based on the minimised state.
     *
     * @returns {void}
     */
    private applyBodVis(): void {
        if (!this.bodyEl) return;

        const minimised = this.state.mini;

        if (minimised && this.frameEl && this.headerEl) {
            applyMinimisedFrameLayout(this.frameEl, this.headerEl);
        }
        if (minimised) applyMinimisedBodyLayout(this.bodyEl);

        if (minimised && this.floatButtonEl) {
            this.floatButtonEl.hidden = true;
        }

        if (minimised) return;

        if (this.frameEl) clearMinimisedFrameLayout(this.frameEl);
        if (this.bodyEl) clearMinimisedBodyLayout(this.bodyEl);

        if (this.floatButtonEl) {
            this.floatButtonEl.hidden = false;
        }
    }

    /**
     * Updates the launcher position to match the frame's current position while floating.
     *
     * @returns {void}
     */
    private syncLnchr2Fr(): void {
        if (!this.frameEl || !this.launcherEl) return;
        if (!this.state.float) return;

        const rect = this.frameEl.getBoundingClientRect();

        this.state.launcherX = `${rect.left}px`;
        this.state.launcherY = `${rect.top}px`;

        applyLauncherPosition(
            this.launcherEl,
            this.state.launcherX,
            this.state.launcherY
        );
        this.persistState();
    }

    /**
     * Saves the current frame bounds so they can be restored after leaving maximised mode.
     *
     * @returns {void}
     */
    private saveBndsSnp(): void {
        if (!this.frameEl) return;

        const rect = this.frameEl.getBoundingClientRect();

        this.state.restoreX = `${rect.left}px`;
        this.state.restoreY = `${rect.top}px`;
        this.state.restrWidth = `${rect.width}px`;
        this.state.restrHeight = `${rect.height}px`;
        this.state.restrFloat = this.state.float;
    }

    /**
     * Restores frame bounds and floating state from the saved maximise snapshot.
     *
     * @returns {void}
     */
    private restoreBnds(): void {
        this.state.x = this.state.restoreX || this.state.x;
        this.state.y = this.state.restoreY || this.state.y;
        this.state.width = this.state.restrWidth || this.state.width;
        this.state.height = this.state.restrHeight || this.state.height;
        this.state.float = this.state.restrFloat;
    }

    /**
     * Queues the optional layout change callback so it runs after the browser has
     * had time to apply DOM and layout updates.
     *
     * @returns {void}
     */
    private qLaytChng(): void {
        const callback = this.options.onLayoutChange;
        if (!callback) return;
        if (this.layoutQueued) return;

        this.layoutQueued = true;

        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                this.layoutQueued = false;
                callback();
            });
        });
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

