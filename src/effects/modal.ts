import type { fxUIconf } from "../uiFetch.ts";
import * as modals from "../modals.ts";
import { render2Mkup } from "../reactHelpers.tsx";
import { live } from "./preferences.ts";
import { Panel } from "./view.tsx";
import { syncMod, onTextShadowTgl, onPhosTgl, onScanTgl, onPhosOp, onScanOp, onScanSpd, onTextShadowIntensity, onReset } from "./controls.ts";

const MOD_ID = "screen-effects";
let mod: modals.Modal | null = null;
let uiCfg: fxUIconf | null = null;

/**
 * Current ui config getter. Throws if init got skipped somewhere.
 * @returns {fxUIconf}
 */
function ui(): fxUIconf {
    if (!uiCfg) {
        throw new Error("Effects UI config has not been initialised.");
    }

    return uiCfg;
}



/**
 * If the modal is open, updates it from the live prefs.
 * @returns {void}
 */
export function syncOpen(): void {
    const session = modals.factory.getOpenSession(MOD_ID);
    if (!session) return;
    syncMod(session.modalEl, live());
}



/**
 * Renders the modal html string from the current live prefs.
 * @returns {string}
 */
function rndrMod(): string {
    return render2Mkup(Panel({ prefs: live(), ui: ui() }));
}



/**
 * Creates the modal singleton on first use.
 * @returns {modals.Modal}
 */
function ensureMod(): modals.Modal {
    if (mod) return mod;

    mod = modals.factory.create({
        id: MOD_ID,
        mode: "blocking",
        window: true,
        modalClassName: "effects-modal",
        content: rndrMod,
        decorators: [
            modals.closeOnClick("[data-effects-close]"),
            modals.onModalEvent("#effects-text-shadow-enabled", "change", onTextShadowTgl),
            modals.onModalEvent("#effects-phosphor-enabled", "change", onPhosTgl),
            modals.onModalEvent("#effects-scanlines-enabled", "change", onScanTgl),
            modals.onModalEvent("#effects-phosphor-opacity", "input", onPhosOp),
            modals.onModalEvent("#effects-scanline-opacity", "input", onScanOp),
            modals.onModalEvent("#effects-scanline-speed", "input", onScanSpd),
            modals.onModalEvent(
                "#effects-text-shadow-intensity",
                "input",
                onTextShadowIntensity
            ),
            modals.onModalEvent("#effects-reset", "click", onReset)
        ]
    });

    return mod;
}

/**
 * Opens the effects modal and refreshes its content first.
 * @returns {void}
 */
export function openMod(): void {
    const modal = ensureMod();
    modal.setContent(rndrMod());
    modal.open();
}



export function setEffectsUiConfig(nextUi: fxUIconf): void {
    uiCfg = nextUi;
}

export function refreshEffectsModal(): void {
    if (mod?.isOpen()) mod.setContent(rndrMod());
}
