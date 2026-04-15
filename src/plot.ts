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

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

interface Theme {
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

const AXIS_MARGIN_LEFT = 64;
const AXIS_MARGIN_RIGHT = 16;
const AXIS_MARGIN_TOP = 12;
const AXIS_MARGIN_BOTTOM = 28;

const DEF_FREQ_TICKS_HZ = [
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

const MIN_WAVE_AMP_RANGE = 0.001;

class CanvasPlot implements AudioSignalPlot {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly colourCtx: CanvasRenderingContext2D;
  private readonly minHz: number;
  private readonly maxHz: number;
  private readonly bgOverride: string | null;
  private readonly waveStrokeOverride: string | null;

  private analyser: AnalyserNode | null = null;
  private kind: PlotType;
  private rafId: number | null = null;
  private freqData: Float32Array | null = null;
  private waveData: Float32Array | null = null;

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
  private loop = (): void => {
    this.resize();

    if (this.kind === 'spectrogram') {
      this.drawSpec();
    } else {
      this.drawWave();
    }

    this.rafId = window.requestAnimationFrame(this.loop);
  };

  /**
   * Draws one spectrogram step.
   *
   * @returns {void}
   */
  private drawSpec(): void {
    const theme = this.getTheme();
    const plotRect = this.getRect();

    this.clrOutside(plotRect, theme.backgroundColour);
    this.shiftSpec(plotRect, theme.backgroundColour);
    this.fillSpecCol(plotRect, theme);
    this.drawFrame(plotRect, theme.frameColour);
    this.drawFreqAxis(plotRect, theme);

    this.ctx.fillStyle = theme.footerTextColour;
    this.ctx.font = `${12 * this.getDpr()}px Inter, Arial, sans-serif`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(
      '',
      plotRect.x + plotRect.width,
      this.canvas.height - (8 * this.getDpr())
    );
  }

  /**
   * Draws the waveform view.
   *
   * @returns {void}
   */
  private drawWave(): void {
    const theme = this.getTheme();
    const plotRect = this.getRect();

    this.clr(theme.backgroundColour);

    if (this.analyser === null || this.waveData === null) {
      this.drawWaveAxis(plotRect, 1, theme);
      this.drawFrame(plotRect, theme.frameColour);
      return;
    }

    const timeDomainDataBuffer = new Float32Array(this.waveData.length);
    this.analyser.getFloatTimeDomainData(timeDomainDataBuffer);
    this.waveData.set(timeDomainDataBuffer);

    const waveformAmplitudeRange = this.getWaveRange(this.waveData);

    this.drawWaveAxis(plotRect, waveformAmplitudeRange, theme);

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(plotRect.x, plotRect.y, plotRect.width, plotRect.height);
    this.ctx.clip();

    this.ctx.strokeStyle = theme.waveformStrokeColour;
    this.ctx.lineWidth = Math.max(1, this.getDpr());
    this.ctx.beginPath();

    for (let index = 0; index < this.waveData.length; index += 1) {
      const fraction = index / Math.max(1, this.waveData.length - 1);
      const x = plotRect.x + (fraction * plotRect.width);
      const y = this.yForAmp(this.waveData[index], waveformAmplitudeRange, plotRect);

      if (index === 0) {
        this.ctx.moveTo(x, y);
        continue;
      }

      this.ctx.lineTo(x, y);
    }

    this.ctx.stroke();
    this.ctx.restore();

    this.drawFrame(plotRect, theme.frameColour);

    const visibleMilliseconds = (
      (this.waveData.length / this.analyser.context.sampleRate) * 1000
    );

    this.ctx.fillStyle = theme.footerTextColour;
    this.ctx.font = `${12 * this.getDpr()}px Inter, Arial, sans-serif`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.fillText(
      `${visibleMilliseconds.toFixed(1)} ms window`,
      plotRect.x + plotRect.width,
      this.canvas.height - (8 * this.getDpr())
    );
  }

  /**
   * Shifts the existing spectrogram one column left so a new column can be painted.
   *
   * @param {DOMRect} plotRect - Plot area.
   * @param {string} backgroundColour - Background colour used to clear the new edge.
   * @returns {void}
   */
  private shiftSpec(plotRect: DOMRect, backgroundColour: string): void {
    this.ctx.drawImage(
      this.canvas,
      plotRect.x + 1,
      plotRect.y,
      plotRect.width - 1,
      plotRect.height,
      plotRect.x,
      plotRect.y,
      plotRect.width - 1,
      plotRect.height
    );

    this.ctx.fillStyle = backgroundColour;
    this.ctx.fillRect(plotRect.x + plotRect.width - 1, plotRect.y, 1, plotRect.height);
  }

  /**
   * Paints the newest spectrogram column.
   *
   * @param {DOMRect} plotRect - Plot area.
   * @param {Theme} theme - Active plot theme.
   * @returns {void}
   */
  private fillSpecCol(plotRect: DOMRect, theme: Theme): void {
    const plotColumnX = plotRect.x + plotRect.width - 1;

    if (this.analyser === null || this.freqData === null) {
      this.ctx.fillStyle = this.specCol(0, theme);
      this.ctx.fillRect(plotColumnX, plotRect.y, 1, plotRect.height);
      return;
    }

    const frequencyDataBuffer = new Float32Array(this.freqData.length);
    this.analyser.getFloatFrequencyData(frequencyDataBuffer);
    this.freqData.set(frequencyDataBuffer);

    for (let localRow = 0; localRow < plotRect.height; localRow += 1) {
      const y = plotRect.y + localRow;
      const frequencyHz = this.freqForRow(localRow, plotRect.height);
      const frequencyBinIndex = this.binForFreq(
        frequencyHz,
        this.freqData.length,
        this.analyser.context.sampleRate
      );
      const decibels = this.freqData[frequencyBinIndex];
      const intensity = this.clamp((decibels + 110) / 90, 0, 1);

      this.ctx.fillStyle = this.specCol(intensity, theme);
      this.ctx.fillRect(plotColumnX, y, 1, 1);
    }
  }

  /**
   * Draws the frame around the plot area.
   *
   * @param {DOMRect} plotRect - Plot area.
   * @param {string} frameColour - Frame colour.
   * @returns {void}
   */
  private drawFrame(plotRect: DOMRect, frameColour: string): void {
    this.ctx.strokeStyle = frameColour;
    this.ctx.lineWidth = Math.max(1, this.getDpr());
    this.ctx.strokeRect(plotRect.x, plotRect.y, plotRect.width, plotRect.height);
  }

  /**
   * Draws the frequency axis labels and guide lines.
   *
   * @param {DOMRect} plotRect - Plot area.
   * @param {Theme} theme - Active plot theme.
   * @returns {void}
   */
  private drawFreqAxis(plotRect: DOMRect, theme: Theme): void {
    this.ctx.font = `${12 * this.getDpr()}px Inter, Arial, sans-serif`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (const tickFrequencyHz of DEF_FREQ_TICKS_HZ) {
      if (tickFrequencyHz < this.minHz || tickFrequencyHz > this.maxHz) {
        continue;
      }

      const y = this.yForFreq(tickFrequencyHz, plotRect);
      const tickLabel = this.fmtFreq(tickFrequencyHz);

      this.ctx.strokeStyle = theme.gridLineColour;
      this.ctx.beginPath();
      this.ctx.moveTo(plotRect.x, y);
      this.ctx.lineTo(plotRect.x + plotRect.width, y);
      this.ctx.stroke();

      this.ctx.fillStyle = theme.axisTextColour;
      this.ctx.fillText(
        tickLabel,
        plotRect.x - (8 * this.getDpr()),
        y
      );
    }

    this.ctx.fillStyle = theme.axisTitleColour;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(
      'Hz',
      8 * this.getDpr(),
      8 * this.getDpr()
    );
  }

  /**
   * Draws the waveform axis labels and guide lines.
   *
   * @param {DOMRect} plotRect - Plot area.
   * @param {number} waveformAmplitudeRange - Current waveform amplitude range.
   * @param {Theme} theme - Active plot theme.
   * @returns {void}
   */
  private drawWaveAxis(
    plotRect: DOMRect,
    waveformAmplitudeRange: number,
    theme: Theme
  ): void {
    const amplitudeTicks = [
      waveformAmplitudeRange,
      waveformAmplitudeRange * 0.5,
      0,
      -waveformAmplitudeRange * 0.5,
      -waveformAmplitudeRange
    ];

    this.ctx.font = `${12 * this.getDpr()}px Inter, Arial, sans-serif`;
    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (const tickValue of amplitudeTicks) {
      const y = this.yForAmp(tickValue, waveformAmplitudeRange, plotRect);

      this.ctx.strokeStyle = theme.gridLineColour;
      this.ctx.beginPath();
      this.ctx.moveTo(plotRect.x, y);
      this.ctx.lineTo(plotRect.x + plotRect.width, y);
      this.ctx.stroke();

      this.ctx.fillStyle = theme.axisTextColour;
      this.ctx.fillText(
        this.fmtAmp(tickValue),
        plotRect.x - (8 * this.getDpr()),
        y
      );
    }

    this.ctx.fillStyle = theme.axisTitleColour;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(
      'amp',
      8 * this.getDpr(),
      8 * this.getDpr()
    );
  }

  /**
   * Returns the drawable plot rectangle inside the margins.
   *
   * @returns {DOMRect}
   */
  private getRect(): DOMRect {
    const devicePixelRatio = this.getDpr();
    const x = AXIS_MARGIN_LEFT * devicePixelRatio;
    const y = AXIS_MARGIN_TOP * devicePixelRatio;
    const width = this.canvas.width - x - (AXIS_MARGIN_RIGHT * devicePixelRatio);
    const height = this.canvas.height - y - (AXIS_MARGIN_BOTTOM * devicePixelRatio);

    return new DOMRect(x, y, Math.max(1, width), Math.max(1, height));
  }

  /**
   * Clears the whole canvas with the resolved background colour.
   *
   * @param {string | undefined} backgroundColour - Optional background override.
   * @returns {void}
   */
  private clr(backgroundColour?: string): void {
    const resolvedBackgroundColour = backgroundColour ?? this.getTheme().backgroundColour;

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = resolvedBackgroundColour;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Clears everything outside the plot rectangle.
   *
   * @param {DOMRect} plotRect - Plot area.
   * @param {string} backgroundColour - Background colour.
   * @returns {void}
   */
  private clrOutside(plotRect: DOMRect, backgroundColour: string): void {
    this.ctx.fillStyle = backgroundColour;

    this.ctx.fillRect(0, 0, this.canvas.width, plotRect.y);
    this.ctx.fillRect(0, plotRect.y, plotRect.x, plotRect.height);
    this.ctx.fillRect(
      plotRect.x + plotRect.width,
      plotRect.y,
      this.canvas.width - (plotRect.x + plotRect.width),
      plotRect.height
    );
    this.ctx.fillRect(
      0,
      plotRect.y + plotRect.height,
      this.canvas.width,
      this.canvas.height - (plotRect.y + plotRect.height)
    );
  }

  /**
   * Reads the active theme from CSS variables and runtime overrides.
   *
   * @returns {Theme}
   */
  private getTheme(): Theme {
    const styles = getComputedStyle(this.canvas);

    const backgroundColour = this.bgOverride
      ?? this.getCss(styles, '--plot-background-colour', '#ffffff');

    const waveformStrokeColour = this.waveStrokeOverride
      ?? this.getCss(styles, '--plot-waveform-stroke-colour', '#33d6ff');

    const frameColour = this.getCss(
      styles,
      '--plot-frame-colour',
      '#004d40'
    );
    const gridLineColour = this.getCss(
      styles,
      '--plot-grid-line-colour',
      '#cccccc'
    );
    const axisTextColour = this.getCss(
      styles,
      '--plot-axis-text-colour',
      '#333333'
    );
    const axisTitleColour = this.getCss(
      styles,
      '--plot-axis-title-colour',
      '#004d40'
    );
    const footerTextColour = this.getCss(
      styles,
      '--plot-footer-text-colour',
      '#666666'
    );

    const spectrogramLowColour = this.parseCol(
      this.getCss(styles, '--plot-spectrogram-low-colour', backgroundColour)
    );
    const spectrogramMidColour = this.parseCol(
      this.getCss(styles, '--plot-spectrogram-mid-colour', '#33d6ff')
    );
    const spectrogramHighColour = this.parseCol(
      this.getCss(styles, '--plot-spectrogram-high-colour', '#33f2f2')
    );

    return {
      backgroundColour,
      frameColour,
      gridLineColour,
      axisTextColour,
      axisTitleColour,
      footerTextColour,
      waveformStrokeColour,
      spectrogramLowColour,
      spectrogramMidColour,
      spectrogramHighColour
    };
  }

  /**
   * Reads a CSS variable with a fallback.
   *
   * @param {CSSStyleDeclaration} styles - Computed styles object.
   * @param {string} variableName - CSS variable name.
   * @param {string} fallbackValue - Fallback value.
   * @returns {string}
   */
  private getCss(
    styles: CSSStyleDeclaration,
    variableName: string,
    fallbackValue: string
  ): string {
    const cssValue = styles.getPropertyValue(variableName).trim();
    return cssValue === '' ? fallbackValue : cssValue;
  }

  /**
   * Parses a CSS colour into numeric RGBA components.
   *
   * @param {string} colourValue - CSS colour string.
   * @returns {Rgba}
   */
  private parseCol(colourValue: string): Rgba {
    this.colourCtx.fillStyle = '#000000';
    this.colourCtx.fillStyle = colourValue;

    const normalisedColour = this.colourCtx.fillStyle;

    if (normalisedColour.startsWith('#')) {
      return this.parseHex(normalisedColour);
    }

    return this.parseRgbFn(normalisedColour);
  }

  /**
   * Parses hex colours in #rgb, #rgba, #rrggbb, or #rrggbbaa form.
   *
   * @param {string} hexColour - Hex colour string.
   * @returns {Rgba}
   */
  private parseHex(hexColour: string): Rgba {
    const hex = hexColour.slice(1);

    if (hex.length === 3) {
      return {
        red: Number.parseInt(hex[0] + hex[0], 16),
        green: Number.parseInt(hex[1] + hex[1], 16),
        blue: Number.parseInt(hex[2] + hex[2], 16),
        alpha: 1
      };
    }

    if (hex.length === 4) {
      return {
        red: Number.parseInt(hex[0] + hex[0], 16),
        green: Number.parseInt(hex[1] + hex[1], 16),
        blue: Number.parseInt(hex[2] + hex[2], 16),
        alpha: Number.parseInt(hex[3] + hex[3], 16) / 255
      };
    }

    if (hex.length === 6) {
      return {
        red: Number.parseInt(hex.slice(0, 2), 16),
        green: Number.parseInt(hex.slice(2, 4), 16),
        blue: Number.parseInt(hex.slice(4, 6), 16),
        alpha: 1
      };
    }

    if (hex.length === 8) {
      return {
        red: Number.parseInt(hex.slice(0, 2), 16),
        green: Number.parseInt(hex.slice(2, 4), 16),
        blue: Number.parseInt(hex.slice(4, 6), 16),
        alpha: Number.parseInt(hex.slice(6, 8), 16) / 255
      };
    }

    throw new Error(`Unsupported hex colour format for plot theme: ${hexColour}`);
  }

  /**
   * Parses rgb(...) and rgba(...) colour strings.
   *
   * @param {string} functionColour - CSS function colour string.
   * @returns {Rgba}
   */
  private parseRgbFn(functionColour: string): Rgba {
    const match = functionColour.match(/^rgba?\((.+)\)$/);

    if (match === null) {
      throw new Error(`Unsupported CSS colour format for plot theme: ${functionColour}`);
    }

    const segments = match[1].split(',').map((segment) => segment.trim());

    if (segments.length < 3) {
      throw new Error(`Incomplete CSS colour format for plot theme: ${functionColour}`);
    }

    return {
      red: Number.parseFloat(segments[0]),
      green: Number.parseFloat(segments[1]),
      blue: Number.parseFloat(segments[2]),
      alpha: segments[3] === undefined ? 1 : Number.parseFloat(segments[3])
    };
  }

  /**
   * Maps a local row index to a logarithmic frequency.
   *
   * @param {number} localRow - Row index within the plot.
   * @param {number} plotHeight - Plot height.
   * @returns {number}
   */
  private freqForRow(localRow: number, plotHeight: number): number {
    const fractionFromBottom = 1 - (localRow / Math.max(1, plotHeight - 1));
    const minLog = Math.log10(this.minHz);
    const maxLog = Math.log10(this.maxHz);
    const logarithmicFrequency = minLog + ((maxLog - minLog) * fractionFromBottom);

    return 10 ** logarithmicFrequency;
  }

  /**
   * Converts a frequency into a canvas Y coordinate.
   *
   * @param {number} frequencyHz - Frequency in hertz.
   * @param {DOMRect} plotRect - Plot area.
   * @returns {number}
   */
  private yForFreq(frequencyHz: number, plotRect: DOMRect): number {
    const minLog = Math.log10(this.minHz);
    const maxLog = Math.log10(this.maxHz);
    const frequencyLog = Math.log10(
      this.clamp(frequencyHz, this.minHz, this.maxHz)
    );
    const fractionFromBottom = (frequencyLog - minLog) / (maxLog - minLog);

    return plotRect.y + ((1 - fractionFromBottom) * plotRect.height);
  }

  /**
   * Converts an amplitude into a canvas Y coordinate.
   *
   * @param {number} amplitude - Signal amplitude.
   * @param {number} waveformAmplitudeRange - Visible waveform range.
   * @param {DOMRect} plotRect - Plot area.
   * @returns {number}
   */
  private yForAmp(
    amplitude: number,
    waveformAmplitudeRange: number,
    plotRect: DOMRect
  ): number {
    const normalisedAmplitude = this.clamp(
      amplitude / Math.max(MIN_WAVE_AMP_RANGE, waveformAmplitudeRange),
      -1,
      1
    );

    return plotRect.y + ((1 - ((normalisedAmplitude + 1) * 0.5)) * plotRect.height);
  }

  /**
   * Finds the maximum visible waveform range from the current buffer.
   *
   * @param {Float32Array} timeDomainData - Waveform data.
   * @returns {number}
   */
  private getWaveRange(timeDomainData: Float32Array): number {
    let maxAbsoluteAmplitude = 0;

    for (let index = 0; index < timeDomainData.length; index += 1) {
      const absoluteAmplitude = Math.abs(timeDomainData[index]);

      if (absoluteAmplitude > maxAbsoluteAmplitude) {
        maxAbsoluteAmplitude = absoluteAmplitude;
      }
    }

    return Math.max(MIN_WAVE_AMP_RANGE, maxAbsoluteAmplitude);
  }

  /**
   * Converts a frequency to the nearest analyser bin index.
   *
   * @param {number} frequencyHz - Frequency in hertz.
   * @param {number} frequencyBinCount - Number of bins.
   * @param {number} sampleRateHz - Audio sample rate.
   * @returns {number}
   */
  private binForFreq(
    frequencyHz: number,
    frequencyBinCount: number,
    sampleRateHz: number
  ): number {
    const nyquistFrequencyHz = sampleRateHz * 0.5;
    const normalisedFrequency = frequencyHz / nyquistFrequencyHz;
    const index = Math.round(normalisedFrequency * (frequencyBinCount - 1));

    return this.clamp(index, 0, frequencyBinCount - 1);
  }

  /**
   * Converts a spectrogram intensity value into a colour.
   *
   * @param {number} intensity - Spectrogram intensity.
   * @param {Theme} theme - Active theme.
   * @returns {string}
   */
  private specCol(intensity: number, theme: Theme): string {
    const clampedIntensity = this.clamp(intensity, 0, 1);

    if (clampedIntensity <= 0.5) {
      return this.mixRgba(
        theme.spectrogramLowColour,
        theme.spectrogramMidColour,
        clampedIntensity * 2
      );
    }

    return this.mixRgba(
      theme.spectrogramMidColour,
      theme.spectrogramHighColour,
      (clampedIntensity - 0.5) * 2
    );
  }

  /**
   * Interpolates between two RGBA colours.
   *
   * @param {Rgba} startColour - Start colour.
   * @param {Rgba} endColour - End colour.
   * @param {number} amount - Interpolation amount.
   * @returns {string}
   */
  private mixRgba(
    startColour: Rgba,
    endColour: Rgba,
    amount: number
  ): string {
    const clampedAmount = this.clamp(amount, 0, 1);
    const red = Math.round(
      startColour.red + ((endColour.red - startColour.red) * clampedAmount)
    );
    const green = Math.round(
      startColour.green + ((endColour.green - startColour.green) * clampedAmount)
    );
    const blue = Math.round(
      startColour.blue + ((endColour.blue - startColour.blue) * clampedAmount)
    );
    const alpha = startColour.alpha + ((endColour.alpha - startColour.alpha) * clampedAmount);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  /**
   * Formats a frequency label for the axis.
   *
   * @param {number} frequencyHz - Frequency in hertz.
   * @returns {string}
   */
  private fmtFreq(frequencyHz: number): string {
    if (frequencyHz >= 1000) {
      const kilohertz = frequencyHz / 1000;
      return `${kilohertz.toFixed(kilohertz >= 10 ? 0 : 1)}k`;
    }

    return `${Math.round(frequencyHz)}`;
  }

  /**
   * Formats an amplitude label for the waveform axis.
   *
   * @param {number} amplitude - Amplitude value.
   * @returns {string}
   */
  private fmtAmp(amplitude: number): string {
    const absoluteAmplitude = Math.abs(amplitude);

    if (absoluteAmplitude >= 10) {
      return amplitude.toFixed(0);
    }

    if (absoluteAmplitude >= 1) {
      return amplitude.toFixed(1);
    }

    if (absoluteAmplitude >= 0.1) {
      return amplitude.toFixed(2);
    }

    return amplitude.toFixed(3);
  }

  /**
   * Clamps a value into a range.
   *
   * @param {number} value - Input value.
   * @param {number} minimum - Minimum allowed value.
   * @param {number} maximum - Maximum allowed value.
   * @returns {number}
   */
  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /**
   * Returns the current device pixel ratio.
   *
   * @returns {number}
   */
  private getDpr(): number {
    return window.devicePixelRatio || 1;
  }
}

/**
 * Creates the canvas-based audio signal plot implementation.
 *
 * @param {CreateAudioSignalPlotOptions} options - Plot configuration.
 * @returns {AudioSignalPlot}
 */
export function createAudioSignalPlot(
  options: CreateAudioSignalPlotOptions
): AudioSignalPlot {
  return new CanvasPlot(options);
}