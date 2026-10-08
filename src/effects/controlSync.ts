import type { Prefs } from "./config.ts";
import { PHOS_OP_MAX, SCAN_OP_MAX, SCAN_SPD_MAX, SCAN_SPD_MIN, TEXT_SHADOW_MAX, TEXT_SHADOW_MIN } from "./config.ts";
import { clamp, opToPct, pct } from "./math.ts";

/**
 * Syncs a checkbox in the modal.
 * @param {HTMLDivElement} modalEl
 * @param {string} selector
 * @param {boolean} checked
 * @returns {void}
 */
function syncChk(modalEl: HTMLDivElement, selector: string, checked: boolean): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) return;
    el.checked = checked;
}

/**
 * Syncs a range input.
 * @param {HTMLDivElement} modalEl
 * @param {string} selector
 * @param {number} value
 * @returns {void}
 */
function syncRng(modalEl: HTMLDivElement, selector: string, value: number): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) return;
    el.value = String(Math.round(clamp(value, 0, 100)));
}

/**
 * Syncs one little output label.
 * @param {HTMLDivElement} modalEl
 * @param {string} selector
 * @param {number} value
 * @returns {void}
 */
function syncOut(modalEl: HTMLDivElement, selector: string, value: number): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLOutputElement) && !(el instanceof HTMLElement)) return;
    el.textContent = pct(value);
}

/**
 * Reflects prefs into the currently open modal controls.
 * @param {HTMLDivElement} modalEl
 * @param {Prefs} prefs
 * @returns {void}
 */
export function syncMod(modalEl: HTMLDivElement, prefs: Prefs): void {
    const phosphorPercent = opToPct(prefs.phosphorOpacity, PHOS_OP_MAX);
    const scanlinePercent = opToPct(prefs.scanlineOpacity, SCAN_OP_MAX);
    const scanlineSpeed = clamp(prefs.scanlineSpeed, SCAN_SPD_MIN, SCAN_SPD_MAX);
    const textShadowIntensity = clamp(
        prefs.textShadowIntensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    syncChk(modalEl, "#effects-text-shadow-enabled", !prefs.textShadowEnabled || textShadowIntensity === 0);
    syncChk(modalEl, "#effects-phosphor-enabled", !prefs.phosphorEnabled || phosphorPercent === 0);
    syncChk(modalEl, "#effects-scanlines-enabled", !prefs.scanlinesEnabled || scanlinePercent === 0);

    syncRng(modalEl, "#effects-phosphor-opacity", phosphorPercent);
    syncRng(modalEl, "#effects-scanline-opacity", scanlinePercent);
    syncRng(modalEl, "#effects-scanline-speed", scanlineSpeed);
    syncRng(modalEl, "#effects-text-shadow-intensity", textShadowIntensity);

    syncOut(modalEl, "#effects-phosphor-opacity-value", phosphorPercent);
    syncOut(modalEl, "#effects-scanline-opacity-value", scanlinePercent);
    syncOut(modalEl, "#effects-scanline-speed-value", scanlineSpeed);
    syncOut(modalEl, "#effects-text-shadow-intensity-value", textShadowIntensity);
}



