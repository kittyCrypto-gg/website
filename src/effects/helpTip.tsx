import type { ReactElement } from "react";
import * as modals from "../modals.ts";
import { render2Mkup } from "../reactHelpers.tsx";

type ModalDecorator = ReturnType<typeof modals.closeOnClick>;
type ModalCtx = Parameters<NonNullable<ModalDecorator["mount"]>>[0];

const EFFECTS_TIP_MODAL_ID = "kc-effects-help-modal";
const EFFECTS_TIP_HIDE_KEY = "effectsHelpModalHide";
let effectsTipShown = false;
let effectsTipObs: IntersectionObserver | null = null;

/**
 * Small non-blocking helper matching the reader's existing "Did you know?"
 * tip behaviour.
 *
 * @returns {ReactElement}
 */
function EffectsTipModal(): ReactElement {
    return (
        <>
            <div className="modal-header">
                <h3>Did you know?</h3>
            </div>

            <div className="modal-content">
                <p>
                    Effects too distracting? Disable or soften them here.
                </p>

                <label className="kc-checkbox-row">
                    <input id="kc-effects-help-hide" type="checkbox" />
                    <span>Do not show this tip again</span>
                </label>

                <div className="kc-modal-actions">
                    <button
                        id="kc-effects-help-close"
                        type="button"
                        style={{ display: "block", margin: "0 auto" }}
                    >
                        Close
                    </button>
                </div>

                <p className="modal-note">You can close this window with <kbd>Esc</kbd>.</p>
            </div>
        </>
    );
}

/**
 * @returns {boolean}
 */
function showEffectsTip(): boolean {
    if (effectsTipShown) return false;
    if (localStorage.getItem(EFFECTS_TIP_HIDE_KEY) === "true") return false;
    return true;
}

const EFFECTS_TIP_MODAL_HTML = (): string => render2Mkup(<EffectsTipModal />);

const persistEffectsTipHide: ModalDecorator = {
    mount: (ctx: ModalCtx) => {
        const box = ctx.modalEl.querySelector("#kc-effects-help-hide");
        if (!(box instanceof HTMLInputElement)) return;

        box.checked = localStorage.getItem(EFFECTS_TIP_HIDE_KEY) === "true";

        const onChange = (): void => {
            localStorage.setItem(
                EFFECTS_TIP_HIDE_KEY,
                box.checked ? "true" : "false"
            );

            if (box.checked) ctx.close();
        };

        box.addEventListener("change", onChange);
        return () => box.removeEventListener("change", onChange);
    }
};

const effectsTipModal = modals.factory.create({
    id: EFFECTS_TIP_MODAL_ID,
    mode: "non-blocking",
    readerModeCompatible: false,
    modalClassName: "did-you-know-tip",
    position: {
        target: "#effects-toggle"
    },
    asTextBubble: true,
    content: EFFECTS_TIP_MODAL_HTML,
    closeOnOutsideClick: false,
    decorators: [
        modals.closeOnClick("#kc-effects-help-close"),
        persistEffectsTipHide
    ]
});

/**
 * @returns {void}
 */
function openEffectsTip(): void {
    if (!showEffectsTip()) return;
    if (effectsTipModal.isOpen()) return;

    effectsTipModal.open();
    effectsTipShown = true;
}

/**
 * Reuses the reader tip's visibility-trigger pattern for the fixed effects
 * button.
 *
 * @param {HTMLButtonElement} button
 * @returns {void}
 */
export function initEffectsTip(button: HTMLButtonElement): void {
    if (!showEffectsTip()) return;

    effectsTipObs?.disconnect();

    effectsTipObs = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
            const anyVisible = entries.some((entry) => entry.isIntersecting);
            if (!anyVisible) return;

            openEffectsTip();

            effectsTipObs?.disconnect();
            effectsTipObs = null;
        },
        { threshold: 0.15 }
    );

    effectsTipObs.observe(button);
}



