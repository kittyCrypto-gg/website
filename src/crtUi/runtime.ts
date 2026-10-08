import * as soundEffects from "../soundEffects.ts";
import * as plot from "../plot.ts";
import { getCfg } from "./config.ts";
import { LD_CONTENT_ID, LD_STAGE_ID } from "./constants.ts";
import { clrLdSize, ensureLdCss, setFrameMinH, setLdReady, setLdSize } from "./loading.ts";
import { layerButtonLabel, plotButtonLabel, powerButtonLabel } from "./labels.ts";
import { formatNumber } from "./math.ts";
import type { Els, Rt } from "./types.ts";

const rtByEl = new WeakMap<HTMLDivElement, Rt>();

/**
 * Query selector but rude about missing nodes.
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {T}
 */
function needEl<T extends Element>(
    root: ParentNode,
    selector: string
): T {
    const element = root.querySelector<T>(selector);

    if (element === null) {
        throw new Error(`Missing UI element: ${selector}`);
    }

    return element;
}

/**
 * Caches all the interesting DOM bits for the modal.
 * @param {HTMLDivElement} modalEl
 * @returns {Els}
 */
function mkEls(modalEl: HTMLDivElement): Els {
    return {
        root: modalEl,
        loadingStage: needEl(modalEl, `#${LD_STAGE_ID}`),
        contentLayer: needEl(modalEl, `#${LD_CONTENT_ID}`),
        powerToggleButton: needEl(modalEl, '#power-toggle-button'),
        degaussButton: needEl(modalEl, '#degauss-button'),
        plotToggleButton: needEl(modalEl, '#plot-toggle-button'),
        standardSelect: needEl(modalEl, '#standard-select'),
        standardValue: needEl(modalEl, '#standard-value'),
        baseFrequencySlider: needEl(modalEl, '#base-frequency-slider'),
        baseFrequencyValue: needEl(modalEl, '#base-frequency-value'),
        masterGainSlider: needEl(modalEl, '#master-gain-slider'),
        masterGainValue: needEl(modalEl, '#master-gain-value'),
        scanlineGainSlider: needEl(modalEl, '#scanline-gain-slider'),
        scanlineGainValue: needEl(modalEl, '#scanline-gain-value'),
        humGainSlider: needEl(modalEl, '#hum-gain-slider'),
        humGainValue: needEl(modalEl, '#hum-gain-value'),
        rectifierGainSlider: needEl(modalEl, '#rectifier-gain-slider'),
        rectifierGainValue: needEl(modalEl, '#rectifier-gain-value'),
        degaussGainSlider: needEl(modalEl, '#degauss-gain-slider'),
        degaussGainValue: needEl(modalEl, '#degauss-gain-value'),
        collapseGainSlider: needEl(modalEl, '#collapse-gain-slider'),
        collapseGainValue: needEl(modalEl, '#collapse-gain-value'),
        dischargeGainSlider: needEl(modalEl, '#discharge-gain-slider'),
        dischargeGainValue: needEl(modalEl, '#discharge-gain-value'),
        scanlineToggleButton: needEl(modalEl, '#scanline-toggle-button'),
        humToggleButton: needEl(modalEl, '#hum-toggle-button'),
        rectifierToggleButton: needEl(modalEl, '#rectifier-toggle-button'),
        statusText: needEl(modalEl, '#status-text'),
        standardReadout: needEl(modalEl, '#standard-readout'),
        baseReadout: needEl(modalEl, '#base-readout'),
        lineReadout: needEl(modalEl, '#line-readout'),
        plotCanvas: needEl(modalEl, '#plot-canvas')
    };
}

/**
 * Finds the mounted runtime for a modal node.
 * @param {HTMLDivElement} modalEl
 * @returns {Rt}
 */
export function getRt(modalEl: HTMLDivElement): Rt {
    const runtime = rtByEl.get(modalEl);

    if (!runtime) {
        throw new Error('CRT UI runtime is not mounted.');
    }

    return runtime;
}

/**
 * Pushes sound state into the controls/readouts.
 * @param {Els} elements
 * @param {plot.AudioSignalPlot} audioPlot
 * @returns {void}
 */
