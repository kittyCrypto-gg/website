import { factory, onModalEvent, type Modal } from './modals.ts';
import * as helpers from './helpers.ts';
import {
    mnt, onBase, onCollGain, onDeg, onDegGain, onDisGain,
    onHumGain, onHumTgl, onMaster, onPlot, onPw, onRectGain,
    onRectTgl, onRst, onScanGain, onScanTgl, onStd
} from "./crtUi/handlers.ts";
import { renderModal } from "./crtUi/view.tsx";
import { ensureCfg } from "./crtUi/config.ts";
import {
    DEF_WIN_H,
    DEF_WIN_W,
    MOD_ID,
    WIN_STORE_KEY
} from "./crtUi/constants.ts";

let mod: Modal | null = null;


/**
 * Makes the modal singleton if it does not exist yet.
 * @returns {Modal}
 */
function ensureMod(): Modal {
    if (mod) {
        return mod;
    }

    helpers.ensCtrWinState({
        storeKey: WIN_STORE_KEY,
        width: DEF_WIN_W,
        height: DEF_WIN_H
    });

    mod = factory.create({
        id: MOD_ID,
        mode: 'blocking',
        window: true,
        modalClassName: 'crt-ui-modal',
        content: renderModal,
        decorators: [
            {
                cssHref: '/styles/modules/crt-ui.css',
                mount: mnt
            },
            onModalEvent('#power-toggle-button', 'click', onPw),
            onModalEvent('#degauss-button', 'click', onDeg),
            onModalEvent('#plot-toggle-button', 'click', onPlot),
            onModalEvent('#standard-select', 'change', onStd),
            onModalEvent('#base-frequency-slider', 'input', onBase),
            onModalEvent('#master-gain-slider', 'input', onMaster),
            onModalEvent('#scanline-gain-slider', 'input', onScanGain),
            onModalEvent('#hum-gain-slider', 'input', onHumGain),
            onModalEvent('#rectifier-gain-slider', 'input', onRectGain),
            onModalEvent('#degauss-gain-slider', 'input', onDegGain),
            onModalEvent('#collapse-gain-slider', 'input', onCollGain),
            onModalEvent('#discharge-gain-slider', 'input', onDisGain),
            onModalEvent('#scanline-toggle-button', 'click', onScanTgl),
            onModalEvent('#hum-toggle-button', 'click', onHumTgl),
            onModalEvent('#rectifier-toggle-button', 'click', onRectTgl),
            onModalEvent('[data-crt-ui-restore]', 'click', onRst)
        ]
    });

    return mod;
}

/**
 * Preloads config and builds the modal singleton.
 * @returns {Promise<void>}
 */
export async function initModal(): Promise<void> {
    await ensureCfg();
    ensureMod();
}

/**
 * Opens the CRT controls modal.
 * @returns {Promise<void>}
 */
export async function openModal(): Promise<void> {
    await ensureCfg();
    helpers.ensCtrWinState({
        storeKey: WIN_STORE_KEY,
        width: DEF_WIN_W,
        height: DEF_WIN_H
    });

    const modal = ensureMod();
    modal.setContent(renderModal());
    modal.open();
}

/**
 * Closes the modal if it's open.
 * @returns {void}
 */
export function closeModal(): void {
    mod?.close();
}

/**
 * Tells you whether the modal is open right now.
 * @returns {boolean}
 */
export function modalIsOpen(): boolean {
    return mod?.isOpen() ?? false;
}