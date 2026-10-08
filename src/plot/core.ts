import type { PlotType, AudioSignalPlot, CreateAudioSignalPlotOptions, Rgba, Theme } from "./shared.ts";

export abstract class CanvasPlotCore implements AudioSignalPlot {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly ctx: CanvasRenderingContext2D;
  protected readonly colourCtx: CanvasRenderingContext2D;
  protected readonly minHz: number;
  protected readonly maxHz: number;
  protected readonly bgOverride: string | null;
  protected readonly waveStrokeOverride: string | null;

  protected analyser: AnalyserNode | null = null;
  protected kind: PlotType;
  protected rafId: number | null = null;
  protected freqData: Float32Array | null = null;
  protected waveData: Float32Array | null = null;

  protected abstract drawSpec(): void;
  protected abstract drawWave(): void;
  protected abstract shiftSpec(plotRect: DOMRect, backgroundColour: string): void;
  protected abstract fillSpecCol(plotRect: DOMRect, theme: Theme): void;
  protected abstract drawFrame(plotRect: DOMRect, frameColour: string): void;
  protected abstract drawFreqAxis(plotRect: DOMRect, theme: Theme): void;
  protected abstract drawWaveAxis(
    plotRect: DOMRect,
    waveformAmplitudeRange: number,
    theme: Theme
  ): void;
  protected abstract getRect(): DOMRect;
  protected abstract clr(backgroundColour?: string): void;
  protected abstract clrOutside(plotRect: DOMRect, backgroundColour: string): void;
  protected abstract getTheme(): Theme;
  protected abstract getCss(
    styles: CSSStyleDeclaration,
    variableName: string,
    fallbackValue: string
  ): string;
  protected abstract parseCol(colourValue: string): Rgba;
  protected abstract parseHex(hexColour: string): Rgba;
  protected abstract parseRgbFn(functionColour: string): Rgba;
  protected abstract freqForRow(localRow: number, plotHeight: number): number;
  protected abstract yForFreq(frequencyHz: number, plotRect: DOMRect): number;
  protected abstract yForAmp(
    amplitude: number,
    waveformAmplitudeRange: number,
    plotRect: DOMRect
  ): number;
  protected abstract getWaveRange(timeDomainData: Float32Array): number;
  protected abstract binForFreq(
    frequencyHz: number,
    frequencyBinCount: number,
    sampleRateHz: number
  ): number;
  protected abstract specCol(intensity: number, theme: Theme): string;
  protected abstract mixRgba(
    startColour: Rgba,
    endColour: Rgba,
    amount: number
  ): string;
  protected abstract fmtFreq(frequencyHz: number): string;
  protected abstract fmtAmp(amplitude: number): string;
  protected abstract clamp(value: number, minimum: number, maximum: number): number;
  protected abstract getDpr(): number;

  /**
   * Creates the canvas plot and stores the rendering options.
   *
   * @param {CreateAudioSignalPlotOptions} options - Plot configuration.
   */
  public constructor(options: CreateAudioSignalPlotOptions) {
    const context = options.canvas.getContext('2d');
    const colourParserCanvas = document.createElement('canvas');
    const colourParserContext = colourParserCanvas.getContext('2d');

    if (context === null) {
      throw new Error('Could not create 2D plotting context.');
    }

    if (colourParserContext === null) {
      throw new Error('Could not create colour parsing context.');
    }

    this.canvas = options.canvas;
    this.ctx = context;
    this.colourCtx = colourParserContext;
    this.kind = options.initialPlotType ?? 'spectrogram';
    this.minHz = options.minFrequencyHz ?? 40;
    this.maxHz = options.maxFrequencyHz ?? 20_000;
    this.bgOverride = options.backgroundColour ?? null;
    this.waveStrokeOverride = options.waveformStrokeColour ?? null;
  }

  /**
   * Sets the analyser input and rebuilds the backing buffers to match it.
   *
   * @param {AnalyserNode | null} analyserNode - Source analyser node.
   * @returns {void}
   */
  public setAnalyserNode(analyserNode: AnalyserNode | null): void {
    this.analyser = analyserNode;

    if (analyserNode === null) {
      this.freqData = null;
      this.waveData = null;
      return;
    }

    this.freqData = new Float32Array(analyserNode.frequencyBinCount);
    this.waveData = new Float32Array(analyserNode.fftSize);
  }

  /**
   * Switches the active plot type and clears the canvas.
   *
   * @param {PlotType} plotType - Plot type to display.
   * @returns {void}
   */
  public setPlotType(plotType: PlotType): void {
    this.kind = plotType;
    this.clr();
  }

  /**
   * Returns the active plot type.
   *
   * @returns {PlotType}
   */
  public getPlotType(): PlotType {
    return this.kind;
  }

  /**
   * Starts the render loop if it is not already running.
   *
   * @returns {void}
   */
  public start(): void {
    if (this.rafId !== null) {
      return;
    }

    this.loop();
  }

  /**
   * Stops the render loop.
   *
   * @returns {void}
   */
  public stop(): void {
    if (this.rafId === null) {
      return;
    }

    window.cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  /**
   * Resizes the backing canvas to the current device-pixel size.
   *
   * @returns {void}
   */
  public resize(): void {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * devicePixelRatio));

    if (this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.clr();
  }

  /**
   * Runs one render tick and schedules the next one.
   *
   * @returns {void}
   */
  protected loop = (): void => {
    this.resize();

    if (this.kind === 'spectrogram') {
      this.drawSpec();
    } else {
      this.drawWave();
    }

    this.rafId = window.requestAnimationFrame(this.loop);
  };

}
