import type { ReactElement } from 'react';
import type { MainJson } from './uiFetch.ts';
import * as soundEffects from './soundEffects.ts';
import * as plot from './plot.ts';
import { modals, onModalEvent, type Modal } from './modals.ts';
import { render2Mkup } from './reactHelpers.tsx';
import { fetchUiData } from './uiFetch.ts';
import * as helpers from './helpers.ts';

type PlotKind = plot.PlotType;
type Ctx = Readonly<{
    modalEl: HTMLDivElement;
}>;

interface Els {
    root: HTMLDivElement;
    loadingStage: HTMLDivElement;
    contentLayer: HTMLDivElement;
    powerToggleButton: HTMLButtonElement;
    degaussButton: HTMLButtonElement;
    plotToggleButton: HTMLButtonElement;
    standardSelect: HTMLSelectElement;
    standardValue: HTMLElement;
    baseFrequencySlider: HTMLInputElement;
    baseFrequencyValue: HTMLElement;
    masterGainSlider: HTMLInputElement;
    masterGainValue: HTMLElement;
    scanlineGainSlider: HTMLInputElement;
    scanlineGainValue: HTMLElement;
    humGainSlider: HTMLInputElement;
    humGainValue: HTMLElement;
    rectifierGainSlider: HTMLInputElement;
    rectifierGainValue: HTMLElement;
    degaussGainSlider: HTMLInputElement;
    degaussGainValue: HTMLElement;
    collapseGainSlider: HTMLInputElement;
    collapseGainValue: HTMLElement;
    dischargeGainSlider: HTMLInputElement;
    dischargeGainValue: HTMLElement;
    scanlineToggleButton: HTMLButtonElement;
    humToggleButton: HTMLButtonElement;
    rectifierToggleButton: HTMLButtonElement;
    statusText: HTMLElement;
    standardReadout: HTMLElement;
    baseReadout: HTMLElement;
    lineReadout: HTMLElement;
    plotCanvas: HTMLCanvasElement;
}

type Rt = Readonly<{
    elements: Els;
    audioPlot: plot.AudioSignalPlot;
    destroy: () => void;
    refresh: () => void;
}>;

type ModText = Readonly<{
    title: string;
    lead: string;
    closeTitle: string;
    transportTitle: string;
    presetAndFrequencyTitle: string;
    layerTogglesTitle: string;
    levelsTitle: string;
    statusTitle: string;
    presetFamilyLabel: string;
    presetPalLabel: string;
    presetNtscLabel: string;
    baseFrequencyLabel: string;
    masterLabel: string;
    scanlineLabel: string;
    humLabel: string;
    rectifierLabel: string;
    degaussLabel: string;
    collapseLabel: string;
    dischargeLabel: string;
    runningLabel: string;
    standardLabel: string;
    baseLabel: string;
    lineFrequencyLabel: string;
    retriggerDegauss: string;
    restore: string;
    none: string;
    startPrefix: string;
    stopPrefix: string;
    plotSpectrogram: string;
    plotWaveform: string;
    idleStatus: string;
    runningStatus: string;
}>;

type Cfg = Readonly<{
    modal: ModText;
}>;

type WinSize = Readonly<{
    width: string;
    height: string;
}>;

const MOD_ID = 'crt-noise-control-desk';
const FRAME_ID = `${MOD_ID}-window-frame`;
const WIN_STATE_ID = `modal-window-${MOD_ID}`;
const WIN_STORE_KEY = `window-api:${WIN_STATE_ID}:state`;

const LD_STYLE_ID = `${MOD_ID}-loading-style`;
const LD_STAGE_ID = `${MOD_ID}-loading-stage`;
const LD_CONTENT_ID = `${MOD_ID}-content-layer`;
const LD_NOTICE_ID = `${MOD_ID}-loading`;

const DEF_WIN_W = 800;
const DEF_WIN_H = 600;

const BASE_FREQ_NOTCH_HZ = 0.28;
const GAIN_NOTCH = 0.05;

let mod: Modal | null = null;
let cfg: Cfg | null = null;
let cfgP: Promise<Cfg> | null = null;

const rtByEl = new WeakMap<HTMLDivElement, Rt>();

/**
 * Tiny object check so config parsing does not fall over later.
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObj(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pulls a non-empty string out or throws a fit.
 * @param {unknown} value
 * @param {string} fieldName
 * @returns {string}
 */
function needStr(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`Missing CRT UI config string: ${fieldName}`);
    }

    return value;
}

