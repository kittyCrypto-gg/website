import type { Prefs } from "./config.ts";
import { PHOS_OP_MAX, SCAN_OP_MAX, SCAN_SPD_MAX, SCAN_SPD_MIN, SLIDER_MAX, SLIDER_MIN, TEXT_SHADOW_MAX, TEXT_SHADOW_MIN } from "./config.ts";
import { clamp, opToPct, pct, pctToOp } from "./math.ts";
import { commit, defs, live } from "./preferences.ts";

type Ctx = Readonly<{ modalEl: HTMLDivElement; }>;

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



/**
 * Handles phosphor toggle checkbox.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onPhosTgl = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const cur = live();
    const nextOpacity = target.checked
        ? 0
        : cur.phosphorOpacity > 0
            ? cur.phosphorOpacity
            : defs().phosphorOpacity;

    const next: Prefs = {
        ...cur,
        phosphorEnabled: !target.checked,
        phosphorOpacity: nextOpacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles scanline toggle checkbox.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onScanTgl = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const cur = live();
    const nextOpacity = target.checked
        ? 0
        : cur.scanlineOpacity > 0
            ? cur.scanlineOpacity
            : defs().scanlineOpacity;

    const next: Prefs = {
        ...cur,
        scanlinesEnabled: !target.checked,
        scanlineOpacity: nextOpacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles phosphor opacity slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onPhosOp = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const percent = clamp(
        Number.parseFloat(target.value),
        SLIDER_MIN,
        SLIDER_MAX
    );
    const opacity = pctToOp(percent, PHOS_OP_MAX);

    const next: Prefs = {
        ...live(),
        phosphorEnabled: percent > 0,
        phosphorOpacity: opacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles scanline opacity slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onScanOp = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const percent = clamp(
        Number.parseFloat(target.value),
        SLIDER_MIN,
        SLIDER_MAX
    );
    const opacity = pctToOp(percent, SCAN_OP_MAX);

    const next: Prefs = {
        ...live(),
        scanlinesEnabled: percent > 0,
        scanlineOpacity: opacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles scanline speed slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onScanSpd = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const speed = clamp(
        Number.parseFloat(target.value),
        SCAN_SPD_MIN,
        SCAN_SPD_MAX
    );

    const next: Prefs = {
        ...live(),
        scanlineSpeed: speed
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles the text-distortion disable toggle.
 *
 * Disabling preserves the current slider value so the user's preferred
 * strength is restored when the effect is enabled again.
 *
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onTextShadowTgl = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const cur = live();
    const nextIntensity =
        cur.textShadowIntensity > 0
            ? cur.textShadowIntensity
            : defs().textShadowIntensity;

    const next: Prefs = {
        ...cur,
        textShadowEnabled: !target.checked,
        textShadowIntensity: nextIntensity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles CRT text-distortion intensity.
 *
 * Controls the shared chromatic-aberration strength applied to rendered
 * text and SVG graphics.
 *
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onTextShadowIntensity = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const intensity = clamp(
        Number.parseFloat(target.value),
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    const next: Prefs = {
        ...live(),
        textShadowEnabled: intensity > 0,
        textShadowIntensity: intensity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Reset button handler. Goes back to the css-ish defaults.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onReset = (_ev: Event, ctx: Ctx): void => {
    const base = defs();
    const next: Prefs = {
        phosphorEnabled: true,
        phosphorOpacity: base.phosphorOpacity,
        scanlinesEnabled: true,
        scanlineOpacity: base.scanlineOpacity,
        scanlineSpeed: base.scanlineSpeed,
        textShadowEnabled: true,
        textShadowIntensity: base.textShadowIntensity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};