function sync(elements: Els, audioPlot: plot.AudioSignalPlot): void {
    const state = soundEffects.getCrtNoiseState();
    const text = getCfg().modal;

    elements.powerToggleButton.textContent = powerButtonLabel();
    elements.degaussButton.disabled = !state.running;
    elements.plotToggleButton.textContent = plotButtonLabel(audioPlot.getPlotType());

    elements.scanlineToggleButton.textContent = layerButtonLabel(
        text.scanlineLabel,
        state.scanlineEnabled
    );

    elements.humToggleButton.textContent = layerButtonLabel(
        text.humLabel,
        state.humEnabled
    );

    elements.rectifierToggleButton.textContent = layerButtonLabel(
        text.rectifierLabel,
        state.rectifierEnabled
    );

    elements.standardSelect.value = state.timingStandard;

    elements.standardValue.textContent = state.displayStandard === 'NONE'
        ? text.none
        : state.displayStandard;

    elements.baseFrequencySlider.value = String(state.baseFrequencyHz);
    elements.baseFrequencyValue.textContent = `${formatNumber(state.baseFrequencyHz)} Hz`;

    elements.masterGainSlider.value = String(state.masterGain);
    elements.masterGainValue.textContent = formatNumber(state.masterGain);

    elements.scanlineGainSlider.value = String(state.scanlineGain);
    elements.scanlineGainValue.textContent = formatNumber(state.scanlineGain);

    elements.humGainSlider.value = String(state.humGain);
    elements.humGainValue.textContent = formatNumber(state.humGain);

    elements.rectifierGainSlider.value = String(state.rectifierGain);
    elements.rectifierGainValue.textContent = formatNumber(state.rectifierGain);

    elements.degaussGainSlider.value = String(state.degaussGain);
    elements.degaussGainValue.textContent = formatNumber(state.degaussGain);

    elements.collapseGainSlider.value = String(state.collapseGain);
    elements.collapseGainValue.textContent = formatNumber(state.collapseGain);

    elements.dischargeGainSlider.value = String(state.dischargeGain);
    elements.dischargeGainValue.textContent = formatNumber(state.dischargeGain);

    elements.statusText.textContent = state.running
        ? text.runningStatus
        : text.idleStatus;

    elements.standardReadout.textContent = state.displayStandard === 'NONE'
        ? text.none
        : state.displayStandard;

    elements.baseReadout.textContent = `${formatNumber(state.baseFrequencyHz)} Hz`;
    elements.lineReadout.textContent = `${formatNumber(state.lineFrequencyHz)} Hz`;

    audioPlot.setAnalyserNode(soundEffects.getCrtAnalyserNode());
}

/**
 * Resizes the plot and re-syncs the modal bits.
 * @param {HTMLDivElement} modalEl
 * @returns {void}
 */
export function syncMod(modalEl: HTMLDivElement): void {
    const runtime = getRt(modalEl);
    runtime.audioPlot.resize();
    sync(runtime.elements, runtime.audioPlot);
}

/**
 * Mounts the modal runtime, listeners and plot stuff.
 * @param {HTMLDivElement} modalEl
 * @returns {Rt}
 */
export function mountRt(modalEl: HTMLDivElement): Rt {
    setFrameMinH();
    ensureLdCss();

    modalEl.style.position = 'relative';
    modalEl.style.overflow = 'hidden';
    modalEl.style.minHeight = '0';

    const elements = mkEls(modalEl);

    setLdSize(elements.loadingStage, elements.contentLayer);
    setLdReady(elements.loadingStage, false);

    const audioPlot = plot.createAudioSignalPlot({
        canvas: elements.plotCanvas,
        initialPlotType: 'spectrogram'
    });

    let resizeObserver: ResizeObserver | null = null;
    const cleanup: Array<() => void> = [];

    if (typeof ResizeObserver !== 'undefined') {
        /**
         * Resizes the plot when the modal box changes.
         * @returns {void}
         */
        const onObs = (): void => {
            audioPlot.resize();
        };

        resizeObserver = new ResizeObserver(onObs);
        resizeObserver.observe(modalEl);
    } else {
        /**
         * Fallback resize hook for older browsers and such.
         * @returns {void}
         */
        const onWinResize = (): void => {
            audioPlot.resize();
        };

        /**
         * Removes the window resize hook.
         * @returns {void}
         */
        const offWinResize = (): void => {
            window.removeEventListener('resize', onWinResize);
        };

        window.addEventListener('resize', onWinResize);
        cleanup.push(offWinResize);
    }

    /**
     * Tears the runtime down.
     * @returns {void}
     */
    const destroy = (): void => {
        audioPlot.stop();
        resizeObserver?.disconnect();

        for (const off of cleanup) {
            off();
        }

        rtByEl.delete(modalEl);
    };

    /**
     * Refreshes the visible UI bits from current sound state.
     * @returns {void}
     */
    const refresh = (): void => {
        syncMod(modalEl);
    };

    const runtime: Rt = {
        elements,
        audioPlot,
        destroy,
        refresh
    };

    rtByEl.set(modalEl, runtime);

    audioPlot.start();
    sync(elements, audioPlot);

    /**
     * Queues the actual refresh on the next frame after the next frame.
     * yes, slightly silly, but it helps the layout settle.
     * @returns {void}
     */
    const qRef = (): void => {
        requestAnimationFrame(doRef);
    };

    /**
     * Finalises the first refresh and fades out the loader.
     * @returns {void}
     */
    const doRef = (): void => {
        if (!rtByEl.has(modalEl)) {
            return;
        }

        runtime.refresh();
        setLdReady(elements.loadingStage, true);

        requestAnimationFrame(() => {
            if (!rtByEl.has(modalEl)) {
                return;
            }

            clrLdSize(elements.loadingStage, elements.contentLayer);
            runtime.refresh();
        });
    };

    requestAnimationFrame(qRef);

    return runtime;
}

