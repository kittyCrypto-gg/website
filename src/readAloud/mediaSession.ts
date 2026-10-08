import type { ReadAloudModule } from "./controller.tsx";
import { buildMediaSessionTitle, mediaSessionChunkDelay } from "./mediaTiming.ts";


/**
   * @returns {void} Nothing.
   */
export function __enableNav(self: ReadAloudModule): void {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", async () => {
      await self.__resume();
    });

    navigator.mediaSession.setActionHandler("pause", async () => {
      await self.__pause();
    });

    navigator.mediaSession.setActionHandler("previoustrack", async () => {
      await self.__prevParagraph();
    });

    navigator.mediaSession.setActionHandler("nexttrack", async () => {
      await self.__nextParagraph();
    });
}

/**
   * @param {string} plainText - Spoken paragraph text.
   * @param {number} wordsPerSecond - Measured words per second for this audio chunk.
   * @returns {Promise<void>} Nothing.
   */
export async function __updateMediaSession(self: ReadAloudModule, plainText: string, wordsPerSecond: number): Promise<void> {
    if (!("mediaSession" in navigator)) return;

    const titleChunks = buildMediaSessionTitle(plainText, 60);
    await self.__startMSloop(titleChunks, wordsPerSecond);
}

/**
   * @param {string} title - Media session title.
   * @returns {Promise<void>} Nothing.
   */
export async function __setMSmeta(self: ReadAloudModule, title: string): Promise<void> {
    if (!("mediaSession" in navigator)) return;

    const params = new URLSearchParams(window.location.search);
    const rawStory = params.get("story") || "";
    const chapter = params.get("chapter") || "";

    const storyName = decodeURIComponent(rawStory).split("/").pop() || "Unknown Story";
    const chapterName = `Chapter ${chapter}`;
    const artist = window.location.origin;

    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: storyName,
      // @ts-ignore
      track: chapterName,
      artwork: []
    });
}

/**
   * @returns {Promise<void>} Nothing.
   */
export async function __stopMSloop(self: ReadAloudModule): Promise<void> {
    const state = window.readAloudState;

    if (state.MSTimer !== null) {
      window.clearTimeout(state.MSTimer);
      state.MSTimer = null;
    }

    state.MStoken += 1;
}

/**
   * @param {readonly string[]} titleChunks - Title chunks.
   * @param {number} wordsPerSecond - Measured words per second for the paragraph audio.
   * @returns {Promise<void>} Nothing.
   */
export async function __startMSloop(self: ReadAloudModule, titleChunks: readonly string[], wordsPerSecond: number): Promise<void> {
    if (!("mediaSession" in navigator)) return;

    await self.__stopMSloop();

    const state = window.readAloudState;
    const loopToken = state.MStoken;

    if (!titleChunks.length) {
      await self.__setMSmeta("");
      return;
    }

    let chunkIndex = 0;

    const tick = async (): Promise<void> => {
      if (state.MStoken !== loopToken) return;
      if (state.paused) return;

      const title = titleChunks[chunkIndex] || "";
      await self.__setMSmeta(title);

      chunkIndex += 1;
      if (chunkIndex >= titleChunks.length) return;

      const stepDelayMs = mediaSessionChunkDelay(
        title,
        wordsPerSecond,
        state.speechRate
      );

      state.MSTimer = window.setTimeout(() => {
        void tick();
      }, stepDelayMs);
    };

    await tick();
}
