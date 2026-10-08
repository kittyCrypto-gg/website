import { AXIS_MARGIN_LEFT, AXIS_MARGIN_RIGHT, AXIS_MARGIN_TOP, AXIS_MARGIN_BOTTOM } from "./shared.ts";
import type { Rgba, Theme } from "./shared.ts";
import { CanvasPlotRender } from "./render.ts";

export abstract class CanvasPlotTheme extends CanvasPlotRender {
  /**
   * Returns the drawable plot rectangle inside the margins.
   *
   * @returns {DOMRect}
   */
  protected getRect(): DOMRect {
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
  protected clr(backgroundColour?: string): void {
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
  protected clrOutside(plotRect: DOMRect, backgroundColour: string): void {
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
  protected getTheme(): Theme {
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
  protected getCss(
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
  protected parseCol(colourValue: string): Rgba {
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
  protected parseHex(hexColour: string): Rgba {
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
  protected parseRgbFn(functionColour: string): Rgba {
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

}
