import { SessionWindow } from "./SessionWindow.ts";
import { ensNbHost, openByKey, syncScrl, zRm, zTop } from "./runtime.ts";

export class ModalSession extends SessionWindow {
    /**
     * mounts the session into the dom.
     * if already open it just comes forward.
     *
     * @returns {void}
     */
    open(): void {
        if (openByKey.has(this.key)) {
            this.bringToFront();
            return;
        }

        const onOverlayClick = (ev: MouseEvent): void => {
            if (ev.target !== this.oEl) return;
            this.close();
        };

        if (this.oEl) document.body.appendChild(this.oEl);
        if (this.oEl && this.out) {
            this.oEl.addEventListener("click", onOverlayClick);
        }
        if (!this.oEl) ensNbHost().appendChild(this.sEl);

        openByKey.set(this.key, {
            key: this.key,
            id: this.id,
            mode: this.mode,
            readerModeCompatible: this.rmOk,
            closeOnEscape: this.esc,
            close: () => this.close(),
            overlayEl: this.oEl,
            stackEl: this.sEl
        });

        if (this.win) {
            this.ensWin();
        }

        zTop(this.key);
        syncScrl();
        this.mnt();
        this.bindPos();
        this.qSty();
        this.qPos();
    }


    /**
     * bumps this session to the top.
     *
     * @returns {void}
     */
    bringToFront(): void {
        zTop(this.key);
    }


    /**
     * closes the session and clears its bits up.
     *
     * @returns {void}
     */
    close(): void {
        const rec = openByKey.get(this.key);
        if (!rec) return;

        this.runM();
        this.runW();
        this.runPos();

        if (this.pRaf !== null) {
            globalThis.cancelAnimationFrame(this.pRaf);
            this.pRaf = null;
        }

        if (this.raf !== null) {
            globalThis.cancelAnimationFrame(this.raf);
            this.raf = null;
        }

        this.wh?.dispose();
        this.wh = null;

        this.rmSty();

        this.oEl?.remove();
        if (!this.oEl) this.sEl.remove();

        openByKey.delete(this.key);
        zRm(this.key);
        syncScrl();

        this.fac._unregisterSession(this.id);
    }

}
