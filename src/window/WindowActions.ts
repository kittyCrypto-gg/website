import { WindowGeometry } from "./WindowGeometry.ts";
import { applyMountedContentLayout, applyMountedFrameLayout, applyMinimisedBodyLayout, applyMinimisedFrameLayout, clearMinimisedBodyLayout, clearMinimisedFrameLayout } from "./layout.ts";
import { hideLauncher, showLauncher } from "./launcher.ts";

/** Window feature: WindowActions responsibility. */
export class WindowActions extends WindowGeometry {
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
     * Applies the current state to the DOM by updating classes, data attributes,
     * visibility, geometry, launcher state, DOM host placement, and layout notifications.
     *
     * @returns {void}
     */
    protected applyState(): void {
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
     * Updates body visibility and control visibility based on the minimised state.
     *
     * @returns {void}
     */
    protected applyBodVis(): void {
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

}
