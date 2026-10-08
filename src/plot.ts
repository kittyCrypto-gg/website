import { CanvasPlot } from "./plot/math.ts";
export type { PlotType, AudioSignalPlot, CreateAudioSignalPlotOptions } from "./plot/shared.ts";
import type { AudioSignalPlot, CreateAudioSignalPlotOptions } from "./plot/shared.ts";

/** Instantiates the canvas renderer with the requested audio analyser options. */
export function createAudioSignalPlot(options: CreateAudioSignalPlotOptions): AudioSignalPlot {
  return new CanvasPlot(options);
}
