import * as soundEffects from "../soundEffects.ts";
import { getCfg } from "./config.ts";
import type { PlotKind } from "./types.ts";

export function layerButtonLabel(
    label: string,
    enabled: boolean
): string {
    const text = getCfg().modal;
    return enabled
        ? `${text.stopPrefix} ${label}`
        : `${text.startPrefix} ${label}`;
}

export function plotButtonLabel(plotType: PlotKind): string {
    const text = getCfg().modal;
    return plotType === "spectrogram"
        ? text.plotSpectrogram
        : text.plotWaveform;
}

export function powerButtonLabel(): string {
    const text = getCfg().modal;
    return soundEffects.getCrtNoiseState().running
        ? text.stopPrefix
        : text.startPrefix;
}
