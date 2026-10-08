import { EPS, profByStd, normGain, normBaseHz, defaultBaseFrequencyForStandard, displayStandardFromBaseFrequency, deriveTimingStandardFromBaseFrequency, calculateLineFrequencyHz } from "./config.ts";
import type { RtState, Opts, HarmVoice, SideVoice, ShotVoice, SweepOpts, BurstOpts } from "./config.ts";

export abstract class CrtNoiseCore {
    protected readonly ctx: AudioContext;
    protected readonly dest: AudioNode;
    protected readonly an: AnalyserNode;
    protected readonly master: GainNode;
    protected readonly scan: GainNode;
    protected readonly hum: GainNode;
    protected readonly rect: GainNode;
    protected readonly deg: GainNode;
    protected readonly coll: GainNode;
    protected readonly dis: GainNode;

    protected readonly lineV: HarmVoice[] = [];
    protected readonly humV: HarmVoice[] = [];
    protected readonly rectV: HarmVoice[] = [];
    protected readonly sideV: SideVoice[] = [];
    protected readonly shotV: ShotVoice[] = [];

    protected disTid: number | null = null;

    protected st: RtState;

    protected abstract syncSteadyFreqs(atTimeSeconds: number): void;
    protected abstract syncBusGains(atTimeSeconds: number): void;
    protected abstract clearDischargeTimer(): void;
    protected abstract mkSteadyVoices(startTimeSeconds: number): void;
    protected abstract runDegauss(startTimeSeconds: number, amplitudeScale: number): void;
    protected abstract runCollapse(startTimeSeconds: number): void;
    protected abstract fadeBusesOut(startTimeSeconds: number, endTimeSeconds: number): void;
    protected abstract stopSteadyLater(stopTimeSeconds: number): void;
    protected abstract schedDischarge(delayMilliseconds: number): void;
    protected abstract mkShot(destinationBus: GainNode, startTimeSeconds: number, frequencyHz: number, peakGain: number, attackSeconds: number, durationSeconds: number): void;
    protected abstract mkSweep(destinationBus: GainNode, options: SweepOpts): void;
    protected abstract mkNoiseBurst(destinationBus: GainNode, options: BurstOpts): void;
    protected abstract canPlayFreq(frequencyHz: number): boolean;

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

}
