type InitialFloatingPosition = Readonly<{
    x: string;
    y: string;
}>;

type WindowApiOptions = Readonly<{
    id?: string;
    title?: string;
    launcher?: HTMLElement | null;
    mountTarget?: HTMLElement | null;
    floatingMountTarget?: HTMLElement | null;
    insertAtStart?: boolean;
    onLayoutChange?: (() => void) | null;
    closedLauncherDisplay?: string;
    initialFloating?: boolean;
    initialFloatingPosition?: InitialFloatingPosition;
    initialClosed?: boolean;
    initialMinimised?: boolean;
    showCloseButton?: boolean;
    showMinimiseButton?: boolean;
    showFloatButton?: boolean;
}>;

type MutableWindowState = {
    floating: boolean;
    minimised: boolean;
    closed: boolean;
    maximised: boolean;
    x: string;
    y: string;
    width: string;
    height: string;
    launcherX: string;
    launcherY: string;
    restoreX: string;
    restoreY: string;
    restoreWidth: string;
    restoreHeight: string;
    restoreFloating: boolean;
};

type WindowButtonRole = "close" | "minimise" | "float";

type FrameStyleSnapshot = Readonly<{
    display: string;
    position: string;
    left: string;
    top: string;
    width: string;
    height: string;
    maxWidth: string;
    maxHeight: string;
    resize: string;
    zIndex: string;
    paddingTop: string;
    paddingRight: string;
    paddingBottom: string;
    paddingLeft: string;
}>;

type FramePaddingSnapshot = Readonly<{
    top: string;
    right: string;
    bottom: string;
    left: string;
}>;

/**
 * Manages a DOM element as a draggable desktop-style window with persisted state,
 * launcher integration, floating and maximised modes, nested-window support,
 * and cleanup support.
 */
export class WindowApi {
    private static zIndexCounter = 1000;

    private readonly options: WindowApiOptions;
    private readonly windowId: string;
    private readonly storageKey: string;

    private state: MutableWindowState;

    private frameEl: HTMLElement | null = null;
    private headerEl: HTMLDivElement | null = null;
    private bodyEl: HTMLDivElement | null = null;

    private closeButtonEl: HTMLButtonElement | null = null;
    private minimiseButtonEl: HTMLButtonElement | null = null;
    private floatButtonEl: HTMLButtonElement | null = null;
    private titleEl: HTMLSpanElement | null = null;

    private launcherEl: HTMLElement | null = null;
    private ownsLauncher = false;
    private launcherOriginalParent: HTMLElement | null = null;
    private launcherOriginalNextSibling: ChildNode | null = null;