/**
 * Checks the fetched config shape just enough that the rest can trust it.
 * not a full schema thing, just the bits we care about.
 * @param {unknown} candidate
 * @returns {Cfg}
 */
function normCfg(candidate: unknown): Cfg {
    if (!isObj(candidate)) {
        throw new Error('Missing crtUi config in main.json');
    }

    const modalCandidate = candidate.modal;

    if (!isObj(modalCandidate)) {
        throw new Error('Missing crtUi.modal config in main.json');
    }

    return {
        modal: {
            title: needStr(modalCandidate.title, 'crtUi.modal.title'),
            lead: needStr(modalCandidate.lead, 'crtUi.modal.lead'),
            closeTitle: needStr(modalCandidate.closeTitle, 'crtUi.modal.closeTitle'),
            transportTitle: needStr(modalCandidate.transportTitle, 'crtUi.modal.transportTitle'),
            presetAndFrequencyTitle: needStr(
                modalCandidate.presetAndFrequencyTitle,
                'crtUi.modal.presetAndFrequencyTitle'
            ),
            layerTogglesTitle: needStr(
                modalCandidate.layerTogglesTitle,
                'crtUi.modal.layerTogglesTitle'
            ),
            levelsTitle: needStr(modalCandidate.levelsTitle, 'crtUi.modal.levelsTitle'),
            statusTitle: needStr(modalCandidate.statusTitle, 'crtUi.modal.statusTitle'),
            presetFamilyLabel: needStr(
                modalCandidate.presetFamilyLabel,
                'crtUi.modal.presetFamilyLabel'
            ),
            presetPalLabel: needStr(modalCandidate.presetPalLabel, 'crtUi.modal.presetPalLabel'),
            presetNtscLabel: needStr(
                modalCandidate.presetNtscLabel,
                'crtUi.modal.presetNtscLabel'
            ),
            baseFrequencyLabel: needStr(
                modalCandidate.baseFrequencyLabel,
                'crtUi.modal.baseFrequencyLabel'
            ),
            masterLabel: needStr(modalCandidate.masterLabel, 'crtUi.modal.masterLabel'),
            scanlineLabel: needStr(modalCandidate.scanlineLabel, 'crtUi.modal.scanlineLabel'),
            humLabel: needStr(modalCandidate.humLabel, 'crtUi.modal.humLabel'),
            rectifierLabel: needStr(modalCandidate.rectifierLabel, 'crtUi.modal.rectifierLabel'),
            degaussLabel: needStr(modalCandidate.degaussLabel, 'crtUi.modal.degaussLabel'),
            collapseLabel: needStr(modalCandidate.collapseLabel, 'crtUi.modal.collapseLabel'),
            dischargeLabel: needStr(modalCandidate.dischargeLabel, 'crtUi.modal.dischargeLabel'),
            runningLabel: needStr(modalCandidate.runningLabel, 'crtUi.modal.runningLabel'),
            standardLabel: needStr(modalCandidate.standardLabel, 'crtUi.modal.standardLabel'),
            baseLabel: needStr(modalCandidate.baseLabel, 'crtUi.modal.baseLabel'),
            lineFrequencyLabel: needStr(
                modalCandidate.lineFrequencyLabel,
                'crtUi.modal.lineFrequencyLabel'
            ),
            retriggerDegauss: needStr(
                modalCandidate.retriggerDegauss,
                'crtUi.modal.retriggerDegauss'
            ),
            restore: needStr(modalCandidate.restore, 'crtUi.modal.restore'),
            none: needStr(modalCandidate.none, 'crtUi.modal.none'),
            startPrefix: needStr(modalCandidate.startPrefix, 'crtUi.modal.startPrefix'),
            stopPrefix: needStr(modalCandidate.stopPrefix, 'crtUi.modal.stopPrefix'),
            plotSpectrogram: needStr(
                modalCandidate.plotSpectrogram,
                'crtUi.modal.plotSpectrogram'
            ),
            plotWaveform: needStr(modalCandidate.plotWaveform, 'crtUi.modal.plotWaveform'),
            idleStatus: needStr(modalCandidate.idleStatus, 'crtUi.modal.idleStatus'),
            runningStatus: needStr(modalCandidate.runningStatus, 'crtUi.modal.runningStatus')
        }
    };
}

/**
 * Loads the UI config once and caches it.
 * @returns {Promise<Cfg>}
 */
