import type { ContentLayout, FramePadding, FrameStyle, MutableWindowState, WindowApiOptions } from "./types.ts";
import { persistWindowState, readWindowState, resolveWindowId, sanitiseWindowId } from "./state.ts";

/** Window feature: WindowCore responsibility. */
export class WindowCore {

    static zIndexCounter = 1000;
    static readonly launcherSize = 48;

    protected readonly options: WindowApiOptions;
    protected readonly windowId: string;
    protected readonly storageKey: string;

    protected state: MutableWindowState;

    protected frameEl: HTMLElement | null = null;
    protected headerEl: HTMLDivElement | null = null;
    protected bodyEl: HTMLDivElement | null = null;
    protected contentRootEl: HTMLDivElement | null = null;

    protected closeButtonEl: HTMLButtonElement | null = null;
    protected minimiseButtonEl: HTMLButtonElement | null = null;
    protected floatButtonEl: HTMLButtonElement | null = null;
    protected titleEl: HTMLSpanElement | null = null;

    protected launcherEl: HTMLElement | null = null;
    protected ownsLauncher = false;
    protected launcherOriginalParent: HTMLElement | null = null;
    protected launcherOriginalNextSibling: ChildNode | null = null;

    protected ogParent: HTMLElement | null = null;
    protected ogNxtSibling: ChildNode | null = null;
    protected originalContentNodes: ChildNode[] = [];
    protected frameStyle: FrameStyle | null = null;
    protected framePadding: FramePadding | null = null;
    protected contentLayout: ContentLayout | null = null;

    protected dockedPlaceholderEl: Comment | null = null;
    protected isMountedInFloatingHost = false;

    protected resizeObserver: ResizeObserver | null = null;
    protected cleanupFns: Array<() => void> = [];
    protected layoutQueued = false;
    protected hadStoredState = false;


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
     * Persists the current window state.
     *
     * @returns {void}
     */
    protected persistState(): void {
        if (!persistWindowState(this.storageKey, this.state)) return;
        this.hadStoredState = true;
    }

    /**
     * Mounts the frame into the configured docked mount target when it is not already attached.
     *
     * @returns {void}
     */
    protected mntFrame(): void {
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
    protected getFloatMntTrgt(): HTMLElement {
        return this.options.floatMntTrgt ?? document.body;
    }

    /**
     * Moves the frame into the floating mount target while leaving a placeholder behind
     * so it can later return to its exact docked position.
     *
     * @returns {void}
     */
    protected moveFr2FloatHost(): void {
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
    protected restoreFrame(): void {
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
     * Queues the optional layout change callback so it runs after the browser has
     * had time to apply DOM and layout updates.
     *
     * @returns {void}
     */
    protected qLaytChng(): void {
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
