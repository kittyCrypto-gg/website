/** CRT audio synthesiser public API. */
export { CrtNoiseSynth } from "./crtNoise/oneShots.ts";
export { defaultBaseFrequencyForStandard, displayStandardFromBaseFrequency, deriveTimingStandardFromBaseFrequency, calculateLineFrequencyHz } from "./crtNoise/config.ts";
export type { VideoStandard, StandardDisplay, CrtNoiseState } from "./crtNoise/config.ts";
