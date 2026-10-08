import type { WindowHandle } from "../window.ts";
import type { Dec, ModalFactorySessionHost, ModalMode, ModalPosition } from "./types.ts";
import { MOD_CLS, OVR_CLS, RM_BAD_CLS, WIN_FRAME_SFX } from "./runtime.ts";
import type { SessionSpec } from "./sessionTypes.ts";

export abstract class SessionBase {

    protected readonly fac: ModalFactorySessionHost;
    protected readonly key: string;

    protected readonly sessionId: string;
    protected readonly sessionMode: ModalMode;

    protected readonly rmOk: boolean;
    protected readonly win: boolean;

    protected readonly esc: boolean;
    protected readonly out: boolean;

    protected readonly pos: ModalPosition | null;
    protected readonly txtBubble: boolean;

    protected readonly decs: readonly Dec[];

    protected readonly mEl: HTMLDivElement;
    protected readonly fEl: HTMLDivElement | null;
    protected readonly sEl: HTMLDivElement;
    protected readonly oEl: HTMLDivElement | null;

    protected readonly lnEl: HTMLDivElement | null;

    protected wh: WindowHandle | null;
    protected sty: HTMLStyleElement | null;
    protected raf: number | null;
    protected mCln: Array<() => void>;
    protected wCln: Array<() => void>;
    protected pCln: Array<() => void>;
    protected pRaf: number | null;
    protected bubbleSvg: SVGSVGElement | null;
    protected bubblePath: SVGPathElement | null;
    protected bubbleGeometrySignature: string;
    protected wOn: boolean;


    abstract setHtml(html: string): void;
    abstract close(): void;
    protected abstract qPos(): void;
    protected abstract qSty(): void;

    constructor(spec: SessionSpec) {
        this.fac = spec.factory;
        this.sessionId = spec.id;
        this.sessionMode = spec.mode;

        this.rmOk = spec.readerModeCompatible;
        this.win = spec.windowed;

        this.esc = spec.closeOnEscape;
        this.out = spec.closeOnOutsideClick;

        this.pos = spec.position;
        this.txtBubble = spec.asTextBubble;

        this.decs = spec.decorators;

        this.key = this.fac._keyFor(this.sessionId);
        this.wh = null;
        this.sty = null;
        this.raf = null;
        this.mCln = [];
        this.wCln = [];
        this.pCln = [];
        this.pRaf = null;
        this.bubbleSvg = null;
        this.bubblePath = null;
        this.bubbleGeometrySignature = "";
        this.wOn = false;

        this.mEl = document.createElement("div");
        this.mEl.id = this.sessionId;
        this.mEl.className = [MOD_CLS, spec.modalClassName].filter(Boolean).join(" ");

        if (this.sessionMode === "non-blocking" && !this.win) {
            this.mEl.classList.add("non-blocking");
        }

        if (this.pos) {
            this.mEl.classList.add("modal-positioned");
        }

        if (this.txtBubble) {
            this.mEl.classList.add("modal-text-bubble");
        }

        if (this.win) {
            this.fEl = document.createElement("div");
            this.fEl.id = `${this.sessionId}${WIN_FRAME_SFX}`;
            this.fEl.dataset.modalWindowFrame = "true";
            this.fEl.appendChild(this.mEl);
            this.sEl = this.fEl;

            this.lnEl = document.createElement("div");
            this.lnEl.hidden = true;
            this.lnEl.setAttribute("aria-hidden", "true");
        } else {
            this.fEl = null;
            this.sEl = this.mEl;
            this.lnEl = null;
        }

        this.oEl = this.sessionMode === "blocking"
            ? document.createElement("div")
            : null;

        if (this.oEl) {
            this.oEl.id = `modal-overlay-${this.sessionId}`;
            this.oEl.className = [OVR_CLS, spec.overlayClassName].filter(Boolean).join(" ");
            this.oEl.appendChild(this.sEl);
        }

        if (!this.rmOk) {
            this.mEl.classList.add(RM_BAD_CLS);
            this.fEl?.classList.add(RM_BAD_CLS);
            this.oEl?.classList.add(RM_BAD_CLS);
        }

        this.setHtml(spec.html);
    }


    /**
     * modal id again, but on the live session.
     *
     * @returns {string}
     */
    get id(): string {
        return this.sessionId;
    }


    /**
     * session mode getter.
     *
     * @returns {ModalMode}
     */
    get mode(): ModalMode {
        return this.sessionMode;
    }


    /**
     * raw modal element.
     *
     * @returns {HTMLDivElement}
     */
    get modalEl(): HTMLDivElement {
        return this.mEl;
    }


    /**
     * overlay if this one has one.
     *
     * @returns {HTMLDivElement | null}
     */
    get overlayEl(): HTMLDivElement | null {
        return this.oEl;
    }

}