async function ensureCfg(): Promise<Cfg> {
    if (cfg) {
        return cfg;
    }

    if (cfgP) {
        return cfgP;
    }

    const load = async (): Promise<Cfg> => {
        const data = await fetchUiData();
        const candidate = (data as MainJson & { crtUi?: unknown }).crtUi;
        const resolved = normCfg(candidate);
        cfg = resolved;
        return resolved;
    };

    cfgP = load();

    try {
        return await cfgP;
    } finally {
        cfgP = null;
    }
}

/**
 * Applies the frame min-height inline.
 * keeps restored width/height alone.
 * @returns {void}
 */
function setFrameMinH(): void {
    const frameEl = document.getElementById(FRAME_ID);

    if (!(frameEl instanceof HTMLDivElement)) {
        return;
    }

    frameEl.style.minHeight = `${DEF_WIN_H}px`;
}

/**
 * Reads the stored window size used by window.ts.
 * falls back to defaults if storage is missing or cursed.
 * @returns {WinSize}
 */
function readWinSize(): WinSize {
    const fallback: WinSize = {
        width: `${DEF_WIN_W}px`,
        height: `${DEF_WIN_H}px`
    };

    try {
        const raw = window.localStorage.getItem(WIN_STORE_KEY);
        if (raw === null) {
            return fallback;
        }

        const parsed: unknown = JSON.parse(raw);
        if (!isObj(parsed)) {
            return fallback;
        }

        const width = typeof parsed.width === 'string' && parsed.width.trim() !== ''
            ? parsed.width
            : fallback.width;

        const height = typeof parsed.height === 'string' && parsed.height.trim() !== ''
            ? parsed.height
            : fallback.height;

        return {
            width,
            height
        };
    } catch {
        return fallback;
    }
}

/**
 * Applies a temporary loading footprint so modal sizing sees the same
 * stored size window.ts is about to restore.
 * @param {HTMLDivElement} stageEl
 * @param {HTMLDivElement} contentLayerEl
 * @returns {void}
 */
function setLdSize(
    stageEl: HTMLDivElement,
    contentLayerEl: HTMLDivElement
): void {
    const size = readWinSize();

    stageEl.style.width = size.width;
    stageEl.style.height = size.height;
    stageEl.style.minWidth = size.width;
    stageEl.style.minHeight = size.height;

    contentLayerEl.style.minWidth = size.width;
    contentLayerEl.style.minHeight = size.height;
}

/**
 * Clears the temporary loading footprint once real content is ready.
 * @param {HTMLDivElement} stageEl
 * @param {HTMLDivElement} contentLayerEl
 * @returns {void}
 */
function clrLdSize(
    stageEl: HTMLDivElement,
    contentLayerEl: HTMLDivElement
): void {
    stageEl.style.width = '';
    stageEl.style.height = '';
    stageEl.style.minWidth = '';
    stageEl.style.minHeight = '';

    contentLayerEl.style.minWidth = '';
    contentLayerEl.style.minHeight = '';
}

/**
 * Injects the loader animation styles once.
 * @returns {void}
 */
