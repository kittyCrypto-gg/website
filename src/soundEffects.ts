import * as crtN from './crtNoise.ts';

interface DesiredSettings {
    timingStandard: crtN.VideoStandard;
    baseFrequencyHz: number;
    masterGain: number;
    scanlineGain: number;
    humGain: number;
    rectifierGain: number;
    degaussGain: number;
    collapseGain: number;
    dischargeGain: number;
    scanlineEnabled: boolean;
    humEnabled: boolean;
    rectifierEnabled: boolean;
}

export interface StartCrtNoiseOptions {
    standard?: crtN.VideoStandard;
    baseFrequencyHz?: number;
    masterGain?: number;
    scanlineGain?: number;
    humGain?: number;
    rectifierGain?: number;
    degaussGain?: number;
    collapseGain?: number;
    dischargeGain?: number;
    scanlineEnabled?: boolean;
    humEnabled?: boolean;
    rectifierEnabled?: boolean;
}

const CRT_SETTINGS_STORAGE_KEY = 'crt-noise:settings';

const DEFAULT_DESIRED_SETTINGS: Readonly<DesiredSettings> = {
    timingStandard: 'PAL',
    baseFrequencyHz: 50,
    masterGain: 1,
    scanlineGain: 1,
    humGain: 0.15,
    rectifierGain: 0.05,
    degaussGain: 0.5,
    collapseGain: 0.15,
    dischargeGain: 2,
    scanlineEnabled: true,
    humEnabled: true,
    rectifierEnabled: true
};

let sharedAudioContext: AudioContext | null = null;
let crtSynth: crtN.CrtNoiseSynth | null = null;

