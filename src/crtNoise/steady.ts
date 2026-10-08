import { EPS, profByStd, freqFromBase, calculateLineFrequencyHz } from "./config.ts";
import type { Voice } from "./config.ts";
import { CrtNoiseTransitions } from "./transitions.ts";

export abstract class CrtNoiseSteady extends CrtNoiseTransitions {
    /**
     * Allocates the steady oscillators for all the continuous layers.
     * @param {number} startTimeSeconds
     * @returns {void}
     */
    protected mkSteadyVoices(startTimeSeconds: number): void {
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
    protected syncSteadyFreqs(atTimeSeconds: number): void {
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
    protected syncVoice(
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
    protected syncBusGains(atTimeSeconds: number): void {
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
    protected fadeBusesOut(startTimeSeconds: number, endTimeSeconds: number): void {
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
    protected stopSteadyLater(stopTimeSeconds: number): void {
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

}