function ensureLdCss(): void {
    if (document.getElementById(LD_STYLE_ID)) {
        return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = LD_STYLE_ID;
    styleEl.textContent = `
#${LD_STAGE_ID} {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

#${LD_NOTICE_ID},
#${LD_CONTENT_ID} {
  grid-area: 1 / 1;
  min-width: 0;
  min-height: 0;
}

#${LD_NOTICE_ID} {
  z-index: 2;
  display: grid;
  place-items: center;
  pointer-events: none;
  visibility: visible;
  opacity: 1;
  transition:
    opacity 180ms ease,
    visibility 0s linear 0s;
}

#${LD_STAGE_ID}[data-ready="true"] #${LD_NOTICE_ID} {
  opacity: 0;
  visibility: hidden;
  transition:
    opacity 180ms ease,
    visibility 0s linear 180ms;
}

#${LD_CONTENT_ID} {
  z-index: 1;
  width: 100%;
  height: 100%;
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

#${LD_STAGE_ID}[data-ready="true"] #${LD_CONTENT_ID} {
  opacity: 1;
  pointer-events: auto;
}

#${LD_CONTENT_ID} > .crt-ui__layout {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

#${LD_NOTICE_ID} .crt-ui__loadingInner {
  display: inline-flex;
  align-items: flex-end;
  justify-content: center;
  gap: 0.04em;
  padding: 0.7rem 1rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--frame-bg-colour, #111) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--nav-border-colour, #444) 70%, transparent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
  color: var(--body-text-colour, #fff);
  font: inherit;
  font-size: 0.95rem;
  line-height: 1;
  white-space: nowrap;
}

#${LD_NOTICE_ID} .crt-ui__loadingDots {
  display: inline-flex;
  align-items: flex-end;
}

#${LD_NOTICE_ID} .crt-ui__loadingDot {
  display: inline-block;
  min-width: 0.3em;
  text-align: center;
  animation: crt-ui-loading-dot 0.9s infinite ease-in-out;
  opacity: 0.45;
}

#${LD_NOTICE_ID} .crt-ui__loadingDot:nth-child(1) {
  animation-delay: 0s;
}

#${LD_NOTICE_ID} .crt-ui__loadingDot:nth-child(2) {
  animation-delay: 0.12s;
}

#${LD_NOTICE_ID} .crt-ui__loadingDot:nth-child(3) {
  animation-delay: 0.24s;
}

@keyframes crt-ui-loading-dot {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.45;
  }

  30% {
    transform: translateY(-0.24em);
    opacity: 1;
  }
}
`.trim();

    document.head.appendChild(styleEl);
}

/**
 * Marks the content layer as ready so it fades in over the loader.
 * @param {HTMLDivElement} stageEl
 * @param {boolean} isReady
 * @returns {void}
 */
function setLdReady(stageEl: HTMLDivElement, isReady: boolean): void {
    stageEl.dataset.ready = isReady ? 'true' : 'false';
}

/**
 * Gets config after init.
 * @returns {Cfg}
 */
function getCfg(): Cfg {
    if (!cfg) {
        throw new Error('CRT UI config has not been initialised.');
    }

    return cfg;
}

/**
 * Number formatter for the little readouts and whatnot.
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
function fmtNum(value: number, decimals = 2): string {
    return value.toFixed(decimals);
}

/**
 * Snaps a value to the nearest preset when it is close enough.
 * @param {number} value
 * @param {number[]} presetValues
 * @param {number} threshold
 * @returns {number}
 */
function snapTo(
    value: number,
    presetValues: number[],
    threshold: number
): number {
    let nearestValue = value;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const presetValue of presetValues) {
        const distance = Math.abs(value - presetValue);

        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestValue = presetValue;
        }
    }

    if (nearestDistance <= threshold) {
        return nearestValue;
    }

    return value;
}

/**
 * Snaps the base freq slider onto the classic mains values if close enough.
 * @param {number} value
 * @returns {number}
 */
function snapBase(value: number): number {
    const snappedValue = snapTo(
        value,
        [50, 60],
        BASE_FREQ_NOTCH_HZ
    );

    return Number(snappedValue.toFixed(2));
}

/**
 * Same idea as the freq snap, but for gain sliders around 1.
 * @param {number} value
 * @returns {number}
 */
function snapGain(value: number): number {
    const snappedValue = snapTo(
        value,
        [1],
        GAIN_NOTCH
    );

    return Number(snappedValue.toFixed(2));
}

/**
 * Builds the start/stop label for a layer toggle.
 * @param {string} label
 * @param {boolean} isEnabled
 * @returns {string}
 */
function getLayerBtn(label: string, isEnabled: boolean): string {
    const text = getCfg().modal;

    return isEnabled
        ? `${text.stopPrefix} ${label}`
        : `${text.startPrefix} ${label}`;
}

/**
 * Label for the plot type swap button.
 * @param {PlotKind} plotType
 * @returns {string}
 */
function getPlotBtn(plotType: PlotKind): string {
    const text = getCfg().modal;

    return plotType === 'spectrogram'
        ? text.plotSpectrogram
        : text.plotWaveform;
}

/**
 * Label for the main power button.
 * @returns {string}
 */
