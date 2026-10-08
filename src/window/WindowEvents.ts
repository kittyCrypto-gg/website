import { WindowActions } from "./WindowActions.ts";
import { WindowCore } from "./WindowCore.ts";
import { prepareLauncher, applyLauncherPosition, wireLauncherInteractions } from "./launcher.ts";
import { observeFrameResize, wireFrameDrag as wireFrameDragInteraction, wireFrameFocus as wireFrameFocusInteraction, wireViewportResize } from "./interactions.ts";

/** Window feature: WindowEvents responsibility. */
export class WindowEvents extends WindowActions {
    /**
     * Wires the header control buttons and header double-click behaviour.
     *
     * @returns {void}
     */
    protected wireControls(): void {
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
    protected wireFrameDrag(): void {
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
    protected wireLauncher(): void {
        const launcher = this.launcherEl;
        if (!launcher) return;

        prepareLauncher(
            launcher,
            WindowCore.launcherSize,
            this.options.closedLnchrDis ?? "inline-block"
        );
        applyLauncherPosition(
            launcher,
            this.state.launcherX,
            this.state.launcherY
        );

        const cleanup = wireLauncherInteractions(
            launcher,
            WindowCore.launcherSize,
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
    protected wireFrameFocus(): void {
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
    protected wireViewportRzs(): void {
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
    protected observeFloatRzs(): void {
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

}
