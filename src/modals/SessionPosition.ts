import { SessionContent } from "./SessionContent.ts";
import type { ModalPlacement } from "./types.ts";
import { bubbleGeometrySignature, buildBubblePath, calculateAnchoredPosition, readBubbleGeometry } from "./bubbleGeometry.ts";

export abstract class SessionPosition extends SessionContent {
    /**
     * Resolves the optional anchor target for a positioned modal.
     *
     * @returns {Element | null}
     */
    protected posTarget(): Element | null {
        if (!this.pos) return null;

        const target = this.pos.target;

        if (typeof target === "string") {
            return document.querySelector(target);
        }

        return target.isConnected
            ? target
            : null;
    }


    /**
     * Cancels listeners and observers used by target-following modals.
     *
     * @returns {void}
     */
    protected runPos(): void {
        for (const fn of this.pCln) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }

        this.pCln = [];
    }


    /**
     * Queues one viewport-position sync.
     *
     * @returns {void}
     */
    protected qPos(): void {
        if (!this.pos) return;
        if (!this.mEl.isConnected) return;
        if (this.pRaf !== null) return;

        this.pRaf = globalThis.requestAnimationFrame(() => {
            this.pRaf = null;
            this.syncPos();
        });
    }


    /**
     * Syncs the SVG shell to the current rendered bubble rectangle.
     *
     * @param {ModalPlacement} placement
     * @param {number} pointerX
     * @param {number} pointerY
     * @returns {void}
     */
    protected syncBubbleShape(
        placement: ModalPlacement,
        pointerX: number,
        pointerY: number
    ): void {
        if (!this.txtBubble) return;
        if (!this.bubbleSvg) return;
        if (!this.bubblePath) return;

        const rect = this.mEl.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));

        this.bubbleSvg.setAttribute(
            "viewBox",
            `0 0 ${width} ${height}`
        );

        this.bubbleSvg.setAttribute(
            "width",
            String(width)
        );

        this.bubbleSvg.setAttribute(
            "height",
            String(height)
        );

        this.bubblePath.setAttribute(
            "d",
            buildBubblePath(
                width,
                height,
                placement,
                pointerX,
                pointerY,
                readBubbleGeometry(this.mEl)
            )
        );
    }


    /**
     * Places an anchored modal on the best available side of its target,
     * clamps the modal to the viewport, then derives the speech-bubble tail
     * position from the target's real viewport coordinates.
     *
     * @returns {void}
     */
    protected syncPos(): void {
        const target = this.posTarget();
        if (!target) return;
        if (!this.mEl.isConnected) return;

        const position = calculateAnchoredPosition(
            target.getBoundingClientRect(),
            this.mEl.getBoundingClientRect(),
            Math.max(0, this.pos?.gap ?? 14)
        );

        this.mEl.dataset.modalPlacement = position.placement;
        this.mEl.style.left = `${Math.round(position.left)}px`;
        this.mEl.style.top = `${Math.round(position.top)}px`;
        this.mEl.style.right = "auto";
        this.mEl.style.bottom = "auto";
        this.mEl.style.setProperty(
            "--modal-text-bubble-pointer-x",
            `${Math.round(position.pointerX)}px`
        );
        this.mEl.style.setProperty(
            "--modal-text-bubble-pointer-y",
            `${Math.round(position.pointerY)}px`
        );

        this.syncBubbleShape(
            position.placement,
            position.pointerX,
            position.pointerY
        );
    }


    /**
     * Produces a compact signature of the CSS-driven bubble geometry.
     *
     * The SVG path itself is generated in JavaScript, so a CSS custom
     * property edit does not naturally invalidate the path. Comparing this
     * signature lets live CSS tuning redraw only when a geometry value
     * actually changes.
     *
     * @returns {string}
     */
    protected bubbleGeometrySig(): string {
        if (!this.txtBubble) return "";

        return bubbleGeometrySignature(
            readBubbleGeometry(this.mEl)
        );
    }


    /**
     * Watches CSS-driven bubble geometry while the bubble is open.
     *
     * This is intentionally low-frequency and only runs for text bubbles.
     * It makes DevTools/theme CSS edits immediately visible without forcing
     * a resize or scroll just to regenerate the SVG path.
     *
     * @returns {void}
     */
    protected bindBubbleGeometry(): void {
        if (!this.txtBubble) return;

        this.bubbleGeometrySignature =
            this.bubbleGeometrySig();

        const timer = globalThis.setInterval(() => {
            if (!this.mEl.isConnected) return;

            const next =
                this.bubbleGeometrySig();

            if (next === this.bubbleGeometrySignature) return;

            this.bubbleGeometrySignature = next;
            this.qPos();
        }, 100);

        this.pCln.push(() => {
            globalThis.clearInterval(timer);
            this.bubbleGeometrySignature = "";
        });
    }


    /**
     * Watches the anchor and viewport so a positioned modal follows its
     * target through scrolling, resizing and layout changes.
     *
     * @returns {void}
     */
    protected bindPos(): void {
        this.runPos();

        const target = this.posTarget();
        if (!target) return;

        this.bindBubbleGeometry();

        const queue = (): void => this.qPos();

        globalThis.addEventListener("resize", queue);
        globalThis.addEventListener("scroll", queue, true);

        this.pCln.push(() => {
            globalThis.removeEventListener("resize", queue);
            globalThis.removeEventListener("scroll", queue, true);
        });

        if (typeof ResizeObserver === "undefined") {
            this.qPos();
            return;
        }

        const observer = new ResizeObserver(queue);

        observer.observe(target);
        observer.observe(this.mEl);

        this.pCln.push(() => observer.disconnect());

        const viewport = window.visualViewport;

        viewport?.addEventListener("resize", queue);
        viewport?.addEventListener("scroll", queue);

        this.pCln.push(() => {
            viewport?.removeEventListener("resize", queue);
            viewport?.removeEventListener("scroll", queue);
        });

        this.qPos();
    }

}