function getPowerBtn(): string {
    const text = getCfg().modal;

    return soundEffects.getCrtNoiseState().running
        ? text.stopPrefix
        : text.startPrefix;
}

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
function getRt(modalEl: HTMLDivElement): Rt {
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

    elements.powerToggleButton.textContent = getPowerBtn();
    elements.degaussButton.disabled = !state.running;
    elements.plotToggleButton.textContent = getPlotBtn(audioPlot.getPlotType());

    elements.scanlineToggleButton.textContent = getLayerBtn(
        text.scanlineLabel,
        state.scanlineEnabled
    );

    elements.humToggleButton.textContent = getLayerBtn(
        text.humLabel,
        state.humEnabled
    );

    elements.rectifierToggleButton.textContent = getLayerBtn(
        text.rectifierLabel,
        state.rectifierEnabled
    );

    elements.standardSelect.value = state.timingStandard;

    elements.standardValue.textContent = state.displayStandard === 'NONE'
        ? text.none
        : state.displayStandard;

    elements.baseFrequencySlider.value = String(state.baseFrequencyHz);
    elements.baseFrequencyValue.textContent = `${fmtNum(state.baseFrequencyHz)} Hz`;

    elements.masterGainSlider.value = String(state.masterGain);
    elements.masterGainValue.textContent = fmtNum(state.masterGain);

    elements.scanlineGainSlider.value = String(state.scanlineGain);
    elements.scanlineGainValue.textContent = fmtNum(state.scanlineGain);

    elements.humGainSlider.value = String(state.humGain);
    elements.humGainValue.textContent = fmtNum(state.humGain);

    elements.rectifierGainSlider.value = String(state.rectifierGain);
    elements.rectifierGainValue.textContent = fmtNum(state.rectifierGain);

    elements.degaussGainSlider.value = String(state.degaussGain);
    elements.degaussGainValue.textContent = fmtNum(state.degaussGain);

    elements.collapseGainSlider.value = String(state.collapseGain);
    elements.collapseGainValue.textContent = fmtNum(state.collapseGain);

    elements.dischargeGainSlider.value = String(state.dischargeGain);
    elements.dischargeGainValue.textContent = fmtNum(state.dischargeGain);

    elements.statusText.textContent = state.running
        ? text.runningStatus
        : text.idleStatus;

    elements.standardReadout.textContent = state.displayStandard === 'NONE'
        ? text.none
        : state.displayStandard;

    elements.baseReadout.textContent = `${fmtNum(state.baseFrequencyHz)} Hz`;
    elements.lineReadout.textContent = `${fmtNum(state.lineFrequencyHz)} Hz`;

    audioPlot.setAnalyserNode(soundEffects.getCrtAnalyserNode());
}

/**
 * Resizes the plot and re-syncs the modal bits.
 * @param {HTMLDivElement} modalEl
 * @returns {void}
 */
function syncMod(modalEl: HTMLDivElement): void {
    const runtime = getRt(modalEl);
    runtime.audioPlot.resize();
    sync(runtime.elements, runtime.audioPlot);
}

/**
 * Mounts the modal runtime, listeners and plot stuff.
 * @param {HTMLDivElement} modalEl
 * @returns {Rt}
 */
