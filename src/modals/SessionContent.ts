import { SessionBase } from "./SessionBase.ts";
import { openByKey } from "./runtime.ts";
import type { DecCtx } from "./types.ts";

export abstract class SessionContent extends SessionBase {
    /**
     * Renders ordinary modal content without a speech-bubble shell.
     *
     * @param {string} html
     * @returns {void}
     */
    protected renderPlainContent(html: string): void {
        this.mEl.innerHTML = html;
        this.bubbleSvg = null;
        this.bubblePath = null;
    }


    /**
     * Renders text-bubble content over one SVG shape. The SVG path itself
     * contains both the rounded body and its target-facing tail, so fill and
     * stroke are continuous through the join.
     *
     * @param {string} html
     * @returns {void}
     */
    protected renderBubbleContent(html: string): void {
        const svgNs = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(svgNs, "svg");
        const path = document.createElementNS(svgNs, "path");
        const body = document.createElement("div");

        svg.classList.add("modal-text-bubble__shape");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");

        path.classList.add("modal-text-bubble__path");

        body.className = "modal-text-bubble__body";
        body.innerHTML = html;

        svg.appendChild(path);
        this.mEl.replaceChildren(svg, body);

        this.bubbleSvg = svg;
        this.bubblePath = path;
    }


    /**
     * @param {string} html
     * @returns {void}
     */
    protected renderContent(html: string): void {
        if (!this.txtBubble) {
            this.renderPlainContent(html);
            return;
        }

        this.renderBubbleContent(html);
    }


    /**
     * swaps the inner html and remounts decorator hooks.
     *
     * @param {string} html
     * @returns {void}
     */
    setHtml(html: string): void {
        this.renderContent(html);
        this.reMnt();
        this.qSty();
        this.qPos();
    }


    /**
     * re-mount pass after html changes.
     *
     * @returns {void}
     */
    protected reMnt(): void {
        if (!openByKey.has(this.key)) return;
        this.mnt(true);
    }


    /**
     * runs modal cleanup fns.
     *
     * @returns {void}
     */
    protected runM(): void {
        for (const fn of this.mCln) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }

        this.mCln = [];
    }


    /**
     * mount pass for decorators.
     * when clr is true, old mounts get cleaned first.
     *
     * @param {boolean} clr
     * @returns {void}
     */
    protected mnt(clr: boolean = false): void {
        if (clr) this.runM();

        const ctx: DecCtx = {
            id: this.id,
            mode: this.mode,
            readerModeCompatible: this.rmOk,
            windowed: this.win,
            modalEl: this.mEl,
            overlayEl: this.oEl,
            close: () => this.close(),
            setHtml: (html: string) => this.setHtml(html)
        };

        for (const dec of this.decs) {
            if (!dec.mount) continue;

            const cln = dec.mount(ctx);
            if (typeof cln !== "function") continue;

            this.mCln.push(cln);
        }
    }

}
