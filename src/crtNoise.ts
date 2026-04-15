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

interface Prof {
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

interface RtState {
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

interface Opts {
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

interface Voice {
    oscillator: OscillatorNode;
    gainNode: GainNode;
}

interface HarmVoice extends Voice {
    harmonicIndex: number;
}

interface SideVoice extends Voice {
    sidebandIndex: number;
    direction: 1 | -1;
}

interface ShotVoice extends Voice {
    ended: boolean;
}

interface SweepOpts {
    startTimeSeconds: number;
    durationSeconds: number;
    startFrequencyHz: number;
    endFrequencyHz: number;
    peakGain: number;
    attackSeconds: number;
}

interface BurstOpts {
    startTimeSeconds: number;
    durationSeconds: number;
    attackSeconds: number;
    peakGain: number;
    highpassFrequencyHz: number;
    lowpassFrequencyHz: number;
    bandpassFrequencyHz: number;
    bandpassQ: number;
}

const EPS = 0.000_001;

const profByStd: Record<VideoStandard, Prof> = {
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
function normGain(value: number): number {
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
function normBaseHz(value: number): number {
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
function freqFromBase(baseFrequencyHz: number, multiple: number): number {
    return baseFrequencyHz * multiple;
}

/**
 * Converts cycles to seconds using the base freq.
 * @param {number} baseFrequencyHz
 * @param {number} cycles
 * @returns {number}
 */
function cyclesToSecs(baseFrequencyHz: number, cycles: number): number {
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

export class CrtNoiseSynth {
    private readonly ctx: AudioContext;
    private readonly dest: AudioNode;
    private readonly an: AnalyserNode;
    private readonly master: GainNode;
    private readonly scan: GainNode;
    private readonly hum: GainNode;
    private readonly rect: GainNode;
    private readonly deg: GainNode;
    private readonly coll: GainNode;
    private readonly dis: GainNode;

    private readonly lineV: HarmVoice[] = [];
    private readonly humV: HarmVoice[] = [];
    private readonly rectV: HarmVoice[] = [];
    private readonly sideV: SideVoice[] = [];
    private readonly shotV: ShotVoice[] = [];

    private disTid: number | null = null;

    private st: RtState;

    /**
     * Wires the synth up and hooks the buses together.
     * Very glamorous, loads of beeps.
     * @param {AudioContext} audioContext
     * @param {Opts} options
     */
    public constructor(audioContext: AudioContext, options: Opts = {}) {
        this.ctx = audioContext;
        this.dest = options.destination ?? audioContext.destination;

        const timingStandard = options.timingStandard ?? 'PAL';
        const baseFrequencyHz = normBaseHz(
            options.baseFrequencyHz ?? defaultBaseFrequencyForStandard(timingStandard)
        );

        this.st = {
            timingStandard,
            displayStandard: displayStandardFromBaseFrequency(baseFrequencyHz),
            baseFrequencyHz,
            running: false,
            masterGain: normGain(options.masterGain ?? 1),
            scanlineGain: normGain(options.scanlineGain ?? 1),
            humGain: normGain(options.humGain ?? 0.1),
            rectifierGain: normGain(options.rectifierGain ?? 0.1),
            degaussGain: normGain(options.degaussGain ?? 0.5),
            collapseGain: normGain(options.collapseGain ?? 0.35),
            dischargeGain: normGain(options.dischargeGain ?? 0.6),
            scanlineEnabled: options.scanlineEnabled ?? true,
            humEnabled: options.humEnabled ?? true,
            rectifierEnabled: options.rectifierEnabled ?? true
        };

        this.master = audioContext.createGain();
        this.scan = audioContext.createGain();
        this.hum = audioContext.createGain();
        this.rect = audioContext.createGain();
        this.deg = audioContext.createGain();
        this.coll = audioContext.createGain();
        this.dis = audioContext.createGain();
        this.an = audioContext.createAnalyser();

        this.an.fftSize = 4096;
        this.an.minDecibels = -110;
        this.an.maxDecibels = -20;
        this.an.smoothingTimeConstant = 0;

        this.scan.connect(this.master);
        this.hum.connect(this.master);
        this.rect.connect(this.master);
        this.deg.connect(this.master);
        this.coll.connect(this.master);
        this.dis.connect(this.master);
        this.master.connect(this.an);
        this.an.connect(this.dest);

        const now = this.ctx.currentTime;

        this.master.gain.setValueAtTime(
            Math.max(this.st.masterGain, EPS),
            now
        );

        this.scan.gain.setValueAtTime(EPS, now);
        this.hum.gain.setValueAtTime(EPS, now);
        this.rect.gain.setValueAtTime(EPS, now);

        this.deg.gain.setValueAtTime(
            Math.max(this.st.degaussGain, EPS),
            now
        );
        this.coll.gain.setValueAtTime(
            Math.max(this.st.collapseGain, EPS),
            now
        );
        this.dis.gain.setValueAtTime(
            Math.max(this.st.dischargeGain, EPS),
            now
        );
    }

    /**
     * Gives back the analyser node for plots and bits.
     * @returns {AnalyserNode}
     */
    public getAnalyserNode(): AnalyserNode {
        return this.an;
    }

    /**
     * Tells you if the steady layer stack is running.
     * @returns {boolean}
     */
    public isRunning(): boolean {
        return this.st.running;
    }

    /**
     * Current synth state snapshot.
     * @returns {CrtNoiseState}
     */
    public getState(): CrtNoiseState {
        return {
            running: this.st.running,
            timingStandard: this.st.timingStandard,
            displayStandard: this.st.displayStandard,
            baseFrequencyHz: this.st.baseFrequencyHz,
            lineFrequencyHz: calculateLineFrequencyHz(
                this.st.timingStandard,
                this.st.baseFrequencyHz
            ),
            masterGain: this.st.masterGain,
            scanlineGain: this.st.scanlineGain,
            humGain: this.st.humGain,
            rectifierGain: this.st.rectifierGain,
            degaussGain: this.st.degaussGain,
            collapseGain: this.st.collapseGain,
            dischargeGain: this.st.dischargeGain,
            scanlineEnabled: this.st.scanlineEnabled,
            humEnabled: this.st.humEnabled,
            rectifierEnabled: this.st.rectifierEnabled
        };
    }

    /**
     * Hard switches to a preset standard + its default freq.
     * @param {VideoStandard} standard
     * @returns {void}
     */
    public setPresetStandard(standard: VideoStandard): void {
        this.st.timingStandard = standard;
        this.st.baseFrequencyHz = defaultBaseFrequencyForStandard(standard);
        this.st.displayStandard = standard;

        const now = this.ctx.currentTime;
        this.syncSteadyFreqs(now);
    }

    /**
     * Sets base freq and updates the display/timing guess too.
     * @param {number} baseFrequencyHz
     * @returns {void}
     */
    public setBaseFrequencyHz(baseFrequencyHz: number): void {
        const nextBaseFrequencyHz = normBaseHz(baseFrequencyHz);
        const nextDisplayStandard = displayStandardFromBaseFrequency(nextBaseFrequencyHz);

        this.st.baseFrequencyHz = nextBaseFrequencyHz;
        this.st.displayStandard = nextDisplayStandard;
        this.st.timingStandard = nextDisplayStandard === 'NONE'
            ? deriveTimingStandardFromBaseFrequency(
                nextBaseFrequencyHz,
                this.st.timingStandard
            )
            : nextDisplayStandard;

        const now = this.ctx.currentTime;
        this.syncSteadyFreqs(now);
    }

    /**
     * Master gain setter.
     * Smoothed a bit so it does not click your teeth out.
     * @param {number} masterGain
     * @returns {void}
     */
    public setMasterGain(masterGain: number): void {
        this.st.masterGain = normGain(masterGain);

        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(
            Math.max(this.st.masterGain, EPS),
            now,
            0.01
        );
    }

    /**
     * Scanline layer gain.
     * @param {number} scanlineGain
     * @returns {void}
     */
    public setScanlineGain(scanlineGain: number): void {
        this.st.scanlineGain = normGain(scanlineGain);
        this.syncBusGains(this.ctx.currentTime);
    }

    /**
     * Hum layer gain.
     * @param {number} humGain
     * @returns {void}
     */
    public setHumGain(humGain: number): void {
        this.st.humGain = normGain(humGain);
        this.syncBusGains(this.ctx.currentTime);
    }

    /**
     * Rectifier layer gain.
     * @param {number} rectifierGain
     * @returns {void}
     */
    public setRectifierGain(rectifierGain: number): void {
        this.st.rectifierGain = normGain(rectifierGain);
        this.syncBusGains(this.ctx.currentTime);
    }

    /**
     * Degauss bus gain.
     * @param {number} degaussGain
     * @returns {void}
     */
    public setDegaussGain(degaussGain: number): void {
        this.st.degaussGain = normGain(degaussGain);

        const now = this.ctx.currentTime;
        this.deg.gain.cancelScheduledValues(now);
        this.deg.gain.setTargetAtTime(
            Math.max(this.st.degaussGain, EPS),
            now,
            0.01
        );
    }

    /**
     * Collapse bus gain.
     * @param {number} collapseGain
     * @returns {void}
     */
    public setCollapseGain(collapseGain: number): void {
        this.st.collapseGain = normGain(collapseGain);

        const now = this.ctx.currentTime;
        this.coll.gain.cancelScheduledValues(now);
        this.coll.gain.setTargetAtTime(
            Math.max(this.st.collapseGain, EPS),
            now,
            0.01
        );
    }

    /**
     * Discharge bus gain.
     * @param {number} dischargeGain
     * @returns {void}
     */
    public setDischargeGain(dischargeGain: number): void {
        this.st.dischargeGain = normGain(dischargeGain);

        const now = this.ctx.currentTime;
        this.dis.gain.cancelScheduledValues(now);
        this.dis.gain.setTargetAtTime(
            Math.max(this.st.dischargeGain, EPS),
            now,
            0.01
        );
    }

    /**
     * Enables or mutes scanlines.
     * @param {boolean} enabled
     * @returns {void}
     */
    public setScanlineEnabled(enabled: boolean): void {
        this.st.scanlineEnabled = enabled;
        this.syncBusGains(this.ctx.currentTime);
    }

    /**
     * Enables or mutes hum.
     * @param {boolean} enabled
     * @returns {void}
     */
    public setHumEnabled(enabled: boolean): void {
        this.st.humEnabled = enabled;
        this.syncBusGains(this.ctx.currentTime);
    }

    /**
     * Enables or mutes rectifier.
     * @param {boolean} enabled
     * @returns {void}
     */
    public setRectifierEnabled(enabled: boolean): void {
        this.st.rectifierEnabled = enabled;
        this.syncBusGains(this.ctx.currentTime);
    }

    /**
     * Starts the steady voices and kicks degauss once.
     * @returns {void}
     */
    public start(): void {
        this.clearDischargeTimer();

        if (this.st.running) {
            return;
        }

        const startTimeSeconds = this.ctx.currentTime + 0.01;

        this.st.running = true;
        this.mkSteadyVoices(startTimeSeconds);
        this.syncBusGains(startTimeSeconds);
        this.syncSteadyFreqs(startTimeSeconds);
        this.runDegauss(startTimeSeconds, 1);
    }

    /**
     * Powers off, does the collapse thump, then later the cap discharge.
     * @returns {void}
     */
    public powerOff(): void {
        this.clearDischargeTimer();

        if (!this.st.running) {
            return;
        }

        const profile = profByStd[this.st.timingStandard];
        const powerOffStartSeconds = this.ctx.currentTime + 0.005;
        const fadeEndSeconds = powerOffStartSeconds + (
            profile.collapseDurationMilliseconds / 1000
        );

        this.runCollapse(powerOffStartSeconds);
        this.fadeBusesOut(powerOffStartSeconds, fadeEndSeconds);
        this.stopSteadyLater(fadeEndSeconds + 0.03);
        this.schedDischarge(profile.capacitorDischargeDelayMilliseconds);

        this.st.running = false;
    }

    /**
     * Re-triggers degauss while running.
     * @returns {void}
     */
    public triggerDegauss(): void {
        if (!this.st.running) {
            return;
        }

        const startTimeSeconds = this.ctx.currentTime + 0.005;
        this.runDegauss(startTimeSeconds, 1);
    }

    /**
     * Builds the degauss burst stuff.
     * Hums, resonances, little knock, the lot.
     * @param {number} startTimeSeconds
     * @param {number} amplitudeScale
     * @returns {void}
     */
    private runDegauss(
        startTimeSeconds: number,
        amplitudeScale: number
    ): void {
        const profile = profByStd[this.st.timingStandard];
        const degaussDurationSeconds = cyclesToSecs(
            this.st.baseFrequencyHz,
            profile.degaussDurationCycles
        );
        const attackSeconds = cyclesToSecs(
            this.st.baseFrequencyHz,
            profile.degaussAttackCycles
        );

        for (const harmonic of profile.degaussHarmonics) {
            const frequencyHz = freqFromBase(
                this.st.baseFrequencyHz,
                harmonic.multiple
            );

            this.mkShot(
                this.deg,
                startTimeSeconds,
                frequencyHz,
                harmonic.amplitude * amplitudeScale,
                attackSeconds,
                degaussDurationSeconds
            );
        }

        for (const resonance of profile.degaussResonances) {
            const frequencyHz = freqFromBase(
                this.st.baseFrequencyHz,
                resonance.multiple
            );
            const durationSeconds = Math.min(
                degaussDurationSeconds,
                cyclesToSecs(this.st.baseFrequencyHz, resonance.decayCycles * 4)
            );

            this.mkShot(
                this.deg,
                startTimeSeconds,
                frequencyHz,
                resonance.amplitude * amplitudeScale,
                attackSeconds * 0.6,
                durationSeconds
            );
        }

        const knockDurationSeconds = cyclesToSecs(this.st.baseFrequencyHz, 2.6);

        for (const harmonic of profile.knockHarmonics) {
            const frequencyHz = freqFromBase(
                this.st.baseFrequencyHz,
                harmonic.multiple
            );

            this.mkShot(
                this.deg,
                startTimeSeconds,
                frequencyHz,
                harmonic.amplitude * amplitudeScale,
                attackSeconds * 0.35,
                knockDurationSeconds
            );
        }
    }

    /**
     * Makes the power-off sweepy collapse sounds.
     * @param {number} startTimeSeconds
     * @returns {void}
     */
    private runCollapse(startTimeSeconds: number): void {
        const profile = profByStd[this.st.timingStandard];
        const lineFrequencyHz = calculateLineFrequencyHz(
            this.st.timingStandard,
            this.st.baseFrequencyHz
        );
        const collapseDurationSeconds = profile.collapseDurationMilliseconds / 1000;

        this.mkSweep(
            this.coll,
            {
                startTimeSeconds,
                durationSeconds: collapseDurationSeconds * 0.72,
                startFrequencyHz: lineFrequencyHz,
                endFrequencyHz: Math.max(lineFrequencyHz * 0.46, 1400),
                peakGain: 0.085 * Math.max(this.st.scanlineGain, 0.35),
                attackSeconds: 0.0015
            }
        );

        this.mkSweep(
            this.coll,
            {
                startTimeSeconds: startTimeSeconds + 0.006,
                durationSeconds: collapseDurationSeconds,
                startFrequencyHz: Math.max(lineFrequencyHz * 0.38, 2600),
                endFrequencyHz: Math.max(lineFrequencyHz * 0.11, 380),
                peakGain: 0.040 * Math.max(this.st.scanlineGain, 0.35),
                attackSeconds: 0.002
            }
        );

        this.mkNoiseBurst(
            this.coll,
            {
                startTimeSeconds: startTimeSeconds + 0.001,
                durationSeconds: collapseDurationSeconds * 0.36,
                attackSeconds: 0.00025,
                peakGain: 0.018,
                highpassFrequencyHz: 900,
                lowpassFrequencyHz: 7000,
                bandpassFrequencyHz: 2600,
                bandpassQ: 0.9
            }
        );
    }

    /**
     * Schedules the later capacitor pop.
     * delayed neko, basically.
     * @param {number} delayMilliseconds
     * @returns {void}
     */
    private schedDischarge(delayMilliseconds: number): void {
        this.clearDischargeTimer();

        /**
         * Fires the delayed discharge tick.
         * @returns {void}
         */
        const fire = (): void => {
            this.disTid = null;
            this.runDischarge(this.ctx.currentTime + 0.005);
        };

        this.disTid = window.setTimeout(fire, delayMilliseconds);
    }

    /**
     * Clears the pending discharge timer if there is one.
     * @returns {void}
     */
    private clearDischargeTimer(): void {
        if (this.disTid === null) {
            return;
        }

        window.clearTimeout(this.disTid);
        this.disTid = null;
    }

    /**
     * Makes the sharp noisy discharge bits.
     * @param {number} startTimeSeconds
     * @returns {void}
     */
    private runDischarge(startTimeSeconds: number): void {
        this.mkNoiseBurst(
            this.dis,
            {
                startTimeSeconds,
                durationSeconds: 0.0018,
                attackSeconds: 0.00003,
                peakGain: 0.72,
                highpassFrequencyHz: 4200,
                lowpassFrequencyHz: 18000,
                bandpassFrequencyHz: 10800,
                bandpassQ: 1.15
            }
        );

        this.mkNoiseBurst(
            this.dis,
            {
                startTimeSeconds: startTimeSeconds + 0.00055,
                durationSeconds: 0.0012,
                attackSeconds: 0.00003,
                peakGain: 0.22,
                highpassFrequencyHz: 5200,
                lowpassFrequencyHz: 19000,
                bandpassFrequencyHz: 12500,
                bandpassQ: 1.45
            }
        );

        this.mkNoiseBurst(
            this.dis,
            {
                startTimeSeconds: startTimeSeconds + 0.0012,
                durationSeconds: 0.0034,
                attackSeconds: 0.00008,
                peakGain: 100,
                highpassFrequencyHz: 1800,
                lowpassFrequencyHz: 8500,
                bandpassFrequencyHz: 3500,
                bandpassQ: 0.8
            }
        );
    }

    /**
     * Allocates the steady oscillators for all the continuous layers.
     * @param {number} startTimeSeconds
     * @returns {void}
     */
    private mkSteadyVoices(startTimeSeconds: number): void {
        const profile = profByStd[this.st.timingStandard];

        for (let harmonicIndex = 0; harmonicIndex < profile.lineHarmonics.length; harmonicIndex += 1) {
            const oscillator = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(EPS, startTimeSeconds);
            oscillator.connect(gainNode);
            gainNode.connect(this.scan);
            oscillator.start(startTimeSeconds);

            this.lineV.push({
                oscillator,
                gainNode,
                harmonicIndex
            });
        }

        for (let sidebandIndex = 0; sidebandIndex < profile.sidebands.length; sidebandIndex += 1) {
            for (const direction of [1, -1] as const) {
                const oscillator = this.ctx.createOscillator();
                const gainNode = this.ctx.createGain();

                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(EPS, startTimeSeconds);
                oscillator.connect(gainNode);
                gainNode.connect(this.scan);
                oscillator.start(startTimeSeconds);

                this.sideV.push({
                    oscillator,
                    gainNode,
                    sidebandIndex,
                    direction
                });
            }
        }

        for (let harmonicIndex = 0; harmonicIndex < profile.humHarmonics.length; harmonicIndex += 1) {
            const oscillator = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(EPS, startTimeSeconds);
            oscillator.connect(gainNode);
            gainNode.connect(this.hum);
            oscillator.start(startTimeSeconds);

            this.humV.push({
                oscillator,
                gainNode,
                harmonicIndex
            });
        }

        for (let harmonicIndex = 0; harmonicIndex < profile.rectifierHarmonics.length; harmonicIndex += 1) {
            const oscillator = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();

            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(EPS, startTimeSeconds);
            oscillator.connect(gainNode);
            gainNode.connect(this.rect);
            oscillator.start(startTimeSeconds);

            this.rectV.push({
                oscillator,
                gainNode,
                harmonicIndex
            });
        }
    }

    /**
     * Recomputes steady voice freqs and gains after a setting change.
     * @param {number} atTimeSeconds
     * @returns {void}
     */
    private syncSteadyFreqs(atTimeSeconds: number): void {
        const profile = profByStd[this.st.timingStandard];
        const lineFrequencyHz = calculateLineFrequencyHz(
            this.st.timingStandard,
            this.st.baseFrequencyHz
        );

        for (const voice of this.lineV) {
            const harmonic = profile.lineHarmonics[voice.harmonicIndex];
            const sign = harmonic.multiple % 2 === 0 ? -1 : 1;
            const frequencyHz = lineFrequencyHz * harmonic.multiple;

            this.syncVoice(
                voice,
                frequencyHz,
                harmonic.amplitude * sign,
                atTimeSeconds
            );
        }

        for (const voice of this.sideV) {
            const sideband = profile.sidebands[voice.sidebandIndex];
            const carrierFrequencyHz = lineFrequencyHz * sideband.carrierMultiple;
            const offsetFrequencyHz = freqFromBase(
                this.st.baseFrequencyHz,
                sideband.offsetMultiple
            );
            const frequencyHz = carrierFrequencyHz + (offsetFrequencyHz * voice.direction);

            this.syncVoice(
                voice,
                frequencyHz,
                sideband.amplitude,
                atTimeSeconds
            );
        }

        for (const voice of this.humV) {
            const harmonic = profile.humHarmonics[voice.harmonicIndex];
            const frequencyHz = freqFromBase(
                this.st.baseFrequencyHz,
                harmonic.multiple
            );

            this.syncVoice(
                voice,
                frequencyHz,
                harmonic.amplitude,
                atTimeSeconds
            );
        }

        for (const voice of this.rectV) {
            const harmonic = profile.rectifierHarmonics[voice.harmonicIndex];
            const frequencyHz = freqFromBase(
                this.st.baseFrequencyHz,
                harmonic.multiple
            );

            this.syncVoice(
                voice,
                frequencyHz,
                harmonic.amplitude,
                atTimeSeconds
            );
        }
    }

    /**
     * Updates one voice, or hushes it if the freq is out of range.
     * @param {Voice} voice
     * @param {number} frequencyHz
     * @param {number} gainValue
     * @param {number} atTimeSeconds
     * @returns {void}
     */
    private syncVoice(
        voice: Voice,
        frequencyHz: number,
        gainValue: number,
        atTimeSeconds: number
    ): void {
        if (!this.canPlayFreq(frequencyHz)) {
            voice.gainNode.gain.cancelScheduledValues(atTimeSeconds);
            voice.gainNode.gain.setTargetAtTime(EPS, atTimeSeconds, 0.01);
            return;
        }

        voice.oscillator.frequency.cancelScheduledValues(atTimeSeconds);
        voice.oscillator.frequency.setTargetAtTime(frequencyHz, atTimeSeconds, 0.01);

        voice.gainNode.gain.cancelScheduledValues(atTimeSeconds);
        voice.gainNode.gain.setTargetAtTime(
            Math.max(Math.abs(gainValue), EPS),
            atTimeSeconds,
            0.01
        );
    }

    /**
     * Syncs the layer buses to running/enabled state and current gains.
     * @param {number} atTimeSeconds
     * @returns {void}
     */
    private syncBusGains(atTimeSeconds: number): void {
        const scanlineBusGain = this.st.running && this.st.scanlineEnabled
            ? Math.max(this.st.scanlineGain, EPS)
            : EPS;

        const humBusGain = this.st.running && this.st.humEnabled
            ? Math.max(this.st.humGain, EPS)
            : EPS;

        const rectifierBusGain = this.st.running && this.st.rectifierEnabled
            ? Math.max(this.st.rectifierGain, EPS)
            : EPS;

        this.scan.gain.cancelScheduledValues(atTimeSeconds);
        this.scan.gain.setTargetAtTime(scanlineBusGain, atTimeSeconds, 0.01);

        this.hum.gain.cancelScheduledValues(atTimeSeconds);
        this.hum.gain.setTargetAtTime(humBusGain, atTimeSeconds, 0.01);

        this.rect.gain.cancelScheduledValues(atTimeSeconds);
        this.rect.gain.setTargetAtTime(rectifierBusGain, atTimeSeconds, 0.01);

        this.deg.gain.cancelScheduledValues(atTimeSeconds);
        this.deg.gain.setTargetAtTime(
            Math.max(this.st.degaussGain, EPS),
            atTimeSeconds,
            0.01
        );

        this.coll.gain.cancelScheduledValues(atTimeSeconds);
        this.coll.gain.setTargetAtTime(
            Math.max(this.st.collapseGain, EPS),
            atTimeSeconds,
            0.01
        );

        this.dis.gain.cancelScheduledValues(atTimeSeconds);
        this.dis.gain.setTargetAtTime(
            Math.max(this.st.dischargeGain, EPS),
            atTimeSeconds,
            0.01
        );
    }

    /**
     * Fades the steady buses out on power-off.
     * @param {number} startTimeSeconds
     * @param {number} endTimeSeconds
     * @returns {void}
     */
    private fadeBusesOut(startTimeSeconds: number, endTimeSeconds: number): void {
        const activeScanlineGain = this.st.scanlineEnabled
            ? Math.max(this.st.scanlineGain, EPS)
            : EPS;

        const activeHumGain = this.st.humEnabled
            ? Math.max(this.st.humGain, EPS)
            : EPS;

        const activeRectifierGain = this.st.rectifierEnabled
            ? Math.max(this.st.rectifierGain, EPS)
            : EPS;

        this.scan.gain.cancelScheduledValues(startTimeSeconds);
        this.scan.gain.setValueAtTime(activeScanlineGain, startTimeSeconds);
        this.scan.gain.exponentialRampToValueAtTime(EPS, endTimeSeconds);

        this.hum.gain.cancelScheduledValues(startTimeSeconds);
        this.hum.gain.setValueAtTime(activeHumGain, startTimeSeconds);
        this.hum.gain.exponentialRampToValueAtTime(EPS, endTimeSeconds);

        this.rect.gain.cancelScheduledValues(startTimeSeconds);
        this.rect.gain.setValueAtTime(activeRectifierGain, startTimeSeconds);
        this.rect.gain.exponentialRampToValueAtTime(EPS, endTimeSeconds);
    }

    /**
     * Stops all the steady oscillators later, after the fade ends.
     * @param {number} stopTimeSeconds
     * @returns {void}
     */
    private stopSteadyLater(stopTimeSeconds: number): void {
        for (const voice of this.lineV) {
            voice.oscillator.stop(stopTimeSeconds);
        }

        for (const voice of this.sideV) {
            voice.oscillator.stop(stopTimeSeconds);
        }

        for (const voice of this.humV) {
            voice.oscillator.stop(stopTimeSeconds);
        }

        for (const voice of this.rectV) {
            voice.oscillator.stop(stopTimeSeconds);
        }

        this.lineV.length = 0;
        this.sideV.length = 0;
        this.humV.length = 0;
        this.rectV.length = 0;
    }

    /**
     * Makes a swept sine one-shot.
     * @param {GainNode} destinationBus
     * @param {SweepOpts} options
     * @returns {void}
     */
    private mkSweep(
        destinationBus: GainNode,
        options: SweepOpts
    ): void {
        if (options.durationSeconds <= 0) {
            return;
        }

        if (!this.canPlayFreq(options.startFrequencyHz)) {
            return;
        }

        if (!this.canPlayFreq(options.endFrequencyHz)) {
            return;
        }

        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        const stopTimeSeconds = options.startTimeSeconds + options.durationSeconds;
        const attackEndSeconds = options.startTimeSeconds + Math.min(
            options.attackSeconds,
            options.durationSeconds * 0.15
        );

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(options.startFrequencyHz, options.startTimeSeconds);
        oscillator.frequency.exponentialRampToValueAtTime(
            Math.max(options.endFrequencyHz, 1),
            stopTimeSeconds
        );

        gainNode.gain.setValueAtTime(EPS, options.startTimeSeconds);
        gainNode.gain.linearRampToValueAtTime(
            Math.max(options.peakGain, EPS),
            attackEndSeconds
        );
        gainNode.gain.exponentialRampToValueAtTime(EPS, stopTimeSeconds);

        oscillator.connect(gainNode);
        gainNode.connect(destinationBus);

        oscillator.start(options.startTimeSeconds);
        oscillator.stop(stopTimeSeconds + 0.02);

        const voice: ShotVoice = {
            oscillator,
            gainNode,
            ended: false
        };

        /**
         * Cleans this one-shot out once it finishes.
         * @returns {void}
         */
        const onEnd = (): void => {
            voice.ended = true;
            oscillator.disconnect();
            gainNode.disconnect();
            const index = this.shotV.indexOf(voice);

            if (index >= 0) {
                this.shotV.splice(index, 1);
            }
        };

        oscillator.addEventListener('ended', onEnd);

        this.shotV.push(voice);
    }

    /**
     * Makes a filtered little burst of noise.
     * @param {GainNode} destinationBus
     * @param {BurstOpts} options
     * @returns {void}
     */
    private mkNoiseBurst(
        destinationBus: GainNode,
        options: BurstOpts
    ): void {
        if (options.durationSeconds <= 0) {
            return;
        }

        const sampleCount = Math.max(
            1,
            Math.floor(this.ctx.sampleRate * options.durationSeconds)
        );

        const audioBuffer = this.ctx.createBuffer(
            1,
            sampleCount,
            this.ctx.sampleRate
        );

        const channel = audioBuffer.getChannelData(0);

        for (let index = 0; index < sampleCount; index += 1) {
            channel[index] = (Math.random() * 2) - 1;
        }

        const source = this.ctx.createBufferSource();
        source.buffer = audioBuffer;

        const highpassFilter = this.ctx.createBiquadFilter();
        highpassFilter.type = 'highpass';
        highpassFilter.frequency.setValueAtTime(
            options.highpassFrequencyHz,
            options.startTimeSeconds
        );
        highpassFilter.Q.setValueAtTime(0.707, options.startTimeSeconds);

        const bandpassFilter = this.ctx.createBiquadFilter();
        bandpassFilter.type = 'bandpass';
        bandpassFilter.frequency.setValueAtTime(
            options.bandpassFrequencyHz,
            options.startTimeSeconds
        );
        bandpassFilter.Q.setValueAtTime(
            options.bandpassQ,
            options.startTimeSeconds
        );

        const lowpassFilter = this.ctx.createBiquadFilter();
        lowpassFilter.type = 'lowpass';
        lowpassFilter.frequency.setValueAtTime(
            options.lowpassFrequencyHz,
            options.startTimeSeconds
        );
        lowpassFilter.Q.setValueAtTime(0.707, options.startTimeSeconds);

        const burstGain = this.ctx.createGain();
        const attackEndSeconds = options.startTimeSeconds + Math.min(
            options.attackSeconds,
            options.durationSeconds * 0.2
        );
        const stopTimeSeconds = options.startTimeSeconds + options.durationSeconds;

        burstGain.gain.setValueAtTime(EPS, options.startTimeSeconds);
        burstGain.gain.linearRampToValueAtTime(
            Math.max(options.peakGain, EPS),
            attackEndSeconds
        );
        burstGain.gain.exponentialRampToValueAtTime(EPS, stopTimeSeconds);

        source.connect(highpassFilter);
        highpassFilter.connect(bandpassFilter);
        bandpassFilter.connect(lowpassFilter);
        lowpassFilter.connect(burstGain);
        burstGain.connect(destinationBus);

        source.start(options.startTimeSeconds);
        source.stop(stopTimeSeconds + 0.002);

        /**
         * Tears the temporary filter chain down after playback.
         * @returns {void}
         */
        const onEnd = (): void => {
            source.disconnect();
            highpassFilter.disconnect();
            bandpassFilter.disconnect();
            lowpassFilter.disconnect();
            burstGain.disconnect();
        };

        source.addEventListener('ended', onEnd);
    }

    /**
     * Makes one decaying tone hit.
     * @param {GainNode} destinationBus
     * @param {number} startTimeSeconds
     * @param {number} frequencyHz
     * @param {number} peakGain
     * @param {number} attackSeconds
     * @param {number} durationSeconds
     * @returns {void}
     */
    private mkShot(
        destinationBus: GainNode,
        startTimeSeconds: number,
        frequencyHz: number,
        peakGain: number,
        attackSeconds: number,
        durationSeconds: number
    ): void {
        if (!this.canPlayFreq(frequencyHz)) {
            return;
        }

        if (durationSeconds <= 0) {
            return;
        }

        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        const peak = Math.max(Math.abs(peakGain), EPS);
        const attackEndSeconds = startTimeSeconds + Math.min(
            attackSeconds,
            durationSeconds * 0.3
        );
        const stopTimeSeconds = startTimeSeconds + durationSeconds;

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequencyHz, startTimeSeconds);

        gainNode.gain.setValueAtTime(EPS, startTimeSeconds);
        gainNode.gain.linearRampToValueAtTime(peak, attackEndSeconds);
        gainNode.gain.exponentialRampToValueAtTime(EPS, stopTimeSeconds);

        oscillator.connect(gainNode);
        gainNode.connect(destinationBus);

        const voice: ShotVoice = {
            oscillator,
            gainNode,
            ended: false
        };

        /**
         * Cleanup for the short tone once it is done yelling.
         * @returns {void}
         */
        const onEnd = (): void => {
            voice.ended = true;
            oscillator.disconnect();
            gainNode.disconnect();
            const index = this.shotV.indexOf(voice);

            if (index >= 0) {
                this.shotV.splice(index, 1);
            }
        };

        oscillator.addEventListener('ended', onEnd);

        oscillator.start(startTimeSeconds);
        oscillator.stop(stopTimeSeconds + 0.02);
        this.shotV.push(voice);
    }

    /**
     * Nyquist-ish guard so we do not ask the context for nonsense.
     * @param {number} frequencyHz
     * @returns {boolean}
     */
    private canPlayFreq(frequencyHz: number): boolean {
        const nyquistFrequencyHz = (this.ctx.sampleRate * 0.5) - 20;
        return frequencyHz > 0 && frequencyHz < nyquistFrequencyHz;
    }
}