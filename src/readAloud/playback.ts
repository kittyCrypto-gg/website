import type { ReadAloudModule } from "./controller.tsx";
import type { ReadAloudState } from "./types.ts";
import { READ_ALOUD_VOICES } from "./config.ts";
import { speechSdkReady } from "./sdk.ts";
import { forceBookmark } from "../reader.tsx";
import { fadeOutParagraph, highlightParagraph, scrollToParagraph } from "./paragraphUi.ts";
import { paragraphPlain } from "./speechText.ts";


/**
   * @returns {Promise<void>} Resolves after restart attempt.
   */
export async function __restartAll(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;
    state.paused = true;

    await self.__stopAllPlayback();

    if (!state.paragraphs.length) return;

    state.currentPIdx = 0;
    state.currentPid = state.paragraphs[0] ? state.paragraphs[0].id : null;
    state.paused = false;

    self.__setPlayPauseButton(true);
    await self.__speakP(0);
}

/**
   * @param {string} speechKey - Azure subscription key.
   * @param {string} serviceRegion - Azure region.
   * @param {string} voiceName - Voice name.
   * @param {string} tag - Container tag name.
   * @param {string} id - Container id.
   * @param {string} className - Container class.
   * @param {string | null} startFromId - Optional paragraph id to start from.
   * @returns {Promise<void>} Resolves after starting speech.
   */
export async function __readAloud(self: ReadAloudModule, speechKey: string,
    serviceRegion: string,
    voiceName: string = READ_ALOUD_VOICES[0].name,
    tag: string = "article",
    id: string = "reader",
    className: string = "reader-container",
    startFromId: string | null = null): Promise<void> {
    await speechSdkReady();

    let selector = tag;
    if (id) selector += `#${id}`;
    if (className) selector += `.${className}`;

    const container = document.querySelector(selector);
    if (!(container instanceof HTMLElement)) {
      console.error(`Element not found: ${selector}`);
      return;
    }

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".reader-bookmark"));
    if (!paragraphs.length) {
      console.error("No paragraphs found for read aloud.");
      return;
    }

    const startIdx = self.__startIndex(paragraphs, startFromId);

    window.readAloudState.paused = false;
    window.readAloudState.currentPIdx = startIdx;
    window.readAloudState.currentPid = paragraphs[startIdx] ? paragraphs[startIdx].id : null;
    window.readAloudState.paragraphs = paragraphs;
    window.readAloudState.voiceName = voiceName;
    window.readAloudState.speechKey = speechKey;
    window.readAloudState.serviceRegion = serviceRegion;

    await self.__audioQueue.sync();
    await self.__speakP(startIdx);
}

/**
   * @param {number} idx - Paragraph index.
   * @returns {Promise<void>} Resolves after the paragraph pipeline completes.
   */
export async function __speakP(self: ReadAloudModule, idx: number): Promise<void> {
    const state = window.readAloudState;
    if (state.paused || idx >= state.paragraphs.length) return;

    const playbackToken = state.playbackToken;

    if (
      state.currentPIdx !== undefined &&
      state.currentPIdx !== idx &&
      state.paragraphs[state.currentPIdx]
    ) {
      fadeOutParagraph(state.paragraphs[state.currentPIdx]);
    }

    const paragraph = state.paragraphs[idx] ?? null;
    highlightParagraph(window.readAloudState.paragraphs, paragraph);
    scrollToParagraph(paragraph);

    const plainText = paragraphPlain(paragraph);
    const playbackChanged =
      state.playbackToken !== playbackToken ||
      state.paused;

    if (!plainText && playbackChanged) return;

    if (!plainText) {
      await self.__speakP(idx + 1);
      return;
    }

    if (!state.speechKey || !state.serviceRegion) {
      window.alert("Please enter your Azure Speech API key. The region will be detected automatically, or you can set it with 🌍.");
      return;
    }

    try {
      await speechSdkReady();
      await self.__audioQueue.sync();
    } catch {
      window.alert("Speech SDK could not be loaded. Please check your connection or script includes.");
      return;
    }

    if (state.playbackToken !== playbackToken || state.paused) return;

    state.currentPIdx = idx;
    state.currentPid = paragraph ? paragraph.id : null;
    state.lastSpokenText = plainText;

    localStorage.setItem("readAloudAudioPosition", JSON.stringify({
      paragraphId: state.currentPid,
      paragraphIndex: state.currentPIdx
    }));

    if (state.currentPid) forceBookmark(state.currentPid);

    try {
      const chunk = await self.__audioQueue.buffer(idx);

      if (state.playbackToken !== playbackToken || state.paused) return;

      if (!chunk) {
        await self.__speakP(idx + 1);
        return;
      }

      await self.__updateMediaSession(plainText, chunk.timing.wordsPerSecond);

      if (state.playbackToken !== playbackToken || state.paused) return;

      self.__audioQueue.warm(idx + 1);

      await self.__playAudioBlob(chunk.audioData, playbackToken);

      if (state.playbackToken !== playbackToken || state.paused) return;
      await self.__speakP(idx + 1);
    } catch {
      if (state.playbackToken !== playbackToken) return;

      const handled = await self.__handleRuntimeSpeakFailure();
      if (!handled) {
        window.alert("Read Aloud stopped due to a connection issue.");
      }
      await self.__pause();
    }
}

/**
   * @param {ArrayBuffer} audioData - MP3 data.

   * @param {number} playbackToken - Playback invalidation token.
   * @returns {Promise<void>} Resolves when playback ends.
   */
export async function __playAudioBlob(self: ReadAloudModule, audioData: ArrayBuffer, playbackToken: number): Promise<void> {
    const state = window.readAloudState;
    if (state.playbackToken !== playbackToken || state.paused) return;

    return new Promise<void>((resolve, reject) => {
      if (state.playbackToken !== playbackToken || state.paused) {
        resolve();
        return;
      }

      const audioBlob = new Blob([audioData], { type: "audio/mp3" });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      state.currentAudio = audio;
      state.currentAudioUrl = audioUrl;

      let settled = false;

      /**
       * @returns {void} Nothing.
       */
      const cleanup = (): void => {
        audio.onpause = null;
        audio.onended = null;
        audio.onerror = null;

        if (state.currentAudio === audio) state.currentAudio = null;

        if (state.currentAudioUrl === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          state.currentAudioUrl = null;
          return;
        }

        URL.revokeObjectURL(audioUrl);
      };

      audio.onpause = () => {
        const isCurrentAudio = state.currentAudio === audio;
        const samePlayback = state.playbackToken === playbackToken;
        if (!isCurrentAudio || !samePlayback) return;

        const wasInterrupted = !audio.ended && !state.paused;
        if (wasInterrupted) void self.__pause();
      };

      audio.onended = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      audio.onerror = (e) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(e);
      };

      audio.play().catch((err: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
    });
}

/**
   * @param {boolean} hard - If true, also clear cache and shared requests.
   * @returns {Promise<void>} Resolves after invalidating and stopping all read aloud playback.
   */
export async function __stopAllPlayback(self: ReadAloudModule, hard: boolean = false): Promise<void> {
    const state = window.readAloudState;
    state.paused = true;
    state.playbackToken += 1;
    state.buffer = null;

    await self.__stopAud();
    await self.__stopMSloop();

    if (!hard) return;

    await self.__audioQueue.reset();
}

/**
   * @returns {Promise<void>} Resolves when paused and state saved.

   */
export async function __pause(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;
    state.paused = true;

    fadeOutParagraph(state.paragraphs[state.currentPIdx]);

    await self.__stopAllPlayback();

    localStorage.setItem("readAloudAudioPosition", JSON.stringify({
      paragraphId: state.currentPid,
      paragraphIndex: state.currentPIdx
    }));

    self.__setPlayPauseButton(false);
}

/**
   * @returns {Promise<void>} Resolves after resuming speech.
   */
export async function __resume(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;
    state.paused = false;

    await self.__audioQueue.sync();

    const idx = state.currentPIdx || 0;
    await self.__speakP(idx);
}

/**
   * @returns {Promise<void>} Resolves after clearing session state.
   */
export async function __clear(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;

    fadeOutParagraph(state.paragraphs[state.currentPIdx]);

    state.currentPIdx = 0;
    state.currentPid = state.paragraphs[0] ? state.paragraphs[0].id : null;
    state.paused = true;

    await self.__stopAllPlayback();
    localStorage.removeItem("readAloudAudioPosition");
}

/**
   * @returns {Promise<void>} Resolves after stopping active audio playback.
   */
export async function __stopAud(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;

    if (state.currentAudio) {
      state.currentAudio.onpause = null;
      state.currentAudio.onended = null;
      state.currentAudio.onerror = null;
      state.currentAudio.pause();
      state.currentAudio.currentTime = 0;
      state.currentAudio = null;
    }

    if (state.currentAudioUrl) {
      URL.revokeObjectURL(state.currentAudioUrl);
      state.currentAudioUrl = null;
    }
}

/**
   * @param {ReadAloudState} state - Read aloud state.
   * @param {number | null | undefined} idx - Optional index to speak from.
   * @returns {Promise<void>} Resolves after buffer is cleared and playback continues if needed.
   */
export async function __clearBuffer(self: ReadAloudModule, state: ReadAloudState, idx: number | null | undefined): Promise<void> {
    const pausedState = state.paused;
    await self.__stopAllPlayback(true);
    state.paused = pausedState;

    if (state.paused) return;

    const nextIdx = idx == null ? (state.currentPIdx ?? 0) : idx;
    self.__setPlayPauseButton(true);
    await self.__speakP(nextIdx);
}
