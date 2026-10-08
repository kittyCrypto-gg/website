import { DEF_FREQ_TICKS_HZ } from "./shared.ts";
import type { Theme } from "./shared.ts";
import { CanvasPlotCore } from "./core.ts";

export abstract class CanvasPlotRender extends CanvasPlotCore {
  /**
   * Draws one spectrogram step.
   *
   * @returns {void}
   */
  protected drawSpec(): void {
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
  protected drawWave(): void {
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
  protected shiftSpec(plotRect: DOMRect, backgroundColour: string): void {
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
  protected fillSpecCol(plotRect: DOMRect, theme: Theme): void {
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
  protected drawFrame(plotRect: DOMRect, frameColour: string): void {
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
  protected drawFreqAxis(plotRect: DOMRect, theme: Theme): void {
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
  protected drawWaveAxis(
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

}
