import type { ReactElement } from "react";
import { forceBookmark } from "../reader.tsx";
import { factory, type Modal } from "../modals.ts";
import { render2Mkup } from "../reactHelpers.tsx";
import * as helpers from "../helpers.ts";
import { showToggleVisual } from "../toggleIcons.ts";
import type {
  ReadAloudState,
  RegionProbeResult,
  RegionResolveReason,
  RegionResolveResult,
  SpeechConfig,
  SpeechResource,
  SynthesisResult,
} from "./types.ts";
import {
  RaHelp,
  RaMenu,
  RegionProbe
} from "./views.tsx";
import {
  audioTiming,
  buildMediaSessionTitle,
  mediaSessionChunkDelay
} from "./mediaTiming.ts";
import {
  EYE_CLOSED_SVG,
  EYE_OPEN_SVG,
  JUMP_VIS_KEY,
  READ_ALOUD_BUTTONS,
  READ_ALOUD_REGIONS,
  READ_ALOUD_VOICES,
  SPEECH_RESOURCE_KEY
} from "./config.ts";
import {
  buildSSML,
  paragraphPlain,
  paragraphSpeech,
  textFromReadAloudAttribute
} from "./speechText.ts";
import {
  migrateSpeechResource,
  probeRegionForKey,
  readSpeechResource,
  resolveRegionForKey,
  writeSpeechResource
} from "./speechResource.ts";
import {
  getSpeechRate,
  saveApiKey,
  savePreferredVoice,
  saveRegion,
  saveSpeechRate
} from "./preferences.ts";
import {
  fadeOutParagraph,
  highlightParagraph,
  scrollToParagraph
} from "./paragraphUi.ts";
import { AudioQueue } from "./audioQueue.ts";
import { speechSdkReady } from "./sdk.ts";
import { getSvgMarkup } from "./svgMarkup.ts";

const READ_ALOUD_TOGGLE_ICON_SPEC = {
  size: 32,
  wrapperClass: "theme-toggle-button__icon",
  svgClass: "theme-toggle-button__svg"
} as const;

function queryEl(selector: string): HTMLElement | null {
  const el = document.querySelector(selector);
  return el instanceof HTMLElement ? el : null;
}

class ReadAloudModule {
  #MENU_HTML: string;
  #HELP_MODAL: string;
  #regionResolvePromise: Promise<RegionResolveResult> | null = null;
  #audioQueue: AudioQueue;
  #customModalsById = new Map<string, Modal>();
  #boundShowMenu: () => void;
  #boundReload: () => Promise<void>;
  #boundCloseMenu: () => void;
  #boundMenuVis: () => void;
  #menuResizeObserver: ResizeObserver | null = null;
  #onControlsDetach: ((e: Event) => void) | null = null;

  constructor() {
    this.#audioQueue = new AudioQueue(speechSdkReady);

    this.#MENU_HTML = render2Mkup(
      <RaMenu buttons={READ_ALOUD_BUTTONS} voices={READ_ALOUD_VOICES} regions={READ_ALOUD_REGIONS} />
    );

    this.#HELP_MODAL = render2Mkup(<RaHelp />);

