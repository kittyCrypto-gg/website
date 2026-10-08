export type VideoStandard = 'PAL' | 'NTSC';
export type StandardDisplay = VideoStandard | 'NONE';

interface HarmTone {
    multiple: number;
    amplitude: number;
}

interface SideTone {
    carrierMultiple: number;
    offsetMultiple: number;
    amplitude: number;
}

interface DampTone {
    multiple: number;
    amplitude: number;
    decayCycles: number;
}

export interface Prof {
    timingStandard: VideoStandard;
    defaultBaseFrequencyHz: number;
    lineFrequencyMultiplier: number;
    lineHarmonics: HarmTone[];
    sidebands: SideTone[];
    humHarmonics: HarmTone[];
    rectifierHarmonics: HarmTone[];
    degaussHarmonics: HarmTone[];
    degaussResonances: DampTone[];
    knockHarmonics: HarmTone[];
    degaussDurationCycles: number;
    degaussAttackCycles: number;
    collapseDurationMilliseconds: number;
    capacitorDischargeDelayMilliseconds: number;
}

export interface RtState {
    timingStandard: VideoStandard;
    displayStandard: StandardDisplay;
    baseFrequencyHz: number;
    running: boolean;
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

export interface Opts {
    timingStandard?: VideoStandard;
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
    destination?: AudioNode;
}

export interface Voice {
    oscillator: OscillatorNode;
    gainNode: GainNode;
}

export interface HarmVoice extends Voice {
    harmonicIndex: number;
}

export interface SideVoice extends Voice {
    sidebandIndex: number;
    direction: 1 | -1;
}

export interface ShotVoice extends Voice {
    ended: boolean;
}

export interface SweepOpts {
    startTimeSeconds: number;
    durationSeconds: number;
    startFrequencyHz: number;
    endFrequencyHz: number;
    peakGain: number;
    attackSeconds: number;
}

export interface BurstOpts {
    startTimeSeconds: number;
    durationSeconds: number;
    attackSeconds: number;
    peakGain: number;
    highpassFrequencyHz: number;
    lowpassFrequencyHz: number;
    bandpassFrequencyHz: number;
    bandpassQ: number;
}

export const EPS = 0.000_001;

export const profByStd: Record<VideoStandard, Prof> = {
    PAL: {
        timingStandard: 'PAL',
        defaultBaseFrequencyHz: 50,
        lineFrequencyMultiplier: 312.5,
        lineHarmonics: [
            { multiple: 1, amplitude: 0.55 },
            { multiple: 2, amplitude: 0.20 },
            { multiple: 3, amplitude: 0.09 },
            { multiple: 4, amplitude: 0.04 }
        ],
        sidebands: [
            { carrierMultiple: 1, offsetMultiple: 1, amplitude: 0.080 },
            { carrierMultiple: 1, offsetMultiple: 2, amplitude: 0.055 },
            { carrierMultiple: 2, offsetMultiple: 1, amplitude: 0.030 },
            { carrierMultiple: 2, offsetMultiple: 2, amplitude: 0.020 }
        ],
        humHarmonics: [
            { multiple: 1, amplitude: 0.020 },
            { multiple: 3, amplitude: 0.015 }
        ],
        rectifierHarmonics: [
            { multiple: 2, amplitude: 0.045 },
            { multiple: 4, amplitude: 0.010 }
        ],
        degaussHarmonics: [
            { multiple: 1, amplitude: 1.10 },
            { multiple: 2, amplitude: 0.68 },
            { multiple: 3, amplitude: 0.32 },
            { multiple: 4, amplitude: 0.16 },
            { multiple: 5, amplitude: 0.08 }
        ],
        degaussResonances: [
            { multiple: 1.90, amplitude: 0.42, decayCycles: 1.8 },
            { multiple: 3.64, amplitude: 0.22, decayCycles: 2.8 },
            { multiple: 6.40, amplitude: 0.11, decayCycles: 3.3 },
            { multiple: 11.20, amplitude: 0.05, decayCycles: 4.2 }
        ],
        knockHarmonics: [
            { multiple: 1.56, amplitude: 1.00 },
            { multiple: 2.92, amplitude: 0.55 },
            { multiple: 5.80, amplitude: 0.22 }
        ],
        degaussDurationCycles: 45,
        degaussAttackCycles: 0.35,
        collapseDurationMilliseconds: 135,
        capacitorDischargeDelayMilliseconds: 2400
    },
    NTSC: {
        timingStandard: 'NTSC',
        defaultBaseFrequencyHz: 60,
        lineFrequencyMultiplier: 262.5 * (1000 / 1001),
        lineHarmonics: [
            { multiple: 1, amplitude: 0.58 },
            { multiple: 2, amplitude: 0.22 },
            { multiple: 3, amplitude: 0.10 },
            { multiple: 4, amplitude: 0.045 }
        ],
        sidebands: [
            { carrierMultiple: 1, offsetMultiple: 1, amplitude: 0.085 },
            { carrierMultiple: 1, offsetMultiple: 2, amplitude: 0.060 },
            { carrierMultiple: 2, offsetMultiple: 1, amplitude: 0.032 },
            { carrierMultiple: 2, offsetMultiple: 2, amplitude: 0.022 }
        ],
        humHarmonics: [
            { multiple: 1, amplitude: 0.022 },
            { multiple: 3, amplitude: 0.016 }
        ],
        rectifierHarmonics: [
            { multiple: 2, amplitude: 0.048 },
            { multiple: 4, amplitude: 0.010 }
        ],
        degaussHarmonics: [
            { multiple: 1, amplitude: 1.18 },
            { multiple: 2, amplitude: 0.74 },
            { multiple: 3, amplitude: 0.36 },
            { multiple: 4, amplitude: 0.18 },
            { multiple: 5, amplitude: 0.09 }
        ],
        degaussResonances: [
            { multiple: 1.55, amplitude: 0.44, decayCycles: 2.1 },
            { multiple: 3.05, amplitude: 0.24, decayCycles: 3.3 },
            { multiple: 5.40, amplitude: 0.12, decayCycles: 4.0 },
            { multiple: 9.30, amplitude: 0.055, decayCycles: 5.0 }
        ],
        knockHarmonics: [
            { multiple: 1.30, amplitude: 1.00 },
            { multiple: 2.45, amplitude: 0.55 },
            { multiple: 4.90, amplitude: 0.22 }
        ],
        degaussDurationCycles: 49,
        degaussAttackCycles: 0.35,
        collapseDurationMilliseconds: 120,
        capacitorDischargeDelayMilliseconds: 2600
    }
};

/**
 * Keeps gain sane-ish.
 * NaN and rubbish just get shoved to 0 and we move on.
 * @param {number} value
 * @returns {number}
 */
export function normGain(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, value);
}

