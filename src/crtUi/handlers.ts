import * as soundEffects from "../soundEffects.ts";
import type { Ctx, PlotKind } from "./types.ts";
import { snapBase, snapGain } from "./math.ts";
import { getRt, mountRt, syncMod } from "./runtime.ts";

/**
 * Mount hook for the CSS decorator thing.
 * @param {Ctx} ctx
 * @returns {() => void}
 */
export const mnt = (ctx: Ctx): (() => void) => {
    const runtime = mountRt(ctx.modalEl);

    /**
     * Unmount cleanup.
     * @returns {void}
     */
    const off = (): void => {
        runtime.destroy();
    };

    return off;
};

/**
 * Power button click handler.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onPw = (_ev: Event, ctx: Ctx): void => {
    void soundEffects.toggleCrtPower().then(() => {
        syncMod(ctx.modalEl);
    });
};

/**
 * Degauss button handler.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onDeg = (_ev: Event, ctx: Ctx): void => {
    soundEffects.triggerCrtDegauss();
    syncMod(ctx.modalEl);
};

/**
 * Swaps the plot mode back and forth.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onPlot = (_ev: Event, ctx: Ctx): void => {
    const runtime = getRt(ctx.modalEl);
    const nextPlotType: PlotKind = runtime.audioPlot.getPlotType() === 'spectrogram'
        ? 'waveform'
        : 'spectrogram';

    runtime.audioPlot.setPlotType(nextPlotType);
    syncMod(ctx.modalEl);
};

/**
 * Preset family change. Ignores weird values.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onStd = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
        return;
    }

    if (target.value !== 'PAL' && target.value !== 'NTSC') {
        return;
    }

    soundEffects.setCrtVideoStandard(target.value);
    syncMod(ctx.modalEl);
};

/**
 * Base freq slider handler.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onBase = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapBase(Number(target.value));
    soundEffects.setCrtBaseFrequencyHz(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Master gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onMaster = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtMasterGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Scanline gain slider thing.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onScanGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtScanlineGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Hum gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onHumGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtHumGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Rectifier gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onRectGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtRectifierGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Degauss gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onDegGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtDegaussGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Collapse gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onCollGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtCollapseGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Discharge gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onDisGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtDischargeGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Scanline layer toggle.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onScanTgl = (_ev: Event, ctx: Ctx): void => {
    const nextEnabledState = !soundEffects.getCrtNoiseState().scanlineEnabled;
    soundEffects.setCrtScanlineEnabled(nextEnabledState);
    syncMod(ctx.modalEl);
};

/**
 * Hum layer toggle.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onHumTgl = (_ev: Event, ctx: Ctx): void => {
    const nextEnabledState = !soundEffects.getCrtNoiseState().humEnabled;
    soundEffects.setCrtHumEnabled(nextEnabledState);
    syncMod(ctx.modalEl);
};

/**
 * Rectifier layer toggle.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onRectTgl = (_ev: Event, ctx: Ctx): void => {
    const nextEnabledState = !soundEffects.getCrtNoiseState().rectifierEnabled;
    soundEffects.setCrtRectifierEnabled(nextEnabledState);
    syncMod(ctx.modalEl);
};

/**
 * Restore defaults button.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
export const onRst = (_ev: Event, ctx: Ctx): void => {
    soundEffects.restoreCrtDefaults();
    syncMod(ctx.modalEl);
};

