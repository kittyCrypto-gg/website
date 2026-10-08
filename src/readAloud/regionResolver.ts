import type { ReadAloudModule } from "./controller.tsx";
import type { RegionResolveResult } from "./types.ts";
import { probeRegionForKey, readSpeechResource, resolveRegionForKey } from "./speechResource.ts";


/**
   * @param {string} speechKey - Azure subscription key.
   * @param {string} preferredRegion - Cached preferred region.
   * @returns {Promise<RegionResolveResult>} Resolved region or failure reason.
   */
export async function __ensureRegionForKey(self: ReadAloudModule, speechKey: string,
    preferredRegion: string): Promise<RegionResolveResult> {
    if (!speechKey) {
      return { region: null, reason: "no_key" };
    }

    if (self.__regionResolvePromise) {
      return self.__regionResolvePromise;
    }

    self.__regionResolvePromise = resolveRegionForKey(
      speechKey,
      preferredRegion
    ).finally(() => {
      self.__regionResolvePromise = null;
    });

    return self.__regionResolvePromise;
}

/**
   * @returns {Promise<boolean>} True if handled and user was guided, else false.
   */
export async function __handleRuntimeSpeakFailure(self: ReadAloudModule): Promise<boolean> {
    const state = window.readAloudState;
    if (!state.speechKey || !state.serviceRegion) return false;

    const stored = readSpeechResource();
    if (!stored?.regionLocked) return false;

    const probe = await probeRegionForKey(state.speechKey, state.serviceRegion);

    if (probe.status === 0) return false;

    if (probe.status === 429) {
      window.alert("Azure region check was rate limited. Please try again in a moment.");
      return true;
    }

    if (probe.ok) return false;

    window.alert(
      "Your Azure Speech region does not work with this API key. Check what you entered. " +
      "If you clear the region and press Play, the app will try to detect it automatically."
    );

    self.__toggleCnfg(true);
    self.__setRegionUiVisible(true);
    return true;
}