/**
 * Base freq guard rail.
 * Not exciting.
 * @param {number} value
 * @returns {number}
 */
export function normBaseHz(value: number): number {
    if (!Number.isFinite(value)) {
        return 50;
    }

    return Math.max(1, value);
}

/**
 * Base freq times some multiple..
 * @param {number} baseFrequencyHz
 * @param {number} multiple
 * @returns {number}
 */
export function freqFromBase(baseFrequencyHz: number, multiple: number): number {
    return baseFrequencyHz * multiple;
}

/**
 * Converts cycles to seconds using the base freq.
 * @param {number} baseFrequencyHz
 * @param {number} cycles
 * @returns {number}
 */
export function cyclesToSecs(baseFrequencyHz: number, cycles: number): number {
    return cycles / baseFrequencyHz;
}

/**
 * Checks if a freq is basically sitting on a preset.
 * @param {number} baseFrequencyHz
 * @param {number} presetHz
 * @returns {boolean}
 */
function isPresetHz(baseFrequencyHz: number, presetHz: number): boolean {
    return Math.abs(baseFrequencyHz - presetHz) < 0.000_1;
}

/**
 * Usual default mains-ish freq for a standard.
 * @param {VideoStandard} standard
 * @returns {number}
 */
export function defaultBaseFrequencyForStandard(standard: VideoStandard): number {
    return profByStd[standard].defaultBaseFrequencyHz;
}

/**
 * Derives the little display badge from the raw base freq.
 * @param {number} baseFrequencyHz
 * @returns {StandardDisplay}
 */
export function displayStandardFromBaseFrequency(baseFrequencyHz: number): StandardDisplay {
    if (isPresetHz(baseFrequencyHz, 50)) {
        return 'PAL';
    }

    if (isPresetHz(baseFrequencyHz, 60)) {
        return 'NTSC';
    }

    return 'NONE';
}

/**
 * Picks PAL or NTSC from the base freq unless it is right on the fence.
 * Then it just keeps the fallback.
 * @param {number} baseFrequencyHz
 * @param {VideoStandard} fallbackStandard
 * @returns {VideoStandard}
 */
export function deriveTimingStandardFromBaseFrequency(
    baseFrequencyHz: number,
    fallbackStandard: VideoStandard
): VideoStandard {
    if (baseFrequencyHz < 55) {
        return 'PAL';
    }

    if (baseFrequencyHz > 55) {
        return 'NTSC';
    }

    return fallbackStandard;
}

/**
 * Works out line freq from the timing standard + base freq.
 * @param {VideoStandard} timingStandard
 * @param {number} baseFrequencyHz
 * @returns {number}
 */
export function calculateLineFrequencyHz(
    timingStandard: VideoStandard,
    baseFrequencyHz: number
): number {
    const profile = profByStd[timingStandard];
    return normBaseHz(baseFrequencyHz) * profile.lineFrequencyMultiplier;
}

export interface CrtNoiseState {
    running: boolean;
    timingStandard: VideoStandard;
    displayStandard: StandardDisplay;
    baseFrequencyHz: number;
    lineFrequencyHz: number;
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