function mountRt(modalEl: HTMLDivElement): Rt {
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
                                    {getLayerBtn(text.scanlineLabel, true)}
                                </button>

                                <button id="hum-toggle-button" type="button">
                                    {getLayerBtn(text.humLabel, true)}
                                </button>
                            </div>

                            <div className="crt-ui__buttonRow">
                                <button id="rectifier-toggle-button" type="button">
                                    {getLayerBtn(text.rectifierLabel, true)}
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
function rndrMod(): string {
    return render2Mkup(<ModView />);
}

/**
 * Mount hook for the CSS decorator thing.
 * @param {Ctx} ctx
 * @returns {() => void}
 */
const mnt = (ctx: Ctx): (() => void) => {
    const runtime = mountRt(ctx.modalEl);

    /**
     * Unmount cleanup.
     * @returns {void}
     */
    const off = (): void => {
        runtime.destroy();
    };

    return off;
};

/**
 * Power button click handler.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onPw = (_ev: Event, ctx: Ctx): void => {
    void soundEffects.toggleCrtPower().then(() => {
        syncMod(ctx.modalEl);
    });
};

/**
 * Degauss button handler.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onDeg = (_ev: Event, ctx: Ctx): void => {
    soundEffects.triggerCrtDegauss();
    syncMod(ctx.modalEl);
};

/**
 * Swaps the plot mode back and forth.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onPlot = (_ev: Event, ctx: Ctx): void => {
    const runtime = getRt(ctx.modalEl);
    const nextPlotType: PlotKind = runtime.audioPlot.getPlotType() === 'spectrogram'
        ? 'waveform'
        : 'spectrogram';

    runtime.audioPlot.setPlotType(nextPlotType);
    syncMod(ctx.modalEl);
};

/**
 * Preset family change. Ignores weird values.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onStd = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
        return;
    }

    if (target.value !== 'PAL' && target.value !== 'NTSC') {
        return;
    }

    soundEffects.setCrtVideoStandard(target.value);
    syncMod(ctx.modalEl);
};

/**
 * Base freq slider handler.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onBase = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapBase(Number(target.value));
    soundEffects.setCrtBaseFrequencyHz(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Master gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onMaster = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtMasterGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Scanline gain slider thing.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onScanGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtScanlineGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Hum gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onHumGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtHumGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Rectifier gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onRectGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtRectifierGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Degauss gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onDegGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtDegaussGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Collapse gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onCollGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtCollapseGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Discharge gain slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onDisGain = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
        return;
    }

    const snappedValue = snapGain(Number(target.value));
    soundEffects.setCrtDischargeGain(snappedValue);
    syncMod(ctx.modalEl);
};

/**
 * Scanline layer toggle.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onScanTgl = (_ev: Event, ctx: Ctx): void => {
    const nextEnabledState = !soundEffects.getCrtNoiseState().scanlineEnabled;
    soundEffects.setCrtScanlineEnabled(nextEnabledState);
    syncMod(ctx.modalEl);
};

/**
 * Hum layer toggle.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onHumTgl = (_ev: Event, ctx: Ctx): void => {
    const nextEnabledState = !soundEffects.getCrtNoiseState().humEnabled;
    soundEffects.setCrtHumEnabled(nextEnabledState);
    syncMod(ctx.modalEl);
};

/**
 * Rectifier layer toggle.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onRectTgl = (_ev: Event, ctx: Ctx): void => {
    const nextEnabledState = !soundEffects.getCrtNoiseState().rectifierEnabled;
    soundEffects.setCrtRectifierEnabled(nextEnabledState);
    syncMod(ctx.modalEl);
};

/**
 * Restore defaults button.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onRst = (_ev: Event, ctx: Ctx): void => {
    soundEffects.restoreCrtDefaults();
    syncMod(ctx.modalEl);
};

/**
 * Makes the modal singleton if it does not exist yet.
 * @returns {Modal}
 */
function ensureMod(): Modal {
    if (mod) {
        return mod;
    }

    helpers.ensCtrWinState({
        storeKey: WIN_STORE_KEY,
        width: DEF_WIN_W,
        height: DEF_WIN_H
    });

    mod = modals.create({
        id: MOD_ID,
        mode: 'blocking',
        window: true,
        modalClassName: 'crt-ui-modal',
        content: rndrMod,
        decorators: [
            {
                cssHref: '/styles/modules/crt-ui.css',
                mount: mnt
            },
            onModalEvent('#power-toggle-button', 'click', onPw),
            onModalEvent('#degauss-button', 'click', onDeg),
            onModalEvent('#plot-toggle-button', 'click', onPlot),
            onModalEvent('#standard-select', 'change', onStd),
            onModalEvent('#base-frequency-slider', 'input', onBase),
            onModalEvent('#master-gain-slider', 'input', onMaster),
            onModalEvent('#scanline-gain-slider', 'input', onScanGain),
            onModalEvent('#hum-gain-slider', 'input', onHumGain),
            onModalEvent('#rectifier-gain-slider', 'input', onRectGain),
            onModalEvent('#degauss-gain-slider', 'input', onDegGain),
            onModalEvent('#collapse-gain-slider', 'input', onCollGain),
            onModalEvent('#discharge-gain-slider', 'input', onDisGain),
            onModalEvent('#scanline-toggle-button', 'click', onScanTgl),
            onModalEvent('#hum-toggle-button', 'click', onHumTgl),
            onModalEvent('#rectifier-toggle-button', 'click', onRectTgl),
            onModalEvent('[data-crt-ui-restore]', 'click', onRst)
        ]
    });

    return mod;
}

/**
 * Preloads config and builds the modal singleton.
 * @returns {Promise<void>}
 */
export async function initModal(): Promise<void> {
    await ensureCfg();
    ensureMod();
}

/**
 * Opens the CRT controls modal.
 * @returns {Promise<void>}
 */
export async function openModal(): Promise<void> {
    await ensureCfg();
    helpers.ensCtrWinState({
        storeKey: WIN_STORE_KEY,
        width: DEF_WIN_W,
        height: DEF_WIN_H
    });

    const modal = ensureMod();
    modal.setContent(rndrMod());
    modal.open();
}

/**
 * Closes the modal if it's open.
 * @returns {void}
 */
export function closeModal(): void {
    mod?.close();
}

/**
 * Tells you whether the modal is open right now.
 * @returns {boolean}
 */
export function modalIsOpen(): boolean {
    return mod?.isOpen() ?? false;
}