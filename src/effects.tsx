import type { fxUIconf } from "./uiFetch.ts";
import { THEME_MODE_CHANGED_EVENT } from "./themeChanger.ts";
import { installMenuToggle } from "./menues.tsx";
import { STORAGE_KEY } from "./effects/config.ts";
import { apply, defs, live, resolved } from "./effects/preferences.ts";
import { applyTextShadowScale, ensureTextShadowKeyframes, ensureTextShadowTargets } from "./effects/textDistortion.ts";
import { openMod, refreshEffectsModal, setEffectsUiConfig, syncOpen } from "./effects/modal.ts";
import { initEffectsTip } from "./effects/helpTip.tsx";

const BTN_ID = "effects-toggle";
const BTN_BOTTOM = "80px";
let syncOn = false;

/**
 * Installs the storage event sync once.
 * @returns {void}
 */
function ensureSync(): void {
    if (syncOn) return;
    syncOn = true;

    /**
     * Keeps tabs/windows in sync when storage changes elsewhere.
     * @param {StorageEvent} event
     * @returns {void}
     */
    const onStore = (event: StorageEvent): void => {
        if (event.key !== STORAGE_KEY) return;
        apply(resolved());
        syncOpen();
    };

    const onThemeModeChange = (): void => {
        applyTextShadowScale(live().textShadowIntensity);
    };

    document.addEventListener(
        THEME_MODE_CHANGED_EVENT,
        onThemeModeChange
    );

    window.addEventListener("storage", onStore);
}




/**
 * Creates the floating CRT effects button, applies saved preferences,
 * and wires the effects modal. Button plumbing is delegated to
 * `installMenuToggle` so every floating-modal toggle behaves the same.
 * @param {fxUIconf} nextUi
 * @returns {void}
 */
export function initEffectsControls(nextUi: fxUIconf): void {
    setEffectsUiConfig(nextUi);

    defs();
    apply(resolved());

    ensureTextShadowTargets();
    ensureTextShadowKeyframes();

    const effectsToggle = installMenuToggle({
        id: BTN_ID,
        bottom: BTN_BOTTOM,
        cfg: nextUi,
        classes: ["theme-toggle-button", "effects-toggle-button"],
        icon: {
            size: 32,
            wrapperClass: "effects-toggle-button__icon",
            svgClass: "effects-toggle-button__svg"
        },
        openModal: openMod
    });

    initEffectsTip(effectsToggle.button);

    refreshEffectsModal();

    ensureSync();
}
