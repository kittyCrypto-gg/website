import type { ReactElement } from "react";
import { render2Mkup } from "../reactHelpers.tsx";
import { getCfg } from "./config.ts";
import { LD_CONTENT_ID, LD_NOTICE_ID, LD_STAGE_ID } from "./constants.ts";
import { layerButtonLabel } from "./labels.ts";
import type { Cfg } from "./types.ts";

/**
 * React view for the modal body.
 * @param {Cfg} ui
 * @returns {ReactElement}
 */
function Panel(ui: Cfg): ReactElement {
    const text = ui.modal;

    return (
        <div id={LD_STAGE_ID} data-ready="false">
            <div
                id={LD_NOTICE_ID}
                role="status"
                aria-live="polite"
                aria-atomic="true"
            >
                <div className="crt-ui__loadingInner">
                    <span className="crt-ui__loadingLabel">Loading</span>

                    <span className="crt-ui__loadingDots" aria-hidden="true">
                        <span className="crt-ui__loadingDot">.</span>
                        <span className="crt-ui__loadingDot">.</span>
                        <span className="crt-ui__loadingDot">.</span>
                    </span>
                </div>
            </div>

            <div id={LD_CONTENT_ID}>
                <div className="crt-ui__layout">
                    <section className="crt-ui__panel crt-ui__controls">
                        <div className="crt-ui__title">
                            <h2>{text.title}</h2>
                            <p>{text.lead}</p>
                        </div>

                        <div className="crt-ui__group">
                            <h3>{text.transportTitle}</h3>

                            <div className="crt-ui__buttonRow crt-ui__buttonRow--two">
                                <button id="power-toggle-button" type="button">
                                    {text.startPrefix}
                                </button>

                                <button id="degauss-button" type="button">
                                    {text.retriggerDegauss}
                                </button>
                            </div>

                            <div className="crt-ui__buttonRow">
                                <button id="plot-toggle-button" type="button">
                                    {text.plotSpectrogram}
                                </button>
                            </div>
                        </div>

                        <div className="crt-ui__group">
                            <h3>{text.presetAndFrequencyTitle}</h3>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.presetFamilyLabel}</span>
                                    <span id="standard-value">PAL</span>
                                </span>

                                <select id="standard-select" defaultValue="PAL">
                                    <option value="PAL">{text.presetPalLabel}</option>
                                    <option value="NTSC">{text.presetNtscLabel}</option>
                                </select>
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.baseFrequencyLabel}</span>
                                    <span id="base-frequency-value">50.00 Hz</span>
                                </span>

                                <input
                                    id="base-frequency-slider"
                                    type="range"
                                    min="45"
                                    max="65"
                                    step="0.01"
                                    defaultValue="50"
                                />
                            </label>
                        </div>

                        <div className="crt-ui__group">
                            <h3>{text.layerTogglesTitle}</h3>

                            <div className="crt-ui__buttonRow crt-ui__buttonRow--two">
                                <button id="scanline-toggle-button" type="button">
                                    {layerButtonLabel(text.scanlineLabel, true)}
                                </button>

                                <button id="hum-toggle-button" type="button">
                                    {layerButtonLabel(text.humLabel, true)}
                                </button>
                            </div>

                            <div className="crt-ui__buttonRow">
                                <button id="rectifier-toggle-button" type="button">
                                    {layerButtonLabel(text.rectifierLabel, true)}
                                </button>
                            </div>
                        </div>

                        <div className="crt-ui__group">
                            <h3>{text.levelsTitle}</h3>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.masterLabel}</span>
                                    <span id="master-gain-value">1.00</span>
                                </span>

                                <input
                                    id="master-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="1"
                                />
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.scanlineLabel}</span>
                                    <span id="scanline-gain-value">1.00</span>
                                </span>

                                <input
                                    id="scanline-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="1"
                                />
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.humLabel}</span>
                                    <span id="hum-gain-value">0.10</span>
                                </span>

                                <input
                                    id="hum-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="0.1"
                                />
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.rectifierLabel}</span>
                                    <span id="rectifier-gain-value">0.10</span>
                                </span>

                                <input
                                    id="rectifier-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="0.1"
                                />
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.degaussLabel}</span>
                                    <span id="degauss-gain-value">0.50</span>
                                </span>

                                <input
                                    id="degauss-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="0.5"
                                />
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.collapseLabel}</span>
                                    <span id="collapse-gain-value">0.35</span>
                                </span>

                                <input
                                    id="collapse-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="0.35"
                                />
                            </label>

                            <label className="crt-ui__field">
                                <span className="crt-ui__fieldLabel">
                                    <span>{text.dischargeLabel}</span>
                                    <span id="discharge-gain-value">0.60</span>
                                </span>

                                <input
                                    id="discharge-gain-slider"
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.01"
                                    defaultValue="0.6"
                                />
                            </label>
                        </div>

                        <div className="crt-ui__status">
                            <strong>{text.statusTitle}</strong>

                            <div className="crt-ui__statusGrid">
                                <span>{text.standardLabel}</span>
                                <span id="standard-readout">PAL</span>

                                <span>{text.baseLabel}</span>
                                <span id="base-readout">50.00 Hz</span>

                                <span>{text.lineFrequencyLabel}</span>
                                <span id="line-readout">15625.00 Hz</span>
                            </div>

                            <strong id="status-text">{text.idleStatus}</strong>
                        </div>

                        <div className="crt-ui__footer">
                            <button
                                type="button"
                                data-crt-ui-restore=""
                                title={text.restore}
                                aria-label={text.restore}
                                data-intent="primary"
                            >
                                {text.restore}
                            </button>
                        </div>
                    </section>

                    <section className="crt-ui__panel crt-ui__plotPanel">
                        <canvas id="plot-canvas" className="crt-ui__plotCanvas" />
                    </section>
                </div>
            </div>
        </div>
    );
}

/**
 * Tiny wrapper so render shape matches the effects modal pattern.
 * @returns {ReactElement}
 */
function ModView(): ReactElement {
    return <Panel {...getCfg()} />;
}

/**
 * Renders the modal html string from the React bit.
 * @returns {string}
 */
export function renderModal(): string {
    return render2Mkup(<ModView />);
}

