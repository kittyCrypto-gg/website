import * as winApi from "../window.ts";
import * as helpers from "../helpers.ts";
import { WIN_STATE_ID_PREF, bx, by, ensNbHost, oh, openByKey, px, winTitle } from "./runtime.ts";
import { SessionPosition } from "./SessionPosition.ts";

type WinMx = Readonly<{ mw: number; mh: number; fw: number; fh: number; }>;

export abstract class SessionWindow extends SessionPosition {
    /**
     * runs window cleanup fns.
     *
     * @returns {void}
     */
    protected runW(): void {
        for (const fn of this.wCln) {
            try {
                fn();
            } catch {
                /* ignore */
            }
        }

        this.wCln = [];
    }


    /**
     * picks the element the window api should mount into.
     *
     * @returns {HTMLElement}
     */
    protected host(): HTMLElement {
        return this.oEl ?? ensNbHost();
    }


    /**
     * builds the window api options for this session.
     *
     * @returns {winApi.WindowApiOptions}
     */
    protected mkWinOpts(): winApi.WindowApiOptions {
        const host = this.host();

        return {
            id: `${WIN_STATE_ID_PREF}${this.id}`,
            title: winTitle(this.id),
            launcher: this.lnEl,
            closedLnchrDis: "none",
            showCloseBttn: true,
            showMiniBttn: false,
            showFloatBttn: false,
            mountTarget: host,
            floatMntTrgt: host,
            initClosed: false,
            initFloat: true
        };
    }


    /**
     * mounts the window wrapper when this modal is windowed.
     *
     * @returns {void}
     */
    protected ensWin(): void {
        if (this.wOn) return;
        if (!this.fEl || !this.lnEl) return;

        this.wOn = true;

        try {
            this.wh = winApi.mountWindow(this.fEl, this.mkWinOpts());
            this.qSty();
        } catch (err: unknown) {
            console.warn("Modal window mounting failed:", this.id, err);
            this.rmSty();
            return;
        }

        if (!openByKey.has(this.key)) return;
        if (!this.fEl.isConnected) return;

        this.bndCls();
    }


    /**
     * queues a style sync on a couple of frames.
     * a bit belt-and-braces but helps after layout settles.
     *
     * @returns {void}
     */
    protected qSty(): void {
        if (!this.win) return;
        if (!this.mEl.isConnected) return;

        if (this.raf !== null) {
            globalThis.cancelAnimationFrame(this.raf);
        }

        this.raf = globalThis.requestAnimationFrame(() => {
            this.raf = globalThis.requestAnimationFrame(() => {
                this.raf = null;
                this.syncSty();
            });
        });
    }


    /**
     * updates the window sizing style tag.
     *
     * @returns {void}
     */
    protected syncSty(): void {
        if (!this.win) return;
        if (!this.mEl.isConnected) return;

        const sz = this.calcMx();
        const ms = `#${helpers.escapeCssIdentifier(this.id)}`;
        const fs = this.fEl ? `#${helpers.escapeCssIdentifier(this.fEl.id)}` : "";
        const bs = fs ? `${fs} .window-body` : "";
        const rs = fs ? `${fs} [data-window-content-root='true']` : "";

        let css = `${ms} {
  border-radius: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  min-height: 0 !important;
  max-height: 100% !important;
}`;

        if (fs) {
            css += `
${bs} {
  min-height: 0 !important;
}

${rs} {
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
}`;
        }

        if (sz && fs) {
            css = `${ms} {
  border-radius: 0 !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  min-height: 0 !important;
  max-width: ${sz.mw}px !important;
  max-height: 100% !important;
}

${fs} {
  max-width: ${sz.fw}px !important;
  max-height: ${sz.fh}px !important;
}

${bs} {
  min-height: 0 !important;
}

${rs} {
  min-height: 0 !important;
  height: 100% !important;
  max-height: 100% !important;
}`;
        }

        if (!this.sty) {
            this.sty = document.createElement("style");
            this.sty.setAttribute("data-modal-window-style-for", this.id);
            document.head.appendChild(this.sty);
        }

        this.sty.textContent = css;
    }


    /**
     * works out modal and frame max sizes from the live dom.
     *
     * @returns {WinMx | null}
     */
    protected calcMx(): WinMx | null {
        if (!this.mEl.isConnected) return null;

        const mcs = globalThis.getComputedStyle(this.mEl);

        const mw = Math.ceil(
            this.mEl.scrollWidth +
            px(mcs.borderLeftWidth) +
            px(mcs.borderRightWidth)
        );

        const mh = Math.ceil(
            this.mEl.scrollHeight +
            px(mcs.borderTopWidth) +
            px(mcs.borderBottomWidth)
        );

        if (mw <= 0 || mh <= 0) return null;

        let fw = mw;
        let fh = mh;

        if (this.fEl?.isConnected) {
            const hdr = this.fEl.querySelector(".window-header");
            const bod = this.fEl.querySelector(".window-body");
            const root = this.fEl.querySelector("[data-window-content-root='true']");

            const fcs = globalThis.getComputedStyle(this.fEl);
            const bcs = bod instanceof HTMLElement ? globalThis.getComputedStyle(bod) : null;
            const rcs = root instanceof HTMLElement ? globalThis.getComputedStyle(root) : null;

            fw = Math.ceil(mw + bx(fcs) + bx(bcs) + bx(rcs));
            fh = Math.ceil(mh + by(fcs) + by(bcs) + by(rcs) + oh(hdr));
        }

        return { mw, mh, fw, fh };
    }


    /**
     * removes the temp style tag if it exists.
     *
     * @returns {void}
     */
    protected rmSty(): void {
        this.sty?.remove();
        this.sty = null;
    }


    /**
     * steals the window close button click so it closes this session properly.
     *
     * @returns {void}
     */
    protected bndCls(): void {
        if (!this.fEl) return;

        this.runW();

        const btn = this.fEl.querySelector<HTMLButtonElement>("[data-window-role='close']");
        if (!btn) return;

        const onClick = (ev: MouseEvent): void => {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            this.close();
        };

        btn.addEventListener("click", onClick, true);

        this.wCln.push(() => {
            btn.removeEventListener("click", onClick, true);
        });
    }

}