const desiredSettings: DesiredSettings = {
    ...DEFAULT_DESIRED_SETTINGS
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function readVideoStandard(
    value: unknown,
    fallback: crtN.VideoStandard
): crtN.VideoStandard {
    return value === 'PAL' || value === 'NTSC' ? value : fallback;
}

function persistDesiredSettings(): void {
    try {
        window.localStorage.setItem(
            CRT_SETTINGS_STORAGE_KEY,
            JSON.stringify(desiredSettings)
        );
    } catch {
        // Ignore storage failures.
    }
}

function loadDesiredSettings(): void {
    try {
        const raw = window.localStorage.getItem(CRT_SETTINGS_STORAGE_KEY);

        if (!raw) {
            return;
        }

        const parsed: unknown = JSON.parse(raw);

        if (!isRecord(parsed)) {
            return;
        }

        desiredSettings.timingStandard = readVideoStandard(
            parsed.timingStandard,
            DEFAULT_DESIRED_SETTINGS.timingStandard
        );
        desiredSettings.baseFrequencyHz = readNumber(
            parsed.baseFrequencyHz,
            DEFAULT_DESIRED_SETTINGS.baseFrequencyHz
        );
        desiredSettings.masterGain = readNumber(
            parsed.masterGain,
            DEFAULT_DESIRED_SETTINGS.masterGain
        );
        desiredSettings.scanlineGain = readNumber(
            parsed.scanlineGain,
            DEFAULT_DESIRED_SETTINGS.scanlineGain
        );
        desiredSettings.humGain = readNumber(
            parsed.humGain,
            DEFAULT_DESIRED_SETTINGS.humGain
        );
        desiredSettings.rectifierGain = readNumber(
            parsed.rectifierGain,
            DEFAULT_DESIRED_SETTINGS.rectifierGain
        );
        desiredSettings.degaussGain = readNumber(
            parsed.degaussGain,
            DEFAULT_DESIRED_SETTINGS.degaussGain
        );
        desiredSettings.collapseGain = readNumber(
            parsed.collapseGain,
            DEFAULT_DESIRED_SETTINGS.collapseGain
        );
        desiredSettings.dischargeGain = readNumber(
            parsed.dischargeGain,
            DEFAULT_DESIRED_SETTINGS.dischargeGain
        );
        desiredSettings.scanlineEnabled = readBoolean(
            parsed.scanlineEnabled,
            DEFAULT_DESIRED_SETTINGS.scanlineEnabled
        );
        desiredSettings.humEnabled = readBoolean(
            parsed.humEnabled,
            DEFAULT_DESIRED_SETTINGS.humEnabled
        );
        desiredSettings.rectifierEnabled = readBoolean(
            parsed.rectifierEnabled,
            DEFAULT_DESIRED_SETTINGS.rectifierEnabled
        );

        refreshDesiredTimingStandard(desiredSettings.baseFrequencyHz);
    } catch {
        // Ignore storage failures and malformed data.
    }
}

function resetDesiredSettingsToDefaults(): void {
    desiredSettings.timingStandard = DEFAULT_DESIRED_SETTINGS.timingStandard;
    desiredSettings.baseFrequencyHz = DEFAULT_DESIRED_SETTINGS.baseFrequencyHz;
    desiredSettings.masterGain = DEFAULT_DESIRED_SETTINGS.masterGain;
    desiredSettings.scanlineGain = DEFAULT_DESIRED_SETTINGS.scanlineGain;
    desiredSettings.humGain = DEFAULT_DESIRED_SETTINGS.humGain;
    desiredSettings.rectifierGain = DEFAULT_DESIRED_SETTINGS.rectifierGain;
    desiredSettings.degaussGain = DEFAULT_DESIRED_SETTINGS.degaussGain;
    desiredSettings.collapseGain = DEFAULT_DESIRED_SETTINGS.collapseGain;
    desiredSettings.dischargeGain = DEFAULT_DESIRED_SETTINGS.dischargeGain;
    desiredSettings.scanlineEnabled = DEFAULT_DESIRED_SETTINGS.scanlineEnabled;
    desiredSettings.humEnabled = DEFAULT_DESIRED_SETTINGS.humEnabled;
    desiredSettings.rectifierEnabled = DEFAULT_DESIRED_SETTINGS.rectifierEnabled;
}

function getAudioContext(): AudioContext {
    if (sharedAudioContext !== null) {
        return sharedAudioContext;
    }

    sharedAudioContext = new AudioContext();
    return sharedAudioContext;
}

function ensureSynth(): crtN.CrtNoiseSynth {
    if (crtSynth !== null) {
        return crtSynth;
    }

    crtSynth = new crtN.CrtNoiseSynth(getAudioContext(), {
        timingStandard: desiredSettings.timingStandard,
        baseFrequencyHz: desiredSettings.baseFrequencyHz,
        masterGain: desiredSettings.masterGain,
        scanlineGain: desiredSettings.scanlineGain,
        humGain: desiredSettings.humGain,
        rectifierGain: desiredSettings.rectifierGain,
        degaussGain: desiredSettings.degaussGain,
        collapseGain: desiredSettings.collapseGain,
        dischargeGain: desiredSettings.dischargeGain,
        scanlineEnabled: desiredSettings.scanlineEnabled,
        humEnabled: desiredSettings.humEnabled,
        rectifierEnabled: desiredSettings.rectifierEnabled
    });

    return crtSynth;
}

function applyDesiredSettingsToLiveSynth(): void {
    if (crtSynth === null) {
        return;
    }

    crtSynth.setPresetStandard(desiredSettings.timingStandard);
    crtSynth.setBaseFrequencyHz(desiredSettings.baseFrequencyHz);
    crtSynth.setMasterGain(desiredSettings.masterGain);
    crtSynth.setScanlineGain(desiredSettings.scanlineGain);
    crtSynth.setHumGain(desiredSettings.humGain);
    crtSynth.setRectifierGain(desiredSettings.rectifierGain);
    crtSynth.setDegaussGain(desiredSettings.degaussGain);
    crtSynth.setCollapseGain(desiredSettings.collapseGain);
    crtSynth.setDischargeGain(desiredSettings.dischargeGain);
    crtSynth.setScanlineEnabled(desiredSettings.scanlineEnabled);
    crtSynth.setHumEnabled(desiredSettings.humEnabled);
    crtSynth.setRectifierEnabled(desiredSettings.rectifierEnabled);
}

function refreshDesiredTimingStandard(baseFrequencyHz: number): void {
    const displayStandard = crtN.displayStandardFromBaseFrequency(baseFrequencyHz);

    desiredSettings.timingStandard = displayStandard === 'NONE'
        ? crtN.deriveTimingStandardFromBaseFrequency(
            baseFrequencyHz,
            desiredSettings.timingStandard
        )
        : displayStandard;
}

function buildStateFromDesiredSettings(): crtN.CrtNoiseState {
    const displayStandard = crtN.displayStandardFromBaseFrequency(desiredSettings.baseFrequencyHz);
    const timingStandard = displayStandard === 'NONE'
        ? crtN.deriveTimingStandardFromBaseFrequency(
            desiredSettings.baseFrequencyHz,
            desiredSettings.timingStandard
        )
        : displayStandard;

    return {
        running: false,
        timingStandard,
        displayStandard,
        baseFrequencyHz: desiredSettings.baseFrequencyHz,
        lineFrequencyHz: crtN.calculateLineFrequencyHz(
            timingStandard,
            desiredSettings.baseFrequencyHz
        ),
        masterGain: desiredSettings.masterGain,
        scanlineGain: desiredSettings.scanlineGain,
        humGain: desiredSettings.humGain,
        rectifierGain: desiredSettings.rectifierGain,
        degaussGain: desiredSettings.degaussGain,
        collapseGain: desiredSettings.collapseGain,
        dischargeGain: desiredSettings.dischargeGain,
        scanlineEnabled: desiredSettings.scanlineEnabled,
        humEnabled: desiredSettings.humEnabled,
        rectifierEnabled: desiredSettings.rectifierEnabled
    };
}

loadDesiredSettings();

export async function powerOnCrt(
    options: StartCrtNoiseOptions = {}
): Promise<crtN.CrtNoiseState> {
    if (options.standard !== undefined) {
        desiredSettings.timingStandard = options.standard;
        desiredSettings.baseFrequencyHz = crtN.defaultBaseFrequencyForStandard(options.standard);
    }

    if (options.baseFrequencyHz !== undefined) {
        desiredSettings.baseFrequencyHz = options.baseFrequencyHz;
        refreshDesiredTimingStandard(options.baseFrequencyHz);
    }

    if (options.masterGain !== undefined) {
        desiredSettings.masterGain = options.masterGain;
    }

    if (options.scanlineGain !== undefined) {
        desiredSettings.scanlineGain = options.scanlineGain;
    }

    if (options.humGain !== undefined) {
        desiredSettings.humGain = options.humGain;
    }

    if (options.rectifierGain !== undefined) {
        desiredSettings.rectifierGain = options.rectifierGain;
    }

    if (options.degaussGain !== undefined) {
        desiredSettings.degaussGain = options.degaussGain;
    }

    if (options.collapseGain !== undefined) {
        desiredSettings.collapseGain = options.collapseGain;
    }

    if (options.dischargeGain !== undefined) {
        desiredSettings.dischargeGain = options.dischargeGain;
    }

    if (options.scanlineEnabled !== undefined) {
        desiredSettings.scanlineEnabled = options.scanlineEnabled;
    }

    if (options.humEnabled !== undefined) {
        desiredSettings.humEnabled = options.humEnabled;
    }

    if (options.rectifierEnabled !== undefined) {
        desiredSettings.rectifierEnabled = options.rectifierEnabled;
    }

    persistDesiredSettings();

    const audioContext = getAudioContext();
    await audioContext.resume();

    const synth = ensureSynth();
    applyDesiredSettingsToLiveSynth();
    synth.start();

    return synth.getState();
}

export function powerOffCrt(): crtN.CrtNoiseState {
    if (crtSynth === null) {
        return buildStateFromDesiredSettings();
    }

    crtSynth.powerOff();
    return crtSynth.getState();
}

export async function toggleCrtPower(): Promise<crtN.CrtNoiseState> {
    if (crtSynth !== null && crtSynth.isRunning()) {
        return powerOffCrt();
    }

    return powerOnCrt();
}

export function triggerCrtDegauss(): crtN.CrtNoiseState {
    if (crtSynth !== null) {
        crtSynth.triggerDegauss();
        return crtSynth.getState();
    }

    return buildStateFromDesiredSettings();
}

export function restoreCrtDefaults(): crtN.CrtNoiseState {
    resetDesiredSettingsToDefaults();
    applyDesiredSettingsToLiveSynth();
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtVideoStandard(standard: crtN.VideoStandard): crtN.CrtNoiseState {
    desiredSettings.timingStandard = standard;
    desiredSettings.baseFrequencyHz = crtN.defaultBaseFrequencyForStandard(standard);

    if (crtSynth !== null) {
        crtSynth.setPresetStandard(standard);
    }

    applyDesiredSettingsToLiveSynth();
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtBaseFrequencyHz(baseFrequencyHz: number): crtN.CrtNoiseState {
    desiredSettings.baseFrequencyHz = baseFrequencyHz;
    refreshDesiredTimingStandard(baseFrequencyHz);

    if (crtSynth !== null) {
        crtSynth.setPresetStandard(desiredSettings.timingStandard);
        crtSynth.setBaseFrequencyHz(baseFrequencyHz);
    }

    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtMasterGain(masterGain: number): crtN.CrtNoiseState {
    desiredSettings.masterGain = masterGain;
    crtSynth?.setMasterGain(masterGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtScanlineGain(scanlineGain: number): crtN.CrtNoiseState {
    desiredSettings.scanlineGain = scanlineGain;
    crtSynth?.setScanlineGain(scanlineGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtHumGain(humGain: number): crtN.CrtNoiseState {
    desiredSettings.humGain = humGain;
    crtSynth?.setHumGain(humGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtRectifierGain(rectifierGain: number): crtN.CrtNoiseState {
    desiredSettings.rectifierGain = rectifierGain;
    crtSynth?.setRectifierGain(rectifierGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtDegaussGain(degaussGain: number): crtN.CrtNoiseState {
    desiredSettings.degaussGain = degaussGain;
    crtSynth?.setDegaussGain(degaussGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtCollapseGain(collapseGain: number): crtN.CrtNoiseState {
    desiredSettings.collapseGain = collapseGain;
    crtSynth?.setCollapseGain(collapseGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtDischargeGain(dischargeGain: number): crtN.CrtNoiseState {
    desiredSettings.dischargeGain = dischargeGain;
    crtSynth?.setDischargeGain(dischargeGain);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtScanlineEnabled(enabled: boolean): crtN.CrtNoiseState {
    desiredSettings.scanlineEnabled = enabled;
    crtSynth?.setScanlineEnabled(enabled);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtHumEnabled(enabled: boolean): crtN.CrtNoiseState {
    desiredSettings.humEnabled = enabled;
    crtSynth?.setHumEnabled(enabled);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function setCrtRectifierEnabled(enabled: boolean): crtN.CrtNoiseState {
    desiredSettings.rectifierEnabled = enabled;
    crtSynth?.setRectifierEnabled(enabled);
    persistDesiredSettings();
    return getCrtNoiseState();
}

export function isCrtPoweredOn(): boolean {
    return crtSynth?.isRunning() ?? false;
}

export function getCrtAnalyserNode(): AnalyserNode | null {
    return crtSynth?.getAnalyserNode() ?? null;
}

export function getCrtNoiseState(): crtN.CrtNoiseState {
    if (crtSynth !== null) {
        return crtSynth.getState();
    }

    return buildStateFromDesiredSettings();
}