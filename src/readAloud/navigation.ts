import type { ReadAloudModule } from "./controller.tsx";
import * as helpers from "../helpers.ts";
import { forceBookmark } from "../reader.tsx";
import { fadeOutParagraph, highlightParagraph, scrollToParagraph } from "./paragraphUi.ts";


/**
   * @param {readonly HTMLElement[]} paragraphs - Paragraph elements.
   * @param {string | null} startFromId - Optional paragraph id.
   * @returns {number} Starting index.
   */
export function __startIndex(self: ReadAloudModule, paragraphs: readonly HTMLElement[], startFromId: string | null): number {
    const requestedIndex = startFromId
      ? paragraphs.findIndex((p) => p.id === startFromId)
      : -1;

    if (requestedIndex >= 0) return requestedIndex;

    const saved = localStorage.getItem("readAloudAudioPosition");
    if (!saved) return 0;

    let savedObjUnknown: unknown;
    try {
      savedObjUnknown = JSON.parse(saved);
    } catch {
      return 0;
    }

    if (!helpers.isRecord(savedObjUnknown)) return 0;

    const paragraphId =
      typeof savedObjUnknown.paragraphId === "string"
        ? savedObjUnknown.paragraphId
        : null;

    const savedIndex = paragraphId
      ? paragraphs.findIndex((p) => p.id === paragraphId)
      : -1;

    if (savedIndex >= 0) return savedIndex;

    const paragraphIndex = typeof savedObjUnknown.paragraphIndex === "number" ? savedObjUnknown.paragraphIndex : -1;
    if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) return paragraphIndex;

    return 0;
}

/**
   * @param {number} idx - Paragraph index to switch to.

   * @returns {Promise<void>} Resolves after switching paragraph.
   */
export async function __changeParagraph(self: ReadAloudModule, idx: number): Promise<void> {
    const state = window.readAloudState;
    if (!state.paragraphs.length) return;
    if (idx < 0 || idx >= state.paragraphs.length) return;

    const wasPaused = state.paused;

    fadeOutParagraph(state.paragraphs[state.currentPIdx]);

    await self.__stopAllPlayback();

    state.currentPIdx = idx;
    state.currentPid = state.paragraphs[idx].id;

    localStorage.setItem("readAloudAudioPosition", JSON.stringify({
      paragraphId: state.currentPid,
      paragraphIndex: state.currentPIdx
    }));

    highlightParagraph(window.readAloudState.paragraphs, state.paragraphs[idx]);
    scrollToParagraph(state.paragraphs[idx]);

    if (state.currentPid) forceBookmark(state.currentPid);

    if (wasPaused) {
      self.__setPlayPauseButton(false);
      return;
    }

    state.paused = false;
    self.__setPlayPauseButton(true);
    await self.__speakP(idx);
}

/**
   * @returns {Promise<void>} Resolves after moving to next paragraph.
   */
export async function __nextParagraph(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;
    if (!state.paragraphs.length) return;

    const idx = state.currentPIdx < state.paragraphs.length - 1
      ? state.currentPIdx + 1
      : 0;

    await self.__changeParagraph(idx);
}

/**
   * @returns {Promise<void>} Resolves after moving to previous paragraph.
   */
export async function __prevParagraph(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;
    if (!state.paragraphs.length) return;

    const idx = state.currentPIdx > 0
      ? state.currentPIdx - 1
      : state.paragraphs.length - 1;

    await self.__changeParagraph(idx);
}

/**
   * @param {number} paragraphNumber - Paragraph number.
   * @returns {Promise<void>} Resolves after jump attempt.
   */
export async function __jumpToParagraphNumber(self: ReadAloudModule, paragraphNumber: number): Promise<void> {
    await self.reloadReadAloud();
    const state = window.readAloudState;

    if (!state.paragraphs || state.paragraphs.length === 0) return;

    const idx = paragraphNumber;
    if (idx < 0 || idx >= state.paragraphs.length) return;

    await self.__changeParagraph(idx);
}

/**
   * @returns {Promise<void>} Resolves after refreshing paragraph list.
   */
export async function reloadReadAloud(self: ReadAloudModule): Promise<void> {
    const container = document.querySelector("article#reader, main, article");
    if (!(container instanceof HTMLElement)) return;

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".reader-bookmark"));
    if (paragraphs.length <= 0) return;

    await self.__audioQueue.reset();

    window.readAloudState.paragraphs = paragraphs;
    window.readAloudState.currentPIdx = 0;
    window.readAloudState.currentPid = paragraphs[0]?.id || null;
}
