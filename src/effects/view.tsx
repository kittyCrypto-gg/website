import type { ReactElement } from "react";
import type { fxUIconf } from "../uiFetch.ts";
import type { Prefs } from "./config.ts";
import { PHOS_OP_MAX, SCAN_OP_MAX, SCAN_SPD_MIN, SCAN_SPD_MAX, SLIDER_MIN, SLIDER_MAX, SLIDER_STEP, TEXT_SHADOW_MIN, TEXT_SHADOW_MAX } from "./config.ts";
import { clamp, opToPct, pct } from "./math.ts";

type Props = Readonly<{ prefs: Prefs; ui: fxUIconf; }>;

/**
 * Little react panel for the modal.
 * @param {Props} props
 * @returns {ReactElement}
 */
export function Panel(props: Props): ReactElement {
    const text = props.ui.modal;
    const phosphorPercent = opToPct(props.prefs.phosphorOpacity, PHOS_OP_MAX);
    const scanlinePercent = opToPct(props.prefs.scanlineOpacity, SCAN_OP_MAX);
    const scanlineSpeed = clamp(props.prefs.scanlineSpeed, SCAN_SPD_MIN, SCAN_SPD_MAX);
    const textShadowIntensity = clamp(
        props.prefs.textShadowIntensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    return (
        <>
            <div className="effects-modal__header">
                <div>
                    <h2 className="effects-modal__title">{text.title}</h2>
                    <p className="effects-modal__lead">{text.lead}</p>
                </div>

                {/* <button
          type="button"
          className="effects-modal__close"
          data-effects-close=""
          title={text.closeTitle}
          aria-label={text.closeTitle}
        >
          ✕
        </button> */}
            </div>

            <div className="effects-modal__grid">
                <section className="effects-modal__section">
                    <div className="effects-modal__section-heading">
                        <h3>Text distortion</h3>
                        <p>Controls the animated RGB separation applied to text and SVG graphics.</p>
                    </div>

                    <label className="effects-modal__toggle" htmlFor="effects-text-shadow-enabled">
                        <input
                            id="effects-text-shadow-enabled"
                            type="checkbox"
                            defaultChecked={!props.prefs.textShadowEnabled || textShadowIntensity === 0}
                        />
                        <span>Disable text distortion</span>
                    </label>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-text-shadow-intensity">{text.intensityLabel}</label>
                            <output id="effects-text-shadow-intensity-value">
                                <span>&nbsp;</span>{pct(textShadowIntensity)}
                            </output>
                        </div>

                        <input
                            id="effects-text-shadow-intensity"
                            type="range"
                            min={String(TEXT_SHADOW_MIN)}
                            max={String(TEXT_SHADOW_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(textShadowIntensity))}
                        />

                        <p className="effects-modal__hint">
                            15% is the default strength. 20% is the original base CRT strength. The upper range ramps aggressively, with 100% deliberately excessive.
                        </p>
                    </div>
                </section>

                <section className="effects-modal__section">
                    <div className="effects-modal__section-heading">
                        <h3>{text.phosphorTitle}</h3>
                        <p>{text.phosphorDescription}</p>
                    </div>

                    <label className="effects-modal__toggle" htmlFor="effects-phosphor-enabled">
                        <input
                            id="effects-phosphor-enabled"
                            type="checkbox"
                            defaultChecked={!props.prefs.phosphorEnabled || phosphorPercent === 0}
                        />
                        <span>{text.phosphorToggle}</span>
                    </label>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-phosphor-opacity">{text.intensityLabel}</label>
                            <output id="effects-phosphor-opacity-value"><span>&nbsp;</span>{pct(phosphorPercent)}</output>
                        </div>

                        <input
                            id="effects-phosphor-opacity"
                            type="range"
                            min={String(SLIDER_MIN)}
                            max={String(SLIDER_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(phosphorPercent))}
                        />

                        <p className="effects-modal__hint">{text.phosphorHint}</p>
                    </div>
                </section>

                <section className="effects-modal__section">
                    <div className="effects-modal__section-heading">
                        <h3>{text.scanlinesTitle}</h3>
                        <p>{text.scanlinesDescription}</p>
                    </div>

                    <label className="effects-modal__toggle" htmlFor="effects-scanlines-enabled">
                        <input
                            id="effects-scanlines-enabled"
                            type="checkbox"
                            defaultChecked={!props.prefs.scanlinesEnabled || scanlinePercent === 0}
                        />
                        <span>{text.scanlinesToggle}</span>
                    </label>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-scanline-opacity">{text.intensityLabel}</label>
                            <output id="effects-scanline-opacity-value"><span>&nbsp;</span>{pct(scanlinePercent)}</output>
                        </div>

                        <input
                            id="effects-scanline-opacity"
                            type="range"
                            min={String(SLIDER_MIN)}
                            max={String(SLIDER_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(scanlinePercent))}
                        />

                        <p className="effects-modal__hint">{text.scanlinesHint}</p>
                    </div>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-scanline-speed">{text.scanlineSpeedLabel}</label>
                            <output id="effects-scanline-speed-value"><span>&nbsp;</span>{pct(scanlineSpeed)}</output>
                        </div>

                        <input
                            id="effects-scanline-speed"
                            type="range"
                            min={String(SCAN_SPD_MIN)}
                            max={String(SCAN_SPD_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(scanlineSpeed))}
                        />

                        <p className="effects-modal__hint">{text.scanlineSpeedHint}</p>
                    </div>
                </section>
            </div>

            <div className="effects-modal__footer">
                <button type="button" id="effects-reset">
                    {text.reset}
                </button>

                <button type="button" data-effects-close="" data-intent="primary">
                    {text.done}
                </button>
            </div>
        </>
    );
}