    this.#boundShowMenu = () => this.showMenu();
    this.#boundReload = async () => this.reloadReadAloud();
    this.#boundCloseMenu = () => {
      void this.__closeMenu();
    };
    this.#boundMenuVis = () => this.__toggleVis();

    window.readAloudState = {
      paused: true,
      pressed: false,
      currentPIdx: 0,
      currentPid: null,
      paragraphs: [],
      synthesiser: null,
      lastSpokenText: "",
      voiceName: READ_ALOUD_VOICES[0].name,
      speechKey: "",
      serviceRegion: "",
      speechRate: 1.0,
      configVisible: false,
      menuVisible: true,
      jumpVisible: true,
      buffer: null,
      currentAudio: null,
      currentAudioUrl: null,
      apiKeyVisible: false,
      regionUiVisible: false,
      MSTimer: null,
      MStoken: 0,
      playbackToken: 0,
      originalMenuDisplay: undefined
    };

    this.#onControlsDetach = (e: Event) => {
      const ev = e as CustomEvent<{ detached: boolean }>;
      const detached = !!ev.detail?.detached;
      this.__positionMenu(detached);
    };

    window.addEventListener("reader:controls-detached", this.#onControlsDetach);
  }

  /**
   * @returns {() => void} Handler that shows the menu.
   */
  getMenuHndlr(): () => void {
    return this.#boundShowMenu;
  }

  /**
   * @returns {() => Promise<void>} Handler that refreshes paragraph list.
   */
  getReloadHndlr(): () => Promise<void> {
    return this.#boundReload;
  }

  /**
   * @param {HTMLInputElement | null} apikeyInput - API key input.
   * @param {HTMLElement | null} apikeyEye - Eye button container.
   * @param {boolean} visible - Whether to show the key.
   * @returns {Promise<void>} Resolves once UI is updated.
   */
  async __applyApiKeyVisibility(
    apikeyInput: HTMLInputElement | null,
    apikeyEye: HTMLElement | null,
    visible: boolean
  ): Promise<void> {
    if (!apikeyInput || !apikeyEye) return;

    apikeyInput.type = visible ? "text" : "password";
    window.readAloudState.apiKeyVisible = visible;

    const willShow = !visible;

    apikeyEye.setAttribute("aria-label", willShow ? "Show API key" : "Hide API key");
    apikeyEye.setAttribute("title", willShow ? "Show API key" : "Hide API key");

    apikeyEye.replaceChildren();

    const src = willShow ? EYE_OPEN_SVG : EYE_CLOSED_SVG;

    try {
      const raw = await getSvgMarkup(src);
      const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
      const svg = doc.querySelector("svg");
      if (!svg) throw new Error("Invalid SVG");

      svg.querySelectorAll("foreignObject").forEach((n) => n.remove());
      apikeyEye.appendChild(document.importNode(svg, true));
    } catch {
      apikeyEye.textContent = willShow ? "🙊" : "🙈";
    }
  }

  /**
   * @param {string} speechKey - Azure subscription key.
   * @param {string} preferredRegion - Cached preferred region.
   * @returns {Promise<RegionResolveResult>} Resolved region or failure reason.
   */
  async __ensureRegionForKey(
    speechKey: string,
    preferredRegion: string
  ): Promise<RegionResolveResult> {
    if (!speechKey) {
      return { region: null, reason: "no_key" };
    }

    if (this.#regionResolvePromise) {
      return this.#regionResolvePromise;
    }

    this.#regionResolvePromise = resolveRegionForKey(
      speechKey,
      preferredRegion
    ).finally(() => {
      this.#regionResolvePromise = null;
    });

    return this.#regionResolvePromise;
  }

  /**
   * @param {boolean} visible - Whether to show region input.
   * @returns {void} Nothing.
   */
  __setRegionUiVisible(visible: boolean): void {
    const wrap = helpers.getEl("read-aloud-region-wrap");
    const btn = helpers.getEl("read-aloud-region-toggle");
    const fields = queryEl("#read-aloud-menu .read-aloud-fields");
    const apikeyWrap = queryEl("#read-aloud-menu .read-aloud-apikey-wrap");
    const regionInput = document.getElementById("read-aloud-region-input");

    if (!wrap || !btn || !fields || !apikeyWrap) return;
    if (!(regionInput instanceof HTMLInputElement)) return;

    if (visible) {
      wrap.style.display = "flex";
      wrap.appendChild(btn);
      btn.classList.add("read-aloud-apikey-eye");
      btn.setAttribute("title", "Hide region input");
      window.readAloudState.regionUiVisible = true;
      regionInput.focus();
      return;
    }

    wrap.style.display = "none";
    btn.classList.remove("read-aloud-apikey-eye");
    btn.setAttribute("title", "Set region manually");
    fields.insertBefore(btn, apikeyWrap);
    window.readAloudState.regionUiVisible = false;
  }

  /**
   * @returns {Promise<boolean>} True if handled and user was guided, else false.
   */
  async __handleRuntimeSpeakFailure(): Promise<boolean> {
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

    this.__toggleCnfg(true);
    this.__setRegionUiVisible(true);
    return true;
  }

  /**
   * @param {boolean} detached - Whether reader controls are detached.
   * @returns {void} Nothing.
   */
  __positionMenu(detached: boolean): void {
    const menu = helpers.getEl("read-aloud-menu");
    if (!menu) return;

    if (!detached) {
      menu.style.top = "0";
      menu.style.bottom = "";
      menu.style.transform = "translateX(-50%)";
      return;
    }

    const updateBottomAnchor = (): void => {
      const h = menu.offsetHeight;
      menu.style.top = `calc(100vh - ${h}px)`;
      menu.style.bottom = "";
      menu.style.transform = "translateX(-50%)";
    };

    updateBottomAnchor();

    if (!this.#menuResizeObserver) {
      this.#menuResizeObserver = new ResizeObserver(updateBottomAnchor);
      this.#menuResizeObserver.observe(menu);
    }
  }

  /**
   * @param {boolean} isPlaying - Whether playback is active.
   * @returns {void} Nothing.
   */
  __setPlayPauseButton(isPlaying: boolean): void {
    const btn = helpers.getEl("read-aloud-toggle-playpause");
    if (!btn) return;

    btn.textContent = isPlaying ? READ_ALOUD_BUTTONS.pause.icon : READ_ALOUD_BUTTONS.play.icon;
    btn.title = isPlaying ? READ_ALOUD_BUTTONS.pause.action : READ_ALOUD_BUTTONS.play.action;
  }

  /**
   * @returns {void} Nothing.
   */
  showMenu(): void {
    window.readAloudState.pressed = true;

    const toggleBtn = helpers.getEl("read-aloud-toggle");

    if (toggleBtn instanceof HTMLButtonElement) {
      void showToggleVisual(
        toggleBtn,
        "disable",
        READ_ALOUD_TOGGLE_ICON_SPEC
      );
    }

    if (toggleBtn) {
      toggleBtn.classList.add("active");
      toggleBtn.removeEventListener("click", this.#boundShowMenu);
      toggleBtn.addEventListener("click", this.#boundCloseMenu);
    }

    const menu = helpers.getEl("read-aloud-menu");
    if (!menu) {
      console.error("Read Aloud menu element not found in DOM");
      return;
    }

    if (menu.style.display === "flex") return;

    // A built page already contains the complete read-aloud form.
    // Keep its nodes on first activation; later reopens retain the existing
    // reset behaviour of constructing a fresh form.
    if (menu.dataset.kcReadAloudHydrated === "1") menu.innerHTML = this.#MENU_HTML;
    if (!menu.querySelector("#read-aloud-voice")) menu.innerHTML = this.#MENU_HTML;
    menu.dataset.kcReadAloudHydrated = "1";
    menu.style.display = "flex";

    migrateSpeechResource();

    const apikeyInputEl = document.getElementById("read-aloud-apikey");
    const apikeyEyeEl = document.querySelector("#read-aloud-menu .read-aloud-apikey-eye");
    const regionToggleBtnEl = document.getElementById("read-aloud-region-toggle");
    const regionWrapEl = document.getElementById("read-aloud-region-wrap");
    const regionInputEl = document.getElementById("read-aloud-region-input");
    const fieldsWrapEl = document.querySelector("#read-aloud-menu .read-aloud-fields");
    const apikeyWrapEl = document.querySelector("#read-aloud-menu .read-aloud-apikey-wrap");
    const voiceDropdownEl = document.getElementById("read-aloud-voice");
    const rateDropdownEl = document.getElementById("read-aloud-rate");
    const playPauseBtnEl = document.getElementById("read-aloud-toggle-playpause");
    const stopBtnEl = document.getElementById("read-aloud-stop");
    const prevBtnEl = document.getElementById("read-aloud-prev");
    const nextBtnEl = document.getElementById("read-aloud-next");
    const restartBtnEl = document.getElementById("read-aloud-restart");
    const configBtnEl = document.getElementById("read-aloud-config");
    const hideBtnEl = document.getElementById("read-aloud-hide");
    const infoBtnEl = document.getElementById("read-aloud-info");
    const helpBtnEl = document.getElementById("read-aloud-help");
    const jumpToggleBtnEl = document.getElementById("read-aloud-jump-toggle");
    const jumpWrapEl = document.querySelector(".read-aloud-jump");
    const jumpInputEl = document.getElementById("read-aloud-jump-input");
    const jumpGoBtnEl = document.getElementById("read-aloud-jump-go");

    if (!(apikeyInputEl instanceof HTMLInputElement)) return;
    if (!(apikeyEyeEl instanceof HTMLElement)) return;
    if (!(regionToggleBtnEl instanceof HTMLElement)) return;
    if (!(regionWrapEl instanceof HTMLElement)) return;
    if (!(regionInputEl instanceof HTMLInputElement)) return;
    if (!(fieldsWrapEl instanceof HTMLElement)) return;
    if (!(apikeyWrapEl instanceof HTMLElement)) return;
    if (!(voiceDropdownEl instanceof HTMLSelectElement)) return;
    if (!(rateDropdownEl instanceof HTMLSelectElement)) return;
    if (!(playPauseBtnEl instanceof HTMLButtonElement)) return;
    if (!(stopBtnEl instanceof HTMLButtonElement)) return;
    if (!(prevBtnEl instanceof HTMLButtonElement)) return;
    if (!(nextBtnEl instanceof HTMLButtonElement)) return;
    if (!(restartBtnEl instanceof HTMLButtonElement)) return;
    if (!(configBtnEl instanceof HTMLButtonElement)) return;
    if (!(hideBtnEl instanceof HTMLButtonElement)) return;
    if (!(infoBtnEl instanceof HTMLButtonElement)) return;
    if (!(helpBtnEl instanceof HTMLButtonElement)) return;
    if (!(jumpToggleBtnEl instanceof HTMLButtonElement)) return;
    if (!(jumpWrapEl instanceof HTMLElement)) return;
    if (!(jumpInputEl instanceof HTMLInputElement)) return;
    if (!(jumpGoBtnEl instanceof HTMLButtonElement)) return;

    const menuElements = {
      apikeyInput: apikeyInputEl,
      apikeyEye: apikeyEyeEl,
      regionToggleBtn: regionToggleBtnEl,
      regionWrap: regionWrapEl,
      regionInput: regionInputEl,
      fieldsWrap: fieldsWrapEl,
      apikeyWrap: apikeyWrapEl,
      voiceDropdown: voiceDropdownEl,
      rateDropdown: rateDropdownEl,
      playPauseBtn: playPauseBtnEl,
      stopBtn: stopBtnEl,
      prevBtn: prevBtnEl,
      nextBtn: nextBtnEl,
      restartBtn: restartBtnEl,
      configBtn: configBtnEl,
      hideBtn: hideBtnEl,
      infoBtn: infoBtnEl,
      helpBtn: helpBtnEl,
      jumpToggleBtn: jumpToggleBtnEl,
      jumpWrap: jumpWrapEl,
      jumpInput: jumpInputEl,
      jumpGoBtn: jumpGoBtnEl
    };

    const stored = readSpeechResource();
    menuElements.apikeyInput.value = stored?.speechKey || "";
    menuElements.regionInput.value = stored?.region || "";
    menuElements.regionInput.style.paddingRight = "44px";

    const savedJumpVis = localStorage.getItem(JUMP_VIS_KEY);
    const jumpVisible = savedJumpVis == null ? true : savedJumpVis === "true";
    this.__toggleJump(jumpVisible);

    void this.__applyApiKeyVisibility(
      menuElements.apikeyInput,
      menuElements.apikeyEye,
      !!window.readAloudState.apiKeyVisible
    );

    /**
     * @returns {void} Nothing.
     */
    const toggleApiKeyVisibility = (): void => {
      const visibleNow = menuElements.apikeyInput.type === "text";
      void this.__applyApiKeyVisibility(
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

    this.__toggleCnfg(
      !localStorage.getItem("readAloudConfigMenuHidden") ||
        localStorage.getItem("readAloudConfigMenuHidden") === "false"
        ? true
        : window.readAloudState.configVisible
    );

    this.__setRegionUiVisible(!!window.readAloudState.regionUiVisible);

    menuElements.regionToggleBtn.addEventListener("click", () => {
      const next = !window.readAloudState.regionUiVisible;
      this.__setRegionUiVisible(next);
    });

    menuElements.regionInput.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const raw = menuElements.regionInput.value.trim().toLowerCase();
      saveRegion(raw);
      this.__setRegionUiVisible(false);
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
        this.__setPlayPauseButton(false);
        await this.__pause();
        return;
      }

      const speechKey = menuElements.apikeyInput.value.trim();
      const voiceName = menuElements.voiceDropdown.value;

      state.speechKey = speechKey;
      state.voiceName = voiceName;

      if (!speechKey) {
        this.__setPlayPauseButton(false);
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
          this.__openCustomModal(regionDetectHtml, regionDetectModalId);
          document.documentElement.classList.add("cursor-wait");
        }

        resolved = hasLockedRegion
          ? { region: lockedRegion, reason: "locked" }
          : canReuseCached
            ? { region: storedRegion, reason: "cached" }
            : await this.__ensureRegionForKey(speechKey, storedRegion);
      } finally {
        if (shouldDetect) {
          this.__closeCustomModal(regionDetectModalId);
          document.documentElement.classList.remove("cursor-wait");
        }
      }

      if (!resolved.region) {
        this.__setPlayPauseButton(false);

        window.alert(
          resolved.reason === "rate_limited"
            ? "Region check was rate limited. Please use the 🌍 button and enter your region manually, then try again."
            : "Could not find a working region for this key. Please use the 🌍 button and enter your region manually."
        );

        this.__toggleCnfg(true);
        this.__setRegionUiVisible(true);
        return;
      }

      state.serviceRegion = resolved.region;
      menuElements.regionInput.value = resolved.region;

      writeSpeechResource({
        speechKey,
        region: resolved.region,
        regionLocked: hasLockedRegion
      });

      this.__setPlayPauseButton(true);

      if (!state.paragraphs.length) {
        await this.__readAloud(speechKey, state.serviceRegion, voiceName);
        return;
      }

      await this.__resume();
    });

    menuElements.stopBtn.addEventListener("click", async () => {
      this.__setPlayPauseButton(false);
      await this.__clear();
    });

    menuElements.infoBtn.addEventListener("click", () => {
      const info = Object.entries(READ_ALOUD_BUTTONS)
        .map(([, val]) => `${val.icon} - ${val.action}`)
        .join("\n");
      window.alert(`Read Aloud Menu Buttons:\n\n${info}`);
    });

    menuElements.helpBtn.addEventListener("click", () => {
      this.__openCustomModal(this.#HELP_MODAL, "readaloud-help-modal");
    });

    menuElements.prevBtn.addEventListener("click", async () => {
      await this.__prevParagraph();
    });

    menuElements.nextBtn.addEventListener("click", async () => {
      await this.__nextParagraph();
    });

    menuElements.restartBtn.addEventListener("click", async () => {
      await this.__restartAll();
    });

    menuElements.configBtn.addEventListener("click", () => {
      this.__toggleCnfg();
    });

    menuElements.hideBtn.addEventListener("click", () => {
      this.__toggleVis();
    });

    menuElements.jumpToggleBtn.addEventListener("click", () => {
      this.__toggleJump();
    });

    /**
     * @returns {Promise<void>} Resolves after jump attempt.
     */
    const doJump = async (): Promise<void> => {
      const raw = menuElements.jumpInput.value.trim();
      if (!raw) return;

      const paragraphNumber = Number.parseInt(raw, 10);
      if (!Number.isFinite(paragraphNumber) || paragraphNumber <= 0) return;

      await this.__jumpToParagraphNumber(paragraphNumber);
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

      await this.__clearBuffer(state, idx).catch((err: unknown) => {
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

      await this.__clearBuffer(state, idx).catch((err: unknown) => {
        console.error("[Change Voice] Error clearing Read Aloud buffer:", err);
      });
    });

    window.readAloudState.speechRate = getSpeechRate();

    this.__enableNav();

    helpers.getEl("read-aloud-close")?.addEventListener("click", () => {
      this.#boundCloseMenu();
    });

    const fields = queryEl(".read-aloud-fields");
    if (fields) fields.style.display = window.readAloudState.configVisible ? "flex" : "none";

    const controls = queryEl(".reader-controls-top");
    this.__positionMenu(!!controls && controls.classList.contains("is-detached"));
  }

  /**
   * @returns {void} Nothing.
   */
  __enableNav(): void {
    if (!("mediaSession" in navigator)) return;

    navigator.mediaSession.setActionHandler("play", async () => {
      await this.__resume();
    });

    navigator.mediaSession.setActionHandler("pause", async () => {
      await this.__pause();
    });

    navigator.mediaSession.setActionHandler("previoustrack", async () => {
      await this.__prevParagraph();
    });

    navigator.mediaSession.setActionHandler("nexttrack", async () => {
      await this.__nextParagraph();
    });
  }

  /**
   * @param {boolean | null} forceValue - Forced value or null to toggle.
   * @returns {boolean} New config visibility.
   */
  __toggleCnfg(forceValue: boolean | null = null): boolean {
    const fields = queryEl(".read-aloud-fields");
    const configBtn = helpers.getEl("read-aloud-config");
    if (!fields) return false;

    const newValue = forceValue !== null
      ? !!forceValue
      : !window.readAloudState.configVisible;

    fields.style.display = newValue ? "flex" : "none";
    if (configBtn) configBtn.classList.toggle("menu-crossed", newValue);

    window.readAloudState.configVisible = newValue;
    localStorage.setItem("readAloudConfigVisible", String(newValue));
    localStorage.setItem("readAloudConfigMenuHidden", String(!newValue));

    return newValue;
  }

  /**
   * @param {boolean | null} forceValue - Forced value or null to toggle.
   * @returns {boolean} New jump visibility.
   */
  __toggleJump(forceValue: boolean | null = null): boolean {
    const jumpWrap = queryEl(".read-aloud-jump");
    const btn = helpers.getEl("read-aloud-jump-toggle");
    if (!jumpWrap || !btn) return false;

    const current = window.readAloudState.jumpVisible;
    const newValue = forceValue !== null ? !!forceValue : !current;

    jumpWrap.style.display = newValue ? "flex" : "none";
    btn.classList.toggle("menu-crossed", newValue);

    window.readAloudState.jumpVisible = newValue;
    localStorage.setItem(JUMP_VIS_KEY, String(newValue));

    return newValue;
  }

  /**
   * @returns {void} Nothing.
   */
  __toggleVis(): void {
    const menu = helpers.getEl("read-aloud-menu");
    const toggleBtn = helpers.getEl("read-aloud-toggle");
    if (!menu || !toggleBtn) return;

    if (!window.readAloudState.originalMenuDisplay) {
      const computed = window.getComputedStyle(menu).display;
      window.readAloudState.originalMenuDisplay = menu.style.display || computed || "flex";
    }

    const hidingMenu = window.readAloudState.menuVisible;

    if (hidingMenu && toggleBtn instanceof HTMLButtonElement) {
      void showToggleVisual(
        toggleBtn,
        "enable",
        READ_ALOUD_TOGGLE_ICON_SPEC
      );
    }

    if (hidingMenu) {
      menu.style.display = "none";
      window.readAloudState.menuVisible = false;

      toggleBtn.classList.remove("active");
      toggleBtn.classList.add("menu-eye");
      toggleBtn.removeEventListener("click", this.#boundCloseMenu);
      toggleBtn.addEventListener("click", this.#boundMenuVis);
      return;
    }

    menu.style.display = window.readAloudState.originalMenuDisplay || "flex";
    window.readAloudState.menuVisible = true;

    toggleBtn.classList.add("active");
    toggleBtn.classList.remove("menu-eye");

    if (toggleBtn instanceof HTMLButtonElement) {
      void showToggleVisual(toggleBtn, "disable", READ_ALOUD_TOGGLE_ICON_SPEC);
    }

    toggleBtn.removeEventListener("click", this.#boundMenuVis);
    toggleBtn.addEventListener("click", this.#boundCloseMenu);
  }

  /**
   * @returns {Promise<void>} Resolves after restart attempt.
   */
  async __restartAll(): Promise<void> {
    const state = window.readAloudState;
    state.paused = true;

    await this.__stopAllPlayback();

    if (!state.paragraphs.length) return;

    state.currentPIdx = 0;
    state.currentPid = state.paragraphs[0] ? state.paragraphs[0].id : null;
    state.paused = false;

    this.__setPlayPauseButton(true);
    await this.__speakP(0);
  }

  /**
   * @returns {Promise<void>} Resolves when menu is closed and speech paused.
   */
  async __closeMenu(): Promise<void> {
    const menu = helpers.getEl("read-aloud-menu");
    if (!menu) return;

    const toggleBtn = helpers.getEl("read-aloud-toggle");

    if (toggleBtn instanceof HTMLButtonElement) {
      void showToggleVisual(
        toggleBtn,
        "enable",
        READ_ALOUD_TOGGLE_ICON_SPEC
      );
    }

    if (toggleBtn) {
      toggleBtn.classList.remove("active");
      toggleBtn.removeEventListener("click", this.#boundCloseMenu);
      toggleBtn.addEventListener("click", this.#boundShowMenu);
    }

    menu.style.display = "none";

    this.__setPlayPauseButton(false);

    window.readAloudState.pressed = false;

    menu.style.left = "50%";
    menu.style.top = "0";
    menu.style.transform = "translateX(-50%)";

    await this.__pause();
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
  async __readAloud(
    speechKey: string,
    serviceRegion: string,
    voiceName: string = READ_ALOUD_VOICES[0].name,
    tag: string = "article",
    id: string = "reader",
    className: string = "reader-container",
    startFromId: string | null = null
  ): Promise<void> {
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

    const startIdx = this.__startIndex(paragraphs, startFromId);

    window.readAloudState.paused = false;
    window.readAloudState.currentPIdx = startIdx;
    window.readAloudState.currentPid = paragraphs[startIdx] ? paragraphs[startIdx].id : null;
    window.readAloudState.paragraphs = paragraphs;
    window.readAloudState.voiceName = voiceName;
    window.readAloudState.speechKey = speechKey;
    window.readAloudState.serviceRegion = serviceRegion;

    await this.#audioQueue.sync();
    await this.__speakP(startIdx);
  }

  /**
   * @param {readonly HTMLElement[]} paragraphs - Paragraph elements.
   * @param {string | null} startFromId - Optional paragraph id.
   * @returns {number} Starting index.
   */
  __startIndex(paragraphs: readonly HTMLElement[], startFromId: string | null): number {
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
   * @param {number} idx - Paragraph index.
   * @returns {Promise<void>} Resolves after the paragraph pipeline completes.
   */
  async __speakP(idx: number): Promise<void> {
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
      await this.__speakP(idx + 1);
      return;
    }

    if (!state.speechKey || !state.serviceRegion) {
      window.alert("Please enter your Azure Speech API key. The region will be detected automatically, or you can set it with 🌍.");
      return;
    }

    try {
      await speechSdkReady();
      await this.#audioQueue.sync();
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
      const chunk = await this.#audioQueue.buffer(idx);

      if (state.playbackToken !== playbackToken || state.paused) return;

      if (!chunk) {
        await this.__speakP(idx + 1);
        return;
      }

      await this.__updateMediaSession(plainText, chunk.timing.wordsPerSecond);

      if (state.playbackToken !== playbackToken || state.paused) return;

      this.#audioQueue.warm(idx + 1);

      await this.__playAudioBlob(chunk.audioData, playbackToken);

      if (state.playbackToken !== playbackToken || state.paused) return;
      await this.__speakP(idx + 1);
    } catch {
      if (state.playbackToken !== playbackToken) return;

      const handled = await this.__handleRuntimeSpeakFailure();
      if (!handled) {
        window.alert("Read Aloud stopped due to a connection issue.");
      }
      await this.__pause();
    }
  }

  /**
   * @param {string} plainText - Spoken paragraph text.
   * @param {number} wordsPerSecond - Measured words per second for this audio chunk.
   * @returns {Promise<void>} Nothing.
   */
  async __updateMediaSession(plainText: string, wordsPerSecond: number): Promise<void> {
    if (!("mediaSession" in navigator)) return;

    const titleChunks = buildMediaSessionTitle(plainText, 60);
    await this.__startMSloop(titleChunks, wordsPerSecond);
  }

  /**
   * @param {string} title - Media session title.
   * @returns {Promise<void>} Nothing.
   */
  async __setMSmeta(title: string): Promise<void> {
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
  async __stopMSloop(): Promise<void> {
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
  async __startMSloop(titleChunks: readonly string[], wordsPerSecond: number): Promise<void> {
    if (!("mediaSession" in navigator)) return;

    await this.__stopMSloop();

    const state = window.readAloudState;
    const loopToken = state.MStoken;

    if (!titleChunks.length) {
      await this.__setMSmeta("");
      return;
    }

    let chunkIndex = 0;

    const tick = async (): Promise<void> => {
      if (state.MStoken !== loopToken) return;
      if (state.paused) return;

      const title = titleChunks[chunkIndex] || "";
      await this.__setMSmeta(title);

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

  /**
   * @param {ArrayBuffer} audioData - MP3 data.

   * @param {number} playbackToken - Playback invalidation token.
   * @returns {Promise<void>} Resolves when playback ends.
   */
  async __playAudioBlob(audioData: ArrayBuffer, playbackToken: number): Promise<void> {
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
        if (wasInterrupted) void this.__pause();
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
  async __stopAllPlayback(hard: boolean = false): Promise<void> {
    const state = window.readAloudState;
    state.paused = true;
    state.playbackToken += 1;
    state.buffer = null;

    await this.__stopAud();
    await this.__stopMSloop();

    if (!hard) return;

    await this.#audioQueue.reset();
  }

  /**
   * @returns {Promise<void>} Resolves when paused and state saved.

   */
  async __pause(): Promise<void> {
    const state = window.readAloudState;
    state.paused = true;

    fadeOutParagraph(state.paragraphs[state.currentPIdx]);

    await this.__stopAllPlayback();

    localStorage.setItem("readAloudAudioPosition", JSON.stringify({
      paragraphId: state.currentPid,
      paragraphIndex: state.currentPIdx
    }));

    this.__setPlayPauseButton(false);
  }

  /**
   * @returns {Promise<void>} Resolves after resuming speech.
   */
  async __resume(): Promise<void> {
    const state = window.readAloudState;
    state.paused = false;

    await this.#audioQueue.sync();

    const idx = state.currentPIdx || 0;
    await this.__speakP(idx);
  }

  /**
   * @returns {Promise<void>} Resolves after clearing session state.
   */
  async __clear(): Promise<void> {
    const state = window.readAloudState;

    fadeOutParagraph(state.paragraphs[state.currentPIdx]);

    state.currentPIdx = 0;
    state.currentPid = state.paragraphs[0] ? state.paragraphs[0].id : null;
    state.paused = true;

    await this.__stopAllPlayback();
    localStorage.removeItem("readAloudAudioPosition");
  }

  /**
   * @returns {Promise<void>} Resolves after stopping active audio playback.
   */
  async __stopAud(): Promise<void> {
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
   * @param {number} idx - Paragraph index to switch to.

   * @returns {Promise<void>} Resolves after switching paragraph.
   */
  async __changeParagraph(idx: number): Promise<void> {
    const state = window.readAloudState;
    if (!state.paragraphs.length) return;
    if (idx < 0 || idx >= state.paragraphs.length) return;

    const wasPaused = state.paused;

    fadeOutParagraph(state.paragraphs[state.currentPIdx]);

    await this.__stopAllPlayback();

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
      this.__setPlayPauseButton(false);
      return;
    }

    state.paused = false;
    this.__setPlayPauseButton(true);
    await this.__speakP(idx);
  }

  /**
   * @returns {Promise<void>} Resolves after moving to next paragraph.
   */
  async __nextParagraph(): Promise<void> {
    const state = window.readAloudState;
    if (!state.paragraphs.length) return;

    const idx = state.currentPIdx < state.paragraphs.length - 1
      ? state.currentPIdx + 1
      : 0;

    await this.__changeParagraph(idx);
  }

  /**
   * @returns {Promise<void>} Resolves after moving to previous paragraph.
   */
  async __prevParagraph(): Promise<void> {
    const state = window.readAloudState;
    if (!state.paragraphs.length) return;

    const idx = state.currentPIdx > 0
      ? state.currentPIdx - 1
      : state.paragraphs.length - 1;

    await this.__changeParagraph(idx);
  }

  /**
   * @param {number} paragraphNumber - Paragraph number.
   * @returns {Promise<void>} Resolves after jump attempt.
   */
  async __jumpToParagraphNumber(paragraphNumber: number): Promise<void> {
    await this.reloadReadAloud();
    const state = window.readAloudState;

    if (!state.paragraphs || state.paragraphs.length === 0) return;

    const idx = paragraphNumber;
    if (idx < 0 || idx >= state.paragraphs.length) return;

    await this.__changeParagraph(idx);
  }

  /**
   * @param {ReadAloudState} state - Read aloud state.
   * @param {number | null | undefined} idx - Optional index to speak from.
   * @returns {Promise<void>} Resolves after buffer is cleared and playback continues if needed.
   */
  async __clearBuffer(state: ReadAloudState, idx: number | null | undefined): Promise<void> {
    const pausedState = state.paused;
    await this.__stopAllPlayback(true);
    state.paused = pausedState;

    if (state.paused) return;

    const nextIdx = idx == null ? (state.currentPIdx ?? 0) : idx;
    this.__setPlayPauseButton(true);
    await this.__speakP(nextIdx);
  }

  /**
   * @param {string} html - Modal HTML.
   * @param {string} modalId - Modal id.
   * @returns {void} Nothing.
   */
  __openCustomModal(html: string, modalId: string): void {
    const existing = this.#customModalsById.get(modalId);
    if (existing) {
      existing.setContent(html).open();
      return;
    }

    const modal = factory.create({
      id: modalId,
      mode: "blocking",
      content: html
    });

    this.#customModalsById.set(modalId, modal);
    modal.open();
  }

  /**
   * @param {string} modalId - Modal id.
   * @returns {void} Nothing.
   */
  __closeCustomModal(modalId: string): void {
    const cached = this.#customModalsById.get(modalId);
    if (cached) {
      cached.close();
      return;
    }

    factory.getOpenSession(modalId)?.close();
  }

  /**
   * @returns {Promise<void>} Resolves after refreshing paragraph list.
   */
  async reloadReadAloud(): Promise<void> {
    const container = document.querySelector("article#reader, main, article");
    if (!(container instanceof HTMLElement)) return;

    const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".reader-bookmark"));
    if (paragraphs.length <= 0) return;

    await this.#audioQueue.reset();

    window.readAloudState.paragraphs = paragraphs;
    window.readAloudState.currentPIdx = 0;
    window.readAloudState.currentPid = paragraphs[0]?.id || null;
  }
}

const RAM = new ReadAloudModule();

export const showMenu = RAM.getMenuHndlr();
export const reload = RAM.getReloadHndlr();