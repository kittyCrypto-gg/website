import type { ReadAloudModule } from "./controller.tsx";
import type { MenuElements } from "./menuDom.ts";
import * as helpers from "../helpers.ts";
import { RegionProbe } from "./views.tsx";
import { render2Mkup } from "../reactHelpers.tsx";
import { READ_ALOUD_BUTTONS, READ_ALOUD_VOICES, JUMP_VIS_KEY } from "./config.ts";
import { getSpeechRate, saveApiKey, savePreferredVoice, saveRegion, saveSpeechRate } from "./preferences.ts";
import { readSpeechResource, writeSpeechResource } from "./speechResource.ts";

/** Binds menu controls in the original order, retaining the existing event lifecycle. */
export function bindMenuEvents(self: ReadAloudModule, menuElements: MenuElements): void {
    const stored = readSpeechResource();
    menuElements.apikeyInput.value = stored?.speechKey || "";
    menuElements.regionInput.value = stored?.region || "";
    menuElements.regionInput.style.paddingRight = "44px";

    const savedJumpVis = localStorage.getItem(JUMP_VIS_KEY);
    const jumpVisible = savedJumpVis == null ? true : savedJumpVis === "true";
    self.__toggleJump(jumpVisible);

    void self.__applyApiKeyVisibility(
      menuElements.apikeyInput,
      menuElements.apikeyEye,
      !!window.readAloudState.apiKeyVisible
    );

    /**
     * @returns {void} Nothing.
     */
    const toggleApiKeyVisibility = (): void => {
      const visibleNow = menuElements.apikeyInput.type === "text";
      void self.__applyApiKeyVisibility(
        menuElements.apikeyInput,
        menuElements.apikeyEye,
        !visibleNow
      );
    };

    menuElements.apikeyEye.addEventListener("click", toggleApiKeyVisibility);

    menuElements.apikeyEye.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      toggleApiKeyVisibility();
    });

    self.__toggleCnfg(
      !localStorage.getItem("readAloudConfigMenuHidden") ||
        localStorage.getItem("readAloudConfigMenuHidden") === "false"
        ? true
        : window.readAloudState.configVisible
    );

    self.__setRegionUiVisible(!!window.readAloudState.regionUiVisible);

    menuElements.regionToggleBtn.addEventListener("click", () => {
      const next = !window.readAloudState.regionUiVisible;
      self.__setRegionUiVisible(next);
    });

    menuElements.regionInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const raw = menuElements.regionInput.value.trim().toLowerCase();
      saveRegion(raw);
      self.__setRegionUiVisible(false);
    });

    menuElements.voiceDropdown.value =
      localStorage.getItem("readAloudPreferredVoice") || READ_ALOUD_VOICES[0].name;

    menuElements.rateDropdown.value = getSpeechRate().toString();

    menuElements.apikeyInput.addEventListener("input", (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement)) return;
      saveApiKey(t.value.trim());
    });

    menuElements.playPauseBtn.addEventListener("click", async () => {
      const state = window.readAloudState;

      if (!state.paused) {
        self.__setPlayPauseButton(false);
        await self.__pause();
        return;
      }

      const speechKey = menuElements.apikeyInput.value.trim();
      const voiceName = menuElements.voiceDropdown.value;

      state.speechKey = speechKey;
      state.voiceName = voiceName;

      if (!speechKey) {
        self.__setPlayPauseButton(false);
        window.alert("Please enter your Azure Speech API key.");
        return;
      }

      const storedBefore = readSpeechResource();
      const storedKey = storedBefore?.speechKey || "";
      let storedRegion = storedBefore?.region || "";
      let storedRegionLocked = !!storedBefore?.regionLocked;

      if (storedKey !== speechKey) {
        writeSpeechResource({
          speechKey,
          region: storedRegion,
          regionLocked: storedRegionLocked
        });
      }

      const typedRegion = menuElements.regionInput.value.trim().toLowerCase();
      const userEditingRegion = !!state.regionUiVisible;

      if (userEditingRegion && typedRegion === "") {
        storedRegion = "";
        storedRegionLocked = false;
        writeSpeechResource({ speechKey, region: "", regionLocked: false });
      }

      const typedOverride = userEditingRegion && typedRegion !== "" && typedRegion !== storedRegion;
      const hasLockedRegion = typedOverride || (storedRegionLocked && storedRegion !== "");
      const lockedRegion = typedOverride ? typedRegion : storedRegion;
      const canReuseCached = !hasLockedRegion && storedKey === speechKey && storedRegion !== "";
      const regionDetectModalId = "readaloud-region-detect-modal";
      const regionDetectHtml = render2Mkup(<RegionProbe />);
      const shouldDetect = !hasLockedRegion && !canReuseCached;

      let resolved: RegionResolveResult;

      try {
        if (shouldDetect) {
          self.__openCustomModal(regionDetectHtml, regionDetectModalId);
          document.documentElement.classList.add("cursor-wait");
        }

        resolved = hasLockedRegion
          ? { region: lockedRegion, reason: "locked" }
          : canReuseCached
            ? { region: storedRegion, reason: "cached" }
            : await self.__ensureRegionForKey(speechKey, storedRegion);
      } finally {
        if (shouldDetect) {
          self.__closeCustomModal(regionDetectModalId);
          document.documentElement.classList.remove("cursor-wait");
        }
      }

      if (!resolved.region) {
        self.__setPlayPauseButton(false);

        window.alert(
          resolved.reason === "rate_limited"
            ? "Region check was rate limited. Please use the 🌍 button and enter your region manually, then try again."
            : "Could not find a working region for this key. Please use the 🌍 button and enter your region manually."
        );

        self.__toggleCnfg(true);
        self.__setRegionUiVisible(true);
        return;
      }

      state.serviceRegion = resolved.region;
      menuElements.regionInput.value = resolved.region;

      writeSpeechResource({
        speechKey,
        region: resolved.region,
        regionLocked: hasLockedRegion
      });

      self.__setPlayPauseButton(true);

      if (!state.paragraphs.length) {
        await self.__readAloud(speechKey, state.serviceRegion, voiceName);
        return;
      }

      await self.__resume();
    });

    menuElements.stopBtn.addEventListener("click", async () => {
      self.__setPlayPauseButton(false);
      await self.__clear();
    });

    menuElements.infoBtn.addEventListener("click", () => {
      const info = Object.entries(READ_ALOUD_BUTTONS)
        .map(([, val]) => `${val.icon} - ${val.action}`)
        .join("\n");
      window.alert(`Read Aloud Menu Buttons:\n\n${info}`);
    });

    menuElements.helpBtn.addEventListener("click", () => {
      self.__openCustomModal(self.__HELP_MODAL, "readaloud-help-modal");
    });

    menuElements.prevBtn.addEventListener("click", async () => {
      await self.__prevParagraph();
    });

    menuElements.nextBtn.addEventListener("click", async () => {
      await self.__nextParagraph();
    });

    menuElements.restartBtn.addEventListener("click", async () => {
      await self.__restartAll();
    });

    menuElements.configBtn.addEventListener("click", () => {
      self.__toggleCnfg();
    });

    menuElements.hideBtn.addEventListener("click", () => {
      self.__toggleVis();
    });

    menuElements.jumpToggleBtn.addEventListener("click", () => {
      self.__toggleJump();
    });

    /**
     * @returns {Promise<void>} Resolves after jump attempt.
     */
    const doJump = async (): Promise<void> => {
      const raw = menuElements.jumpInput.value.trim();
      if (!raw) return;

      const paragraphNumber = Number.parseInt(raw, 10);
      if (!Number.isFinite(paragraphNumber) || paragraphNumber <= 0) return;

      await self.__jumpToParagraphNumber(paragraphNumber);
    };

    menuElements.jumpGoBtn.addEventListener("click", async () => {
      await doJump();
    });

    menuElements.jumpInput.addEventListener("keydown", async (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      await doJump();
    });

    menuElements.rateDropdown.addEventListener("change", async (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLSelectElement)) return;

      const rate = Number.parseFloat(t.value);
      if (!Number.isFinite(rate)) return;

      window.readAloudState.speechRate = rate;
      saveSpeechRate(rate);

      const state = window.readAloudState;
      const idx = state.currentPIdx;

      await self.__clearBuffer(state, idx).catch((err: unknown) => {
        console.error("[Change Rate] Error clearing Read Aloud buffer:", err);
      });
    });

    menuElements.voiceDropdown.addEventListener("change", async (e: Event) => {
      const t = e.target;
      if (!(t instanceof HTMLSelectElement)) return;

      savePreferredVoice(t.value);

      const voiceName = t.value;
      window.readAloudState.voiceName = voiceName;

      const state = window.readAloudState;
      const idx = state.currentPIdx;

      await self.__clearBuffer(state, idx).catch((err: unknown) => {
        console.error("[Change Voice] Error clearing Read Aloud buffer:", err);
      });
    });

}
