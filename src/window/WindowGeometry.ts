import { WindowStructure } from "./WindowStructure.ts";
import { WindowCore } from "./WindowCore.ts";
import { clampLauncherPosition, parsePx } from "./geometry.ts";
import { applyLauncherPosition } from "./launcher.ts";

/** Window feature: WindowGeometry responsibility. */
export class WindowGeometry extends WindowStructure {
    /**
     * Seeds the initial frame and launcher positions from the element's current layout
     * when no stored state exists yet.
     *
     * A configured floating spawn position is preserved and only width and height are
     * taken from the current layout in that case.
     *
     * @returns {void}
     */
    protected seedPos(): void {
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
    protected captureBounds(): void {
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
    protected captureLaunchrPos(): void {
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
    protected getClseAnchorPos(): { left: number; top: number } {
        const closeButtonRect = this.closeButtonEl?.getBoundingClientRect();

        if (closeButtonRect && closeButtonRect.width > 0 && closeButtonRect.height > 0) {
            return clampLauncherPosition(this.launcherEl, WindowCore.launcherSize, closeButtonRect.left, closeButtonRect.top);
        }

        const frameRect = this.frameEl?.getBoundingClientRect();

        if (frameRect && frameRect.width > 0 && frameRect.height > 0) {
            return clampLauncherPosition(this.launcherEl, WindowCore.launcherSize, frameRect.left, frameRect.top);
        }

        return clampLauncherPosition(this.launcherEl, WindowCore.launcherSize, 
            parsePx(this.state.launcherX, 10),
            parsePx(this.state.launcherY, 10)
        );
    }

    /**
     * Raises the floating frame above other managed windows by incrementing the shared z-index counter.
     *
     * @returns {void}
     */
    protected bring2Front(): void {
        if (!this.frameEl) return;
        if (!this.state.float) return;

        WindowCore.zIndexCounter += 1;
        this.frameEl.style.zIndex = String(WindowCore.zIndexCounter);
        this.frameEl.style.setProperty("--window-z-index", String(WindowCore.zIndexCounter));
    }

    /**
     * Applies floating or maximised positioning styles to the frame.
     *
     * @returns {void}
     */
    protected applyFloatGeo(): void {
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
    protected clearFloatGeo(): void {
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
     * Updates the launcher position to match the frame's current position while floating.
     *
     * @returns {void}
     */
    protected syncLnchr2Fr(): void {
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
    protected saveBndsSnp(): void {
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
    protected restoreBnds(): void {
        this.state.x = this.state.restoreX || this.state.x;
        this.state.y = this.state.restoreY || this.state.y;
        this.state.width = this.state.restrWidth || this.state.width;
        this.state.height = this.state.restrHeight || this.state.height;
        this.state.float = this.state.restrFloat;
    }

}
