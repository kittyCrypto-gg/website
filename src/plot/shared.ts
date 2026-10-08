export type PlotType = 'spectrogram' | 'waveform';

export interface AudioSignalPlot {
  setAnalyserNode(analyserNode: AnalyserNode | null): void;
  setPlotType(plotType: PlotType): void;
  getPlotType(): PlotType;
  start(): void;
  stop(): void;
  resize(): void;
}

export interface CreateAudioSignalPlotOptions {
  canvas: HTMLCanvasElement;
  initialPlotType?: PlotType;
  minFrequencyHz?: number;
  maxFrequencyHz?: number;
  backgroundColour?: string;
  waveformStrokeColour?: string;
}

export interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface Theme {
  backgroundColour: string;
  frameColour: string;
  gridLineColour: string;
  axisTextColour: string;
  axisTitleColour: string;
  footerTextColour: string;
  waveformStrokeColour: string;
  spectrogramLowColour: Rgba;
  spectrogramMidColour: Rgba;
  spectrogramHighColour: Rgba;
}

export const AXIS_MARGIN_LEFT = 64;
export const AXIS_MARGIN_RIGHT = 16;
export const AXIS_MARGIN_TOP = 12;
export const AXIS_MARGIN_BOTTOM = 28;

export const DEF_FREQ_TICKS_HZ = [
  50,
  100,
  200,
  500,
  1000,
  2000,
  5000,
  10000,
  20000
];

export const MIN_WAVE_AMP_RANGE = 0.001;
