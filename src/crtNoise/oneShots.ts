import { EPS } from "./config.ts";
import type { ShotVoice, SweepOpts, BurstOpts } from "./config.ts";
import { CrtNoiseSteady } from "./steady.ts";

export class CrtNoiseSynth extends CrtNoiseSteady {
    /**
     * Makes a swept sine one-shot.
     * @param {GainNode} destinationBus
     * @param {SweepOpts} options
     * @returns {void}
     */
    protected mkSweep(
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
    protected mkNoiseBurst(
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
    protected mkShot(
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
    protected canPlayFreq(frequencyHz: number): boolean {
        const nyquistFrequencyHz = (this.ctx.sampleRate * 0.5) - 20;
        return frequencyHz > 0 && frequencyHz < nyquistFrequencyHz;
    }
}
