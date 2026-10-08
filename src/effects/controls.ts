import type { Prefs } from "./config.ts";
import { PHOS_OP_MAX, SCAN_OP_MAX, SCAN_SPD_MAX, SCAN_SPD_MIN, SLIDER_MAX, SLIDER_MIN, TEXT_SHADOW_MAX, TEXT_SHADOW_MIN } from "./config.ts";
import { clamp, pctToOp } from "./math.ts";
import { syncMod } from "./controlSync.ts";
import { commit, defs, live } from "./preferences.ts";

type Ctx = Readonly<{ modalEl: HTMLDivElement; }>;

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


