import { audioTiming } from "./mediaTiming.ts";
import { buildSSML, paragraphSpeech } from "./speechText.ts";
import type {
    ReadAloudBuffer,
    ReadAloudReq,
    SpeechSdkNamespace,
    SpeechSynthesizer
} from "./types.ts";

export class AudioQueue {
    #activeSynths = new Set<SpeechSynthesizer>();
    #reqs = new Map<string, ReadAloudReq>();
    #bufs = new Map<string, ReadAloudBuffer>();
    #bufCap = 4;
    #reqSig: string | null = null;
    readonly #sdkReady: () => Promise<SpeechSdkNamespace>;

    constructor(sdkReady: () => Promise<SpeechSdkNamespace>) {
        this.#sdkReady = sdkReady;
    }

    #configSignature(): string {
        const state = window.readAloudState;

        return JSON.stringify({
            speechKey: state.speechKey,
            serviceRegion: state.serviceRegion,
            voiceName: state.voiceName,
            speechRate: state.speechRate
        });
    }

    #makeKey(idx: number): string | null {
        const state = window.readAloudState;
        if (idx < 0 || idx >= state.paragraphs.length) return null;

        const paragraph = state.paragraphs[idx] ?? null;
        const speech = paragraphSpeech(paragraph);
        if (!speech.plainText && !speech.ssmlBody) return null;

        return JSON.stringify({
            idx,
            speechKey: state.speechKey,
            serviceRegion: state.serviceRegion,
            voiceName: state.voiceName,
            speechRate: state.speechRate,
            plainText: speech.plainText,
            ssmlBody: speech.ssmlBody ?? ""
        });
    }

    #getBuffer(idx: number): ReadAloudBuffer | null {
        const key = this.#makeKey(idx);
        if (!key) return null;

        const hit = this.#bufs.get(key) ?? null;
        if (!hit) return null;

        this.#bufs.delete(key);
        this.#bufs.set(key, hit);
        window.readAloudState.buffer = hit;

        return hit;
    }

    #setBuffer(key: string, chunk: ReadAloudBuffer): void {
        this.#bufs.delete(key);
        this.#bufs.set(key, chunk);
        window.readAloudState.buffer = chunk;

        while (this.#bufs.size > this.#bufCap) {
            const first = this.#bufs.keys().next();
            if (first.done) break;
            this.#bufs.delete(first.value);
        }
    }

    dropBuffers(): void {
        this.#bufs.clear();
        window.readAloudState.buffer = null;
    }

    dropRequests(): void {
        const reqs = Array.from(this.#reqs.values());
        this.#reqs.clear();

        for (const req of reqs) {
            req.okAud(null);
            req.okTim(null);
        }
    }

    async sync(): Promise<void> {
        const signature = this.#configSignature();
        if (this.#reqSig === signature) return;

        await this.stopRequests();
        this.dropRequests();
        this.dropBuffers();
        this.#reqSig = signature;
    }

    #request(idx: number): ReadAloudReq | null {
        const state = window.readAloudState;
        if (idx < 0 || idx >= state.paragraphs.length) return null;

        const key = this.#makeKey(idx);
        if (!key) return null;
        if (this.#bufs.has(key)) return null;

        const live = this.#reqs.get(key);
        if (live) return live;

        const paragraph = state.paragraphs[idx] ?? null;
        const speech = paragraphSpeech(paragraph);
        if (!speech.plainText && !speech.ssmlBody) return null;

        let audRes: ((audioData: ArrayBuffer | null) => void) | null = null;
        let audRej: ((error: unknown) => void) | null = null;
        let timRes: ((chunk: ReadAloudBuffer | null) => void) | null = null;
        let timRej: ((error: unknown) => void) | null = null;

        const audP = new Promise<ArrayBuffer | null>((resolve, reject) => {
            audRes = resolve;
            audRej = reject;
        });

        const timP = new Promise<ReadAloudBuffer | null>((resolve, reject) => {
            timRes = resolve;
            timRej = reject;
        });

        const req: ReadAloudReq = {
            key,
            idx,
            speech,
            aud: null,
            buf: null,
            synth: null,
            doneAud: false,
            doneTim: false,
            okAud: (audioData: ArrayBuffer | null): void => {
                if (req.doneAud) return;
                req.doneAud = true;
                req.aud = audioData;
                audRes?.(audioData);
            },
            noAud: (error: unknown): void => {
                if (req.doneAud) return;
                req.doneAud = true;
                audRej?.(error);
            },
            okTim: (chunk: ReadAloudBuffer | null): void => {
                if (req.doneTim) return;
                req.doneTim = true;
                req.buf = chunk;
                timRes?.(chunk);
            },
            noTim: (error: unknown): void => {
                if (req.doneTim) return;
                req.doneTim = true;
                timRej?.(error);
            },
            audP,
            timP
        };

        this.#reqs.set(key, req);
        void this.#startRequest(req, key, idx, speech);
        return req;
    }

    async #startRequest(
        req: ReadAloudReq,
        key: string,
        idx: number,
        speech: ReadAloudReq["speech"]
    ): Promise<void> {
        try {
            const sdk = await this.#sdkReady();
            const state = window.readAloudState;
            const ssml = buildSSML(
                speech,
                state.voiceName,
                state.speechRate
            );

            const speechConfig = sdk.SpeechConfig.fromSubscription(
                state.speechKey,
                state.serviceRegion
            );
            speechConfig.speechSynthesisVoiceName = state.voiceName;
            speechConfig.setProperty(
                sdk.PropertyId.SpeechSynthesisOutputFormat,
                sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
            );

            const synth = new sdk.SpeechSynthesizer(
                speechConfig,
                null
            );
            req.synth = synth;
            state.synthesiser = synth;
            this.#activeSynths.add(synth);

            const done = (): void => {
                this.#activeSynths.delete(synth);
                if (state.synthesiser === synth) {
                    state.synthesiser = null;
                }
                synth.close();
            };

            const isLive = (): boolean =>
                this.#reqs.get(key) === req;

            synth.speakSsmlAsync(
                ssml,
                (result) => {
                    void this.#completeRequest(
                        req,
                        key,
                        idx,
                        speech.plainText,
                        result,
                        sdk.ResultReason.SynthesizingAudioCompleted,
                        isLive,
                        done
                    );
                },
                (error) => {
                    if (isLive()) {
                        req.noAud(error);
                        req.noTim(error);
                        this.#reqs.delete(key);
                    }
                    done();
                }
            );
        } catch (error: unknown) {
            if (this.#reqs.get(key) !== req) return;

            req.noAud(error);
            req.noTim(error);
            this.#reqs.delete(key);
        }
    }

    async #completeRequest(
        req: ReadAloudReq,
        key: string,
        idx: number,
        plainText: string,
        result: Readonly<{
            reason: number;
            errorDetails?: string;
            audioData: ArrayBuffer;
        }>,
        completedReason: number,
        isLive: () => boolean,
        done: () => void
    ): Promise<void> {
        try {
            if (!isLive()) {
                done();
                return;
            }

            if (result.reason !== completedReason) {
                const error = new Error(
                    result.errorDetails || "Speech synthesis failed"
                );
                req.noAud(error);
                req.noTim(error);
                this.#reqs.delete(key);
                done();
                return;
            }

            req.okAud(result.audioData);

            if (!isLive()) {
                this.#reqs.delete(key);
                done();
                return;
            }

            const timing = await audioTiming(
                plainText,
                result.audioData,
                window.readAloudState.speechRate
            );

            if (!isLive()) {
                this.#reqs.delete(key);
                done();
                return;
            }

            const chunk: ReadAloudBuffer = {
                idx,
                audioData: result.audioData,
                timing
            };

            this.#setBuffer(key, chunk);
            req.okTim(chunk);
            this.#reqs.delete(key);
            done();
        } catch (error: unknown) {
            if (isLive()) {
                req.noAud(error);
                req.noTim(error);
                this.#reqs.delete(key);
            }
            done();
        }
    }

    async buffer(idx: number): Promise<ReadAloudBuffer | null> {
        const hit = this.#getBuffer(idx);
        if (hit) return hit;

        const req = this.#request(idx);
        if (!req) return this.#getBuffer(idx);

        return req.timP;
    }

    warm(idx: number): void {
        if (idx < 0) return;
        if (this.#getBuffer(idx)) return;

        const req = this.#request(idx);
        if (!req) return;

        void req.audP.catch(() => {
            // Ignore background prefetch errors here.
        });
    }

    async stopRequests(): Promise<void> {
        const state = window.readAloudState;
        const activeSynths = Array.from(this.#activeSynths);
        this.#activeSynths.clear();

        if (!activeSynths.length) {
            state.synthesiser = null;
            return;
        }

        await Promise.all(
            activeSynths.map(async (synth) => {
                await new Promise<void>((resolve) => {
                    const done = (): void => {
                        if (state.synthesiser === synth) {
                            state.synthesiser = null;
                        }
                        synth.close();
                        resolve();
                    };

                    if (synth.stopSpeakingAsync) {
                        synth.stopSpeakingAsync(done);
                        return;
                    }

                    done();
                });
            })
        );
    }

    async reset(): Promise<void> {
        await this.stopRequests();
        this.dropRequests();
        this.dropBuffers();
        this.#reqSig = null;
    }
}
