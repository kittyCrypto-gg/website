import { MIN_WAVE_AMP_RANGE } from "./shared.ts";
import type { Rgba, Theme } from "./shared.ts";
import { CanvasPlotTheme } from "./theme.ts";

export class CanvasPlot extends CanvasPlotTheme {
  /**
   * Maps a local row index to a logarithmic frequency.
   *
   * @param {number} localRow - Row index within the plot.
   * @param {number} plotHeight - Plot height.
   * @returns {number}
   */
  protected freqForRow(localRow: number, plotHeight: number): number {
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
  protected yForFreq(frequencyHz: number, plotRect: DOMRect): number {
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
  protected yForAmp(
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
  protected getWaveRange(timeDomainData: Float32Array): number {
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
  protected binForFreq(
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
  protected specCol(intensity: number, theme: Theme): string {
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
  protected mixRgba(
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
  protected fmtFreq(frequencyHz: number): string {
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
  protected fmtAmp(amplitude: number): string {
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
  protected clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /**
   * Returns the current device pixel ratio.
   *
   * @returns {number}
   */
  protected getDpr(): number {
    return window.devicePixelRatio || 1;
  }
}
