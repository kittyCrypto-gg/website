import { profByStd, freqFromBase, cyclesToSecs, calculateLineFrequencyHz } from "./config.ts";
import { CrtNoiseCore } from "./core.ts";

export abstract class CrtNoiseTransitions extends CrtNoiseCore {
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
    protected runDegauss(
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
    protected runCollapse(startTimeSeconds: number): void {
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
    protected schedDischarge(delayMilliseconds: number): void {
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
    protected clearDischargeTimer(): void {
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
    protected runDischarge(startTimeSeconds: number): void {
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

}