    private originalParent: HTMLElement | null = null;
    private originalNextSibling: ChildNode | null = null;
    private originalContentNodes: ChildNode[] = [];
    private frameStyleSnapshot: FrameStyleSnapshot | null = null;
    private framePaddingSnapshot: FramePaddingSnapshot | null = null;

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
        this.windowId = this.resolveWindowId(options.id);
        this.storageKey = `window-api:${this.windowId}:state`;
        this.state = this.readState();
    }

    /**
     * Turns the supplied element into a managed window by building its header,
     * wiring controls and events, and applying the current state.
     *
     * Calling this more than once on the same instance is a no-op.
     *
     * @param {HTMLElement} element The DOM element to manage as a window frame.
     * @returns {this} The current instance for chaining.
     * @throws {Error} Thrown when the element is already mounted by another WindowApi instance.
     */
    public makeWindow(element: HTMLElement): this {
        if (this.frameEl) return this;

        if (element.dataset.windowApiMounted === "true") {
            throw new Error(`Element is already mounted as a window: ${element.id || this.windowId}`);
        }

        this.frameEl = element;
        this.originalParent = element.parentElement;
        this.originalNextSibling = element.nextSibling;
        this.frameStyleSnapshot = this.captureFrameInlineStyles(element);
        this.framePaddingSnapshot = this.captureFramePaddingStyles(element);

        this.ensureLauncher();
        this.extractLauncherFromFrameIfNeeded();
        this.mountFrameIfNeeded();
        this.buildWindowStructure();
        this.seedInitialPositionsFromCurrentLayout();
        this.wireControls();
        this.wireFrameDragging();
        this.wireLauncher();
        this.wireFrameFocus();
        this.wireViewportResize();
        this.observeFloatingResize();

        element.dataset.windowApiMounted = "true";
        element.dataset.windowId = this.windowId;

        this.applyState();
        this.queueLayoutChange();

        return this;
    }

    /**
     * Opens the window and ensures it is not minimised.
     *
     * @returns {void}
     */
    public open(): void {
        this.state.closed = false;
        this.state.minimised = false;
        this.persistState();
        this.applyState();
    }

    /**
     * Closes the window and clears any minimised state.
     *
     * @returns {void}
     */
    public close(): void {
        this.state.closed = true;
        this.state.minimised = false;
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
        if (this.state.minimised) return;

        if (this.state.maximised) {
            this.restoreBoundsFromSnapshot();
            this.state.maximised = false;
        }

        if (this.state.floating) {
            this.state.floating = false;
        }

        this.state.minimised = true;
        this.persistState();
        this.applyState();
    }

    /**
     * Restores a minimised window back to its visible state.
     *
     * @returns {void}
     */
    public restore(): void {
        if (!this.state.minimised) return;

        this.state.minimised = false;
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
        if (this.state.minimised) return;

        if (this.state.floating) {
            if (this.state.maximised) {
                this.restoreBoundsFromSnapshot();
                this.state.maximised = false;
            }

            this.state.floating = false;
            this.persistState();
            this.applyState();
            return;
        }

        if (!this.hadStoredState) {
            this.captureCurrentBounds();
        }

        this.state.floating = true;
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
        if (this.state.minimised) return;

        if (this.state.floating && this.state.maximised) {
            this.restoreBoundsFromSnapshot();
            this.state.maximised = false;
            this.persistState();
            this.applyState();
            return;
        }

        this.saveBoundsSnapshot();
        this.state.floating = true;
        this.state.maximised = true;
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
        return this.state.minimised;
    }

    /**
     * Reports whether the window is currently floating.
     *
     * @returns {boolean} True when the window is floating.
     */
    public isFloating(): boolean {
        return this.state.floating;
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

        this.restoreFrameToDockedHost();

        if (this.frameEl && this.bodyEl) {
            while (this.bodyEl.firstChild) {
                this.frameEl.appendChild(this.bodyEl.firstChild);
            }
        }

        this.headerEl?.remove();
        this.bodyEl?.remove();
        this.dockedPlaceholderEl?.remove();

        if (this.frameEl) {
            this.frameEl.removeAttribute("data-window-api-mounted");
            this.frameEl.removeAttribute("data-window-id");
            this.frameEl.removeAttribute("data-window-floating");
            this.frameEl.removeAttribute("data-window-maximised");
            this.frameEl.removeAttribute("data-window-minimised");
            this.frameEl.removeAttribute("data-window-closed");

            this.frameEl.classList.remove("window-frame", "floating", "maximised", "minimised", "closed");

            this.restoreFrameInlineStyles();

            if (this.bodyEl) {
                this.bodyEl.style.paddingTop = "";
                this.bodyEl.style.paddingRight = "";
                this.bodyEl.style.paddingBottom = "";
                this.bodyEl.style.paddingLeft = "";
            }

            this.headerEl?.style.removeProperty("margin-top");
            this.headerEl?.style.removeProperty("margin-left");
            this.headerEl?.style.removeProperty("margin-right");
        }

        if (this.ownsLauncher) {
            this.launcherEl?.remove();
        } else if (this.launcherEl) {
            if (this.launcherOriginalParent) {
                if (
                    this.launcherOriginalNextSibling &&
                    this.launcherOriginalNextSibling.parentNode === this.launcherOriginalParent
                ) {
                    this.launcherOriginalParent.insertBefore(this.launcherEl, this.launcherOriginalNextSibling);
                } else {
                    this.launcherOriginalParent.appendChild(this.launcherEl);
                }
            }

            this.launcherEl.classList.remove("window-launcher", "is-dragging");
            this.launcherEl.removeAttribute("data-window-launcher-visible");
            this.launcherEl.style.removeProperty("--window-launcher-left");
            this.launcherEl.style.removeProperty("--window-launcher-top");
            this.launcherEl.style.removeProperty("--window-launcher-display");
            this.launcherEl.style.left = "";
            this.launcherEl.style.top = "";
        }

        this.frameEl = null;
        this.headerEl = null;
        this.bodyEl = null;
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
     * Checks whether a value is a plain object-like record and not null or an array.
     *
     * @param {unknown} value The value to inspect.
     * @returns {value is Record<string, unknown>} True when the value is an object record.
     */
    private static isRecord(value: unknown): value is Record<string, unknown> {
        return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    /**
     * Generates a unique identifier for a window instance.
     *
     * Uses crypto.randomUUID when available, otherwise falls back to a timestamp
     * and random suffix.
     *
     * @returns {string} A generated unique identifier.
     */
    private static nextId(): string {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
            return crypto.randomUUID();
        }

        return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }

    /**
     * Resolves a stable window ID from an optional input string.
     *
     * The ID is trimmed, lowercased, and sanitised to contain only letters,
     * digits, underscores, and hyphens. If the result is empty, a generated ID is used.
     *
     * @param {string | undefined} id The requested window ID.
     * @returns {string} The resolved and sanitised window ID.
     */
    private resolveWindowId(id: string | undefined): string {
        if (!id || id.trim().length === 0) {
            return `window-${WindowApi.nextId()}`;
        }

        const sanitised = id
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, "-")
            .replace(/^-+|-+$/g, "");

        return sanitised.length > 0 ? sanitised : `window-${WindowApi.nextId()}`;
    }

    /**
     * Resolves whether the initial default state should be floating when no persisted state exists.
     *
     * Passing an explicit floating spawn position makes the initial default floating unless
     * initialFloating was explicitly provided.
     *
     * @returns {boolean} True when the default state should start floating.
     */
    private resolveFloating(): boolean {
        if (typeof this.options.initialFloating === "boolean") {
            return this.options.initialFloating;
        }

        return this.options.initialFloatingPosition !== undefined;
    }

    /**
     * Resolves the initial x position used when no persisted state exists.
     *
     * @returns {string} The default x position.
     */
    private resolveInitialX(): string {
        return this.options.initialFloatingPosition?.x ?? "10px";
    }

    /**
     * Resolves the initial y position used when no persisted state exists.
     *
     * @returns {string} The default y position.
     */
    private resolveInitialY(): string {
        return this.options.initialFloatingPosition?.y ?? "10px";
    }

    /**
     * Creates the default window state used when no persisted state is available.
     *
     * @returns {MutableWindowState} A fresh default state object.
     */
    private createDefaultState(): MutableWindowState {
        const initialX = this.resolveInitialX();
        const initialY = this.resolveInitialY();

        return {
            floating: this.resolveFloating(),
            minimised: this.options.initialMinimised ?? false,
            closed: this.options.initialClosed ?? false,
            maximised: false,
            x: initialX,
            y: initialY,
            width: "50%",
            height: "",
            launcherX: initialX,
            launcherY: initialY,
            restoreX: "",
            restoreY: "",
            restoreWidth: "",
            restoreHeight: "",
            restoreFloating: false
        };
    }

    /**
     * Reads persisted window state from localStorage and merges it with defaults.
     *
     * If the stored value is missing, invalid, or unreadable, the default state is returned.
     *
     * @returns {MutableWindowState} The restored or default window state.
     */
    private readState(): MutableWindowState {
        const fallback = this.createDefaultState();

        let parsedUnknown: unknown = null;

        try {
            const raw = window.localStorage.getItem(this.storageKey);
            if (!raw) return fallback;
            parsedUnknown = JSON.parse(raw);
            this.hadStoredState = true;
        } catch {
            return fallback;
        }

        if (!WindowApi.isRecord(parsedUnknown)) return fallback;

        const parsed = parsedUnknown;

        return {
            floating: this.readBoolean(parsed.floating, fallback.floating),
            minimised: this.readBoolean(parsed.minimised, fallback.minimised),
            closed: this.readBoolean(parsed.closed, fallback.closed),
            maximised: this.readBoolean(parsed.maximised, fallback.maximised),
            x: this.readString(parsed.x, fallback.x),
            y: this.readString(parsed.y, fallback.y),
            width: this.readString(parsed.width, fallback.width),
            height: this.readString(parsed.height, fallback.height),
            launcherX: this.readString(parsed.launcherX, fallback.launcherX),
            launcherY: this.readString(parsed.launcherY, fallback.launcherY),
            restoreX: this.readString(parsed.restoreX, fallback.restoreX),
            restoreY: this.readString(parsed.restoreY, fallback.restoreY),
            restoreWidth: this.readString(parsed.restoreWidth, fallback.restoreWidth),
            restoreHeight: this.readString(parsed.restoreHeight, fallback.restoreHeight),
            restoreFloating: this.readBoolean(parsed.restoreFloating, fallback.restoreFloating)
        };
    }

    /**
     * Persists the current window state to localStorage.
     *
     * Storage failures are ignored so the window can still function in restricted environments.
     *
     * @returns {void}
     */
    private persistState(): void {
        try {
            window.localStorage.setItem(this.storageKey, JSON.stringify(this.state));
            this.hadStoredState = true;
        } catch {
            // Ignore storage failures.
        }
    }

    /**
     * Normalises an unknown value into a boolean with fallback support.
     *
     * @param {unknown} value The candidate value.
     * @param {boolean} fallback The fallback value when the candidate is not a boolean.
     * @returns {boolean} The boolean value or the fallback.
     */
    private readBoolean(value: unknown, fallback: boolean): boolean {
        return typeof value === "boolean" ? value : fallback;
    }

    /**
     * Normalises an unknown value into a string with fallback support.
     *
     * @param {unknown} value The candidate value.
     * @param {string} fallback The fallback value when the candidate is not a string.
     * @returns {string} The string value or the fallback.
     */
    private readString(value: unknown, fallback: string): string {
        return typeof value === "string" ? value : fallback;
    }

    /**
     * Resolves whether a given header control button should be rendered.
     *
     * All buttons are shown by default and only hidden when explicitly disabled.
     *
     * @param {WindowButtonRole} role The semantic role of the button.
     * @returns {boolean} True when the button should be shown.
     */
    private shouldShowButton(role: WindowButtonRole): boolean {
        if (role === "close") {
            return this.options.showCloseButton ?? true;
        }

        if (role === "minimise") {
            return this.options.showMinimiseButton ?? true;
        }

        return this.options.showFloatButton ?? true;
    }

    /**
     * Captures the current inline frame styles that this class may later overwrite.
     *
     * @param {HTMLElement} element The frame element whose inline styles should be captured.
     * @returns {FrameStyleSnapshot} A snapshot of restorable inline style values.
     */
    private captureFrameInlineStyles(element: HTMLElement): FrameStyleSnapshot {
        return {
            display: element.style.display,
            position: element.style.position,
            left: element.style.left,
            top: element.style.top,
            width: element.style.width,
            height: element.style.height,
            maxWidth: element.style.maxWidth,
            maxHeight: element.style.maxHeight,
            resize: (element.style as CSSStyleDeclaration & { resize?: string }).resize ?? "",
            zIndex: element.style.zIndex,
            paddingTop: element.style.paddingTop,
            paddingRight: element.style.paddingRight,
            paddingBottom: element.style.paddingBottom,
            paddingLeft: element.style.paddingLeft
        };
    }

    /**
     * Captures the frame's computed padding values for later header alignment.
     *
     * @param {HTMLElement} element The frame element whose computed padding should be captured.
     * @returns {FramePaddingSnapshot} A snapshot of computed padding values.
     */
    private captureFramePaddingStyles(element: HTMLElement): FramePaddingSnapshot {
        const computed = window.getComputedStyle(element);

        return {
            top: computed.paddingTop,
            right: computed.paddingRight,
            bottom: computed.paddingBottom,
            left: computed.paddingLeft
        };
    }

    /**
     * Restores the frame's previously captured inline styles and clears custom CSS variables
     * used while the frame is floating.
     *
     * @returns {void}
     */
    private restoreFrameInlineStyles(): void {
        if (!this.frameEl || !this.frameStyleSnapshot) return;

        this.frameEl.style.display = this.frameStyleSnapshot.display;
        this.frameEl.style.position = this.frameStyleSnapshot.position;
        this.frameEl.style.left = this.frameStyleSnapshot.left;
        this.frameEl.style.top = this.frameStyleSnapshot.top;
        this.frameEl.style.width = this.frameStyleSnapshot.width;
        this.frameEl.style.height = this.frameStyleSnapshot.height;
        this.frameEl.style.maxWidth = this.frameStyleSnapshot.maxWidth;
        this.frameEl.style.maxHeight = this.frameStyleSnapshot.maxHeight;
        (this.frameEl.style as CSSStyleDeclaration & { resize?: string }).resize =
            this.frameStyleSnapshot.resize;
        this.frameEl.style.zIndex = this.frameStyleSnapshot.zIndex;
        this.frameEl.style.paddingTop = this.frameStyleSnapshot.paddingTop;
        this.frameEl.style.paddingRight = this.frameStyleSnapshot.paddingRight;
        this.frameEl.style.paddingBottom = this.frameStyleSnapshot.paddingBottom;
        this.frameEl.style.paddingLeft = this.frameStyleSnapshot.paddingLeft;

        this.frameEl.style.removeProperty("--window-left");
        this.frameEl.style.removeProperty("--window-top");
        this.frameEl.style.removeProperty("--window-width");
        this.frameEl.style.removeProperty("--window-height");
        this.frameEl.style.removeProperty("--window-z-index");
    }

    /**
     * Resolves the launcher element for this window.
     *
     * If a launcher was supplied in the options it is reused. Otherwise a default
     * launcher image is created and appended to the document body.
     *
     * @returns {void}
     */
    private ensureLauncher(): void {
        if (this.options.launcher) {
            this.launcherEl = this.options.launcher;
            this.ownsLauncher = false;
            return;
        }

        const launcher = document.createElement("img");
        launcher.src = "/images/binary.svg";
        launcher.alt = `${this.options.title ?? this.windowId} icon`;
        launcher.title = `Double-click to open ${this.options.title ?? this.windowId}`;
        launcher.draggable = false;

        document.body.appendChild(launcher);

        this.launcherEl = launcher;
        this.ownsLauncher = true;
    }

    /**
     * Moves an externally supplied launcher out of the frame if it is nested inside it,
     * while remembering its original DOM position for later restoration.
     *
     * @returns {void}
     */
    private extractLauncherFromFrameIfNeeded(): void {
        if (!this.frameEl || !this.launcherEl) return;
        if (!this.frameEl.contains(this.launcherEl)) return;
        if (this.ownsLauncher) return;

        this.launcherOriginalParent = this.launcherEl.parentElement;
        this.launcherOriginalNextSibling = this.launcherEl.nextSibling;
        document.body.appendChild(this.launcherEl);
    }

    /**
     * Mounts the frame into the configured docked mount target when it is not already attached.
     *
     * @returns {void}
     */
    private mountFrameIfNeeded(): void {
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
    private getFloatingMountTarget(): HTMLElement {
        return this.options.floatingMountTarget ?? document.body;
    }

    /**
     * Moves the frame into the floating mount target while leaving a placeholder behind
     * so it can later return to its exact docked position.
     *
     * @returns {void}
     */
    private moveFrameToFloatingHost(): void {
        if (!this.frameEl) return;

        const floatingHost = this.getFloatingMountTarget();
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
    private restoreFrameToDockedHost(): void {
        if (!this.frameEl) return;

        if (this.dockedPlaceholderEl?.parentNode) {
            this.dockedPlaceholderEl.parentNode.insertBefore(this.frameEl, this.dockedPlaceholderEl);
            this.dockedPlaceholderEl.remove();
            this.dockedPlaceholderEl = null;
            this.isMountedInFloatingHost = false;
            return;
        }

        const dockedParent = this.originalParent ?? this.options.mountTarget ?? null;
        if (!dockedParent) return;

        if (this.frameEl.parentElement === dockedParent) {
            this.isMountedInFloatingHost = false;
            return;
        }

        if (this.originalNextSibling && this.originalNextSibling.parentNode === dockedParent) {
            dockedParent.insertBefore(this.frameEl, this.originalNextSibling);
        } else {
            dockedParent.appendChild(this.frameEl);
        }

        this.isMountedInFloatingHost = false;
    }

    /**
     * Builds the runtime window structure by creating a header, controls, title,
     * and body wrapper, then moving the frame's original child nodes into the body.
     *
     * @returns {void}
     * @throws {Error} Thrown when called without a frame element.
     */
    private buildWindowStructure(): void {
        if (!this.frameEl) {
            throw new Error("Cannot build window without a content element");
        }

        this.originalContentNodes = Array.from(this.frameEl.childNodes);

        const header = document.createElement("div");
        header.id = `${this.windowId}-header`;
        header.className = "window-header";

        const controls = document.createElement("div");
        controls.className = "window-controls";

        const closeButton = this.shouldShowButton("close")
            ? this.createControlButton("close", "🔴", "Close")
            : null;
        const minimiseButton = this.shouldShowButton("minimise")
            ? this.createControlButton("minimise", "🟡", "Minimise / restore")
            : null;
        const floatButton = this.shouldShowButton("float")
            ? this.createControlButton("float", "🟢", "Float / dock")
            : null;

        const title = document.createElement("span");
        title.id = `${this.windowId}-title`;
        title.className = "window-title";
        title.textContent = this.options.title ?? this.frameEl.getAttribute("data-window-title") ?? "Window";

        const body = document.createElement("div");
        body.id = `${this.windowId}-body`;
        body.className = "window-body";

        for (const node of this.originalContentNodes) {
            body.appendChild(node);
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

        this.frameEl.appendChild(header);
        this.frameEl.appendChild(body);

        this.headerEl = header;
        this.bodyEl = body;
        this.closeButtonEl = closeButton;
        this.minimiseButtonEl = minimiseButton;
        this.floatButtonEl = floatButton;
        this.titleEl = title;

        this.applyHeaderEdgeBleed();
    }

    /**
     * Applies negative margins to the header so it visually spans the padded edges of the frame.
     *
     * @returns {void}
     */
    private applyHeaderEdgeBleed(): void {
        if (!this.headerEl || !this.framePaddingSnapshot) return;

        this.headerEl.style.marginTop = `calc(-1 * ${this.framePaddingSnapshot.top})`;
        this.headerEl.style.marginLeft = `calc(-1 * ${this.framePaddingSnapshot.left})`;
        this.headerEl.style.marginRight = `calc(-1 * ${this.framePaddingSnapshot.right})`;
    }

    /**
     * Clears the header's negative margins that were applied for edge bleed.
     *
     * @returns {void}
     */
    private clearHeaderEdgeBleed(): void {
        if (!this.headerEl) return;

        this.headerEl.style.marginTop = "0px";
        this.headerEl.style.marginLeft = "0px";
        this.headerEl.style.marginRight = "0px";
    }

    /**
     * Reconfigures frame and body padding so the frame provides no padding while floating,
     * and the body receives the original content padding instead.
     *
     * @returns {void}
     */
    private applyFloatingPaddingLayout(): void {
        if (!this.frameEl || !this.bodyEl || !this.framePaddingSnapshot) return;

        this.clearHeaderEdgeBleed();

        this.frameEl.style.paddingTop = "0px";
        this.frameEl.style.paddingRight = "0px";
        this.frameEl.style.paddingBottom = "0px";
        this.frameEl.style.paddingLeft = "0px";

        this.bodyEl.style.paddingTop = this.framePaddingSnapshot.top;
        this.bodyEl.style.paddingRight = this.framePaddingSnapshot.right;
        this.bodyEl.style.paddingBottom = this.framePaddingSnapshot.bottom;
        this.bodyEl.style.paddingLeft = this.framePaddingSnapshot.left;
    }

    /**
     * Restores the original docked padding layout where the frame provides the padding
     * and the header uses edge bleed to visually align with the frame edges.
     *
     * @returns {void}
     */
    private restoreDockedPaddingLayout(): void {
        if (!this.frameEl || !this.bodyEl) return;

        this.frameEl.style.paddingTop = "";
        this.frameEl.style.paddingRight = "";
        this.frameEl.style.paddingBottom = "";
        this.frameEl.style.paddingLeft = "";

        this.bodyEl.style.paddingTop = "";
        this.bodyEl.style.paddingRight = "";
        this.bodyEl.style.paddingBottom = "";
        this.bodyEl.style.paddingLeft = "";

        this.applyHeaderEdgeBleed();
    }

    /**
     * Creates a header control button for a specific window action.
     *
     * @param {WindowButtonRole} role The semantic role of the button.
     * @param {string} emoji The button text content.
     * @param {string} label The accessible label and tooltip text.
     * @returns {HTMLButtonElement} The created control button.
     */
    private createControlButton(
        role: WindowButtonRole,
        emoji: string,
        label: string
    ): HTMLButtonElement {
        const button = document.createElement("button");
        const classes = ["btn", role];

        if (role === "minimise") {
            classes.push("toggle-view");
        }

        button.type = "button";
        button.id = `${this.windowId}-btn-${role}`;
        button.className = classes.join(" ");
        button.dataset.windowRole = role;
        button.textContent = emoji;
        button.title = label;
        button.setAttribute("aria-label", label);

        return button;
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
    private seedInitialPositionsFromCurrentLayout(): void {
        if (!this.frameEl) return;
        if (this.hadStoredState) return;

        const rect = this.frameEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const shouldPreserveConfiguredFloatingPosition =
            this.state.floating && this.options.initialFloatingPosition !== undefined;

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
    private captureCurrentBounds(): void {
        if (!this.frameEl) return;

        const rect = this.frameEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        this.state.x = `${rect.left}px`;
        this.state.y = `${rect.top}px`;
        this.state.width = `${rect.width}px`;
        this.state.height = `${rect.height}px`;
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

            if (this.state.minimised) {
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
    private wireFrameDragging(): void {
        if (!this.headerEl || !this.frameEl) return;

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onPointerDown = (event: PointerEvent): void => {
            if (event.button !== 0) return;
            if (!this.frameEl) return;
            if (!this.state.floating) return;
            if (this.state.maximised) return;

            const target = event.target;
            if (target instanceof HTMLElement && target.closest("button")) return;

            const rect = this.frameEl.getBoundingClientRect();

            dragging = true;
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;

            this.headerEl?.classList.add("is-dragging");
            this.bringToFront();
            event.preventDefault();
            event.stopPropagation();
        };

        const onPointerMove = (event: PointerEvent): void => {
            if (!dragging || !this.frameEl) return;

            const unclampedLeft = event.clientX - offsetX;
            const unclampedTop = event.clientY - offsetY;
            const next = this.clampPosition(unclampedLeft, unclampedTop);

            this.state.x = `${next.left}px`;
            this.state.y = `${next.top}px`;

            this.applyFloatingGeometry();
            this.syncLauncherToFrame();
        };

        const onPointerUp = (): void => {
            if (!dragging) return;

            dragging = false;
            this.headerEl?.classList.remove("is-dragging");
            this.persistState();
            this.queueLayoutChange();
        };

        this.headerEl.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);

        this.cleanupFns.push(() => {
            this.headerEl?.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
        });
    }

    /**
     * Wires launcher open and drag behaviour.
     *
     * @returns {void}
     */
    private wireLauncher(): void {
        const launcher = this.launcherEl;
        if (!launcher) return;

        launcher.classList.add("window-launcher");
        launcher.style.setProperty(
            "--window-launcher-display",
            this.options.closedLauncherDisplay ?? "inline-block"
        );

        this.applyLauncherPosition();

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const onDoubleClick = (): void => {
            this.open();
        };

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

            const next = this.clampLauncherPosition(event.clientX - offsetX, event.clientY - offsetY);

            this.state.launcherX = `${next.left}px`;
            this.state.launcherY = `${next.top}px`;

            this.applyLauncherPosition();
            this.persistState();
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

        this.cleanupFns.push(() => {
            launcher.removeEventListener("dblclick", onDoubleClick);
            launcher.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("pointermove", onPointerMove);
            document.removeEventListener("pointerup", onPointerUp);
        });
    }

    /**
     * Wires focus behaviour so a floating frame is brought to the front when interacted with.
     *
     * @returns {void}
     */
    private wireFrameFocus(): void {
        if (!this.frameEl) return;

        const onPointerDown = (): void => {
            if (!this.state.floating) return;
            this.bringToFront();
        };

        this.frameEl.addEventListener("pointerdown", onPointerDown);

        this.cleanupFns.push(() => {
            this.frameEl?.removeEventListener("pointerdown", onPointerDown);
        });
    }

    /**
     * Wires viewport resize handling so floating windows remain within the visible area.
     *
     * @returns {void}
     */
    private wireViewportResize(): void {
        const onResize = (): void => {
            if (!this.frameEl) return;
            if (!this.state.floating) return;
            if (this.state.maximised) return;

            const next = this.clampPosition(
                this.parsePixelValue(this.state.x, 10),
                this.parsePixelValue(this.state.y, 10)
            );

            this.state.x = `${next.left}px`;
            this.state.y = `${next.top}px`;

            this.persistState();
            this.applyFloatingGeometry();
            this.queueLayoutChange();
        };

        window.addEventListener("resize", onResize);

        this.cleanupFns.push(() => {
            window.removeEventListener("resize", onResize);
        });
    }

    /**
     * Observes frame size changes while floating so width and height can be persisted.
     *
     * @returns {void}
     */
    private observeFloatingResize(): void {
        if (typeof ResizeObserver === "undefined" || !this.frameEl) return;

        this.resizeObserver = new ResizeObserver(() => {
            if (!this.frameEl) return;
            if (!this.state.floating) return;
            if (this.state.maximised) return;

            this.state.width = `${this.frameEl.offsetWidth}px`;
            this.state.height = `${this.frameEl.offsetHeight}px`;

            this.persistState();
            this.queueLayoutChange();
        });

        this.resizeObserver.observe(this.frameEl);
    }

    /**
     * Raises the floating frame above other managed windows by incrementing the shared z-index counter.
     *
     * @returns {void}
     */
    private bringToFront(): void {
        if (!this.frameEl) return;
        if (!this.state.floating) return;

        WindowApi.zIndexCounter += 1;
        this.frameEl.style.zIndex = String(WindowApi.zIndexCounter);
        this.frameEl.style.setProperty("--window-z-index", String(WindowApi.zIndexCounter));
    }

    /**
     * Applies the current state to the DOM by updating classes, data attributes,
     * visibility, geometry, launcher state, DOM host placement, and layout notifications.
     *
     * @returns {void}
     */
    private applyState(): void {
        if (!this.frameEl) return;

        if (this.state.maximised) {
            this.state.floating = true;
        }

        this.frameEl.classList.toggle("floating", this.state.floating);
        this.frameEl.classList.toggle("maximised", this.state.maximised);
        this.frameEl.classList.toggle("minimised", this.state.minimised);
        this.frameEl.classList.toggle("closed", this.state.closed);

        this.frameEl.dataset.windowFloating = String(this.state.floating);
        this.frameEl.dataset.windowMaximised = String(this.state.maximised);
        this.frameEl.dataset.windowMinimised = String(this.state.minimised);
        this.frameEl.dataset.windowClosed = String(this.state.closed);

        if (this.state.closed) {
            this.frameEl.style.display = "none";
            this.showLauncher();
            this.queueLayoutChange();
            return;
        }

        this.hideLauncher();
        this.frameEl.style.display = this.frameStyleSnapshot?.display ?? "";

        if (this.state.floating) {
            this.moveFrameToFloatingHost();
            this.frameEl.classList.add("window-frame");
            this.applyFloatingPaddingLayout();
            this.applyFloatingGeometry();
            this.bringToFront();
        } else {
            this.restoreFrameToDockedHost();
            this.frameEl.classList.remove("window-frame");
            this.restoreDockedPaddingLayout();
            this.clearFloatingGeometry();
        }

        this.applyBodyVisibility();
        this.queueLayoutChange();
    }

    /**
     * Applies floating or maximised positioning styles to the frame.
     *
     * @returns {void}
     */
    private applyFloatingGeometry(): void {
        if (!this.frameEl) return;
        if (!this.state.floating) return;

        if (this.state.maximised) {
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
    private clearFloatingGeometry(): void {
        if (!this.frameEl || !this.frameStyleSnapshot) return;

        this.frameEl.style.position = this.frameStyleSnapshot.position;
        this.frameEl.style.left = this.frameStyleSnapshot.left;
        this.frameEl.style.top = this.frameStyleSnapshot.top;
        this.frameEl.style.width = this.frameStyleSnapshot.width;
        this.frameEl.style.height = this.frameStyleSnapshot.height;
        this.frameEl.style.maxWidth = this.frameStyleSnapshot.maxWidth;
        this.frameEl.style.maxHeight = this.frameStyleSnapshot.maxHeight;
        (this.frameEl.style as CSSStyleDeclaration & { resize?: string }).resize =
            this.frameStyleSnapshot.resize;
        this.frameEl.style.zIndex = this.frameStyleSnapshot.zIndex;
    }

    /**
     * Updates body visibility and control visibility based on the minimised state.
     *
     * @returns {void}
     */
    private applyBodyVisibility(): void {
        if (!this.bodyEl) return;

        this.bodyEl.style.display = this.state.minimised ? "none" : "";

        if (this.floatButtonEl) {
            this.floatButtonEl.hidden = this.state.minimised;
        }
    }

    /**
     * Makes the launcher visible and synchronises its position to the frame's current bounds.
     *
     * @returns {void}
     */
    private showLauncher(): void {
        const launcher = this.launcherEl;
        if (!launcher) return;

        if (this.frameEl) {
            const rect = this.frameEl.getBoundingClientRect();
            this.state.launcherX = `${rect.left}px`;
            this.state.launcherY = `${rect.top}px`;
        }

        launcher.classList.add("window-launcher");
        launcher.setAttribute("data-window-launcher-visible", "true");
        this.applyLauncherPosition();
    }

    /**
     * Marks the launcher as hidden.
     *
     * @returns {void}
     */
    private hideLauncher(): void {
        const launcher = this.launcherEl;
        if (!launcher) return;

        launcher.classList.add("window-launcher");
        launcher.setAttribute("data-window-launcher-visible", "false");
    }

    /**
     * Applies the persisted launcher coordinates to the launcher element.
     *
     * @returns {void}
     */
    private applyLauncherPosition(): void {
        const launcher = this.launcherEl;
        if (!launcher) return;

        launcher.style.setProperty("--window-launcher-left", this.state.launcherX);
        launcher.style.setProperty("--window-launcher-top", this.state.launcherY);
        launcher.style.left = this.state.launcherX;
        launcher.style.top = this.state.launcherY;
    }

    /**
     * Updates the launcher position to match the frame's current position while floating.
     *
     * @returns {void}
     */
    private syncLauncherToFrame(): void {
        if (!this.frameEl || !this.launcherEl) return;
        if (!this.state.floating) return;

        const rect = this.frameEl.getBoundingClientRect();

        this.state.launcherX = `${rect.left}px`;
        this.state.launcherY = `${rect.top}px`;

        this.applyLauncherPosition();
        this.persistState();
    }

    /**
     * Saves the current frame bounds so they can be restored after leaving maximised mode.
     *
     * @returns {void}
     */
    private saveBoundsSnapshot(): void {
        if (!this.frameEl) return;

        const rect = this.frameEl.getBoundingClientRect();

        this.state.restoreX = `${rect.left}px`;
        this.state.restoreY = `${rect.top}px`;
        this.state.restoreWidth = `${rect.width}px`;
        this.state.restoreHeight = `${rect.height}px`;
        this.state.restoreFloating = this.state.floating;
    }

    /**
     * Restores frame bounds and floating state from the saved maximise snapshot.
     *
     * @returns {void}
     */
    private restoreBoundsFromSnapshot(): void {
        this.state.x = this.state.restoreX || this.state.x;
        this.state.y = this.state.restoreY || this.state.y;
        this.state.width = this.state.restoreWidth || this.state.width;
        this.state.height = this.state.restoreHeight || this.state.height;
        this.state.floating = this.state.restoreFloating;
    }

    /**
     * Clamps a frame position so the floating window remains within the viewport.
     *
     * @param {number} left The requested left position in pixels.
     * @param {number} top The requested top position in pixels.
     * @returns {{ left: number; top: number }} The clamped position.
     */
    private clampPosition(left: number, top: number): { left: number; top: number } {
        if (!this.frameEl) {
            return { left, top };
        }

        const frameWidth = Math.max(0, Math.min(this.frameEl.offsetWidth, window.innerWidth));
        const frameHeight = Math.max(0, Math.min(this.frameEl.offsetHeight, window.innerHeight));

        const maxLeft = Math.max(0, window.innerWidth - frameWidth);
        const maxTop = Math.max(0, window.innerHeight - frameHeight);

        return {
            left: Math.min(Math.max(0, left), maxLeft),
            top: Math.min(Math.max(0, top), maxTop)
        };
    }

    /**
     * Clamps a launcher position so the launcher remains within the viewport.
     *
     * @param {number} left The requested left position in pixels.
     * @param {number} top The requested top position in pixels.
     * @returns {{ left: number; top: number }} The clamped position.
     */
    private clampLauncherPosition(left: number, top: number): { left: number; top: number } {
        const launcher = this.launcherEl;
        if (!launcher) {
            return { left, top };
        }

        const launcherWidth = Math.max(0, Math.min(launcher.offsetWidth, window.innerWidth));
        const launcherHeight = Math.max(0, Math.min(launcher.offsetHeight, window.innerHeight));

        const maxLeft = Math.max(0, window.innerWidth - launcherWidth);
        const maxTop = Math.max(0, window.innerHeight - launcherHeight);

        return {
            left: Math.min(Math.max(0, left), maxLeft),
            top: Math.min(Math.max(0, top), maxTop)
        };
    }

    /**
     * Parses a CSS pixel-like string into a number.
     *
     * If parsing fails, the provided fallback is returned.
     *
     * @param {string} value The string value to parse.
     * @param {number} fallback The fallback number to use when parsing fails.
     * @returns {number} The parsed numeric value or the fallback.
     */
    private parsePixelValue(value: string, fallback: number): number {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    /**
     * Queues the optional layout change callback so it runs after the browser has
     * had time to apply DOM and layout updates.
     *
     * @returns {void}
     */
    private queueLayoutChange(): void {
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