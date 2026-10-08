import type { ReadAloudState, RegionResolveResult } from "./types.ts";
import type { Modal } from "../modals.ts";
import { render2Mkup } from "../reactHelpers.tsx";
import { RaHelp, RaMenu } from "./views.tsx";
import { READ_ALOUD_BUTTONS, READ_ALOUD_REGIONS, READ_ALOUD_VOICES } from "./config.ts";
import { AudioQueue } from "./audioQueue.ts";
import { speechSdkReady } from "./sdk.ts";
import { __applyApiKeyVisibility as ra_applyApiKeyVisibility, __setRegionUiVisible as ra_setRegionUiVisible, __positionMenu as ra_positionMenu, __setPlayPauseButton as ra_setPlayPauseButton, __toggleCnfg as ra_toggleCnfg, __toggleJump as ra_toggleJump, __toggleVis as ra_toggleVis } from "./menuControls.ts";
import { __ensureRegionForKey as ra_ensureRegionForKey, __handleRuntimeSpeakFailure as ra_handleRuntimeSpeakFailure } from "./regionResolver.ts";
import { __openCustomModal as ra_openCustomModal, __closeCustomModal as ra_closeCustomModal } from "./modalRegistry.ts";
import { showMenu as ra_showMenu, __closeMenu as ra_closeMenu } from "./menuLifecycle.ts";
import { __enableNav as ra_enableNav, __updateMediaSession as ra_updateMediaSession, __setMSmeta as ra_setMSmeta, __stopMSloop as ra_stopMSloop, __startMSloop as ra_startMSloop } from "./mediaSession.ts";
import { __startIndex as ra_startIndex, __changeParagraph as ra_changeParagraph, __nextParagraph as ra_nextParagraph, __prevParagraph as ra_prevParagraph, __jumpToParagraphNumber as ra_jumpToParagraphNumber, reloadReadAloud as ra_reloadReadAloud } from "./navigation.ts";
import { __restartAll as ra_restartAll, __readAloud as ra_readAloud, __speakP as ra_speakP, __playAudioBlob as ra_playAudioBlob, __stopAllPlayback as ra_stopAllPlayback, __pause as ra_pause, __resume as ra_resume, __clear as ra_clear, __stopAud as ra_stopAud, __clearBuffer as ra_clearBuffer } from "./playback.ts";

export class ReadAloudModule {
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


  // Internal bridge for independently testable feature modules.
  get __MENU_HTML(): string { return this.#MENU_HTML; }
  get __HELP_MODAL(): string { return this.#HELP_MODAL; }
  get __audioQueue(): AudioQueue { return this.#audioQueue; }
  get __customModalsById(): Map<string, Modal> { return this.#customModalsById; }
  get __boundShowMenu(): () => void { return this.#boundShowMenu; }
  get __boundCloseMenu(): () => void { return this.#boundCloseMenu; }
  get __boundMenuVis(): () => void { return this.#boundMenuVis; }
  get __menuResizeObserver(): ResizeObserver | null { return this.#menuResizeObserver; }
  set __menuResizeObserver(value: ResizeObserver | null) { this.#menuResizeObserver = value; }
  get __regionResolvePromise(): Promise<RegionResolveResult> | null { return this.#regionResolvePromise; }
  set __regionResolvePromise(value: Promise<RegionResolveResult> | null) { this.#regionResolvePromise = value; }

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
    return ra_applyApiKeyVisibility(this, apikeyInput, apikeyEye, visible);
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
    return ra_ensureRegionForKey(this, speechKey, preferredRegion);
  }
  /**
   * @param {boolean} visible - Whether to show region input.
   * @returns {void} Nothing.
   */
  __setRegionUiVisible(visible: boolean): void {
    return ra_setRegionUiVisible(this, visible);
  }
  /**
   * @returns {Promise<boolean>} True if handled and user was guided, else false.
   */
  async __handleRuntimeSpeakFailure(): Promise<boolean> {
    return ra_handleRuntimeSpeakFailure(this);
  }
  /**
   * @param {boolean} detached - Whether reader controls are detached.
   * @returns {void} Nothing.
   */
  __positionMenu(detached: boolean): void {
    return ra_positionMenu(this, detached);
  }
  /**
   * @param {boolean} isPlaying - Whether playback is active.
   * @returns {void} Nothing.
   */
  __setPlayPauseButton(isPlaying: boolean): void {
    return ra_setPlayPauseButton(this, isPlaying);
  }
  /**
   * @returns {void} Nothing.
   */
  showMenu(): void {
    return ra_showMenu(this);
  }
  /**
   * @returns {void} Nothing.
   */
  __enableNav(): void {
    return ra_enableNav(this);
  }
  /**
   * @param {boolean | null} forceValue - Forced value or null to toggle.
   * @returns {boolean} New config visibility.
   */
  __toggleCnfg(forceValue: boolean | null = null): boolean {
    return ra_toggleCnfg(this, forceValue);
  }
  /**
   * @param {boolean | null} forceValue - Forced value or null to toggle.
   * @returns {boolean} New jump visibility.
   */
  __toggleJump(forceValue: boolean | null = null): boolean {
    return ra_toggleJump(this, forceValue);
  }
  /**
   * @returns {void} Nothing.
   */
  __toggleVis(): void {
    return ra_toggleVis(this);
  }
  /**
   * @returns {Promise<void>} Resolves after restart attempt.
   */
  async __restartAll(): Promise<void> {
    return ra_restartAll(this);
  }
  /**
   * @returns {Promise<void>} Resolves when menu is closed and speech paused.
   */
  async __closeMenu(): Promise<void> {
    return ra_closeMenu(this);
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
    return ra_readAloud(this, speechKey, serviceRegion, voiceName, tag, id, className, startFromId);
  }
  /**
   * @param {readonly HTMLElement[]} paragraphs - Paragraph elements.
   * @param {string | null} startFromId - Optional paragraph id.
   * @returns {number} Starting index.
   */
  __startIndex(paragraphs: readonly HTMLElement[], startFromId: string | null): number {
    return ra_startIndex(this, paragraphs, startFromId);
  }
  /**
   * @param {number} idx - Paragraph index.
   * @returns {Promise<void>} Resolves after the paragraph pipeline completes.
   */
  async __speakP(idx: number): Promise<void> {
    return ra_speakP(this, idx);
  }
  /**
   * @param {string} plainText - Spoken paragraph text.
   * @param {number} wordsPerSecond - Measured words per second for this audio chunk.
   * @returns {Promise<void>} Nothing.
   */
  async __updateMediaSession(plainText: string, wordsPerSecond: number): Promise<void> {
    return ra_updateMediaSession(this, plainText, wordsPerSecond);
  }
  /**
   * @param {string} title - Media session title.
   * @returns {Promise<void>} Nothing.
   */
  async __setMSmeta(title: string): Promise<void> {
    return ra_setMSmeta(this, title);
  }
  /**
   * @returns {Promise<void>} Nothing.
   */
  async __stopMSloop(): Promise<void> {
    return ra_stopMSloop(this);
  }
  /**
   * @param {readonly string[]} titleChunks - Title chunks.
   * @param {number} wordsPerSecond - Measured words per second for the paragraph audio.
   * @returns {Promise<void>} Nothing.
   */
  async __startMSloop(titleChunks: readonly string[], wordsPerSecond: number): Promise<void> {
    return ra_startMSloop(this, titleChunks, wordsPerSecond);
  }
  /**
   * @param {ArrayBuffer} audioData - MP3 data.

   * @param {number} playbackToken - Playback invalidation token.
   * @returns {Promise<void>} Resolves when playback ends.
   */
  async __playAudioBlob(audioData: ArrayBuffer, playbackToken: number): Promise<void> {
    return ra_playAudioBlob(this, audioData, playbackToken);
  }
  /**
   * @param {boolean} hard - If true, also clear cache and shared requests.
   * @returns {Promise<void>} Resolves after invalidating and stopping all read aloud playback.
   */
  async __stopAllPlayback(hard: boolean = false): Promise<void> {
    return ra_stopAllPlayback(this, hard);
  }
  /**
   * @returns {Promise<void>} Resolves when paused and state saved.

   */
  async __pause(): Promise<void> {
    return ra_pause(this);
  }
  /**
   * @returns {Promise<void>} Resolves after resuming speech.
   */
  async __resume(): Promise<void> {
    return ra_resume(this);
  }
  /**
   * @returns {Promise<void>} Resolves after clearing session state.
   */
  async __clear(): Promise<void> {
    return ra_clear(this);
  }
  /**
   * @returns {Promise<void>} Resolves after stopping active audio playback.
   */
  async __stopAud(): Promise<void> {
    return ra_stopAud(this);
  }
  /**
   * @param {number} idx - Paragraph index to switch to.

   * @returns {Promise<void>} Resolves after switching paragraph.
   */
  async __changeParagraph(idx: number): Promise<void> {
    return ra_changeParagraph(this, idx);
  }
  /**
   * @returns {Promise<void>} Resolves after moving to next paragraph.
   */
  async __nextParagraph(): Promise<void> {
    return ra_nextParagraph(this);
  }
  /**
   * @returns {Promise<void>} Resolves after moving to previous paragraph.
   */
  async __prevParagraph(): Promise<void> {
    return ra_prevParagraph(this);
  }
  /**
   * @param {number} paragraphNumber - Paragraph number.
   * @returns {Promise<void>} Resolves after jump attempt.
   */
  async __jumpToParagraphNumber(paragraphNumber: number): Promise<void> {
    return ra_jumpToParagraphNumber(this, paragraphNumber);
  }
  /**
   * @param {ReadAloudState} state - Read aloud state.
   * @param {number | null | undefined} idx - Optional index to speak from.
   * @returns {Promise<void>} Resolves after buffer is cleared and playback continues if needed.
   */
  async __clearBuffer(state: ReadAloudState, idx: number | null | undefined): Promise<void> {
    return ra_clearBuffer(this, state, idx);
  }
  /**
   * @param {string} html - Modal HTML.
   * @param {string} modalId - Modal id.
   * @returns {void} Nothing.
   */
  __openCustomModal(html: string, modalId: string): void {
    return ra_openCustomModal(this, html, modalId);
  }
  /**
   * @param {string} modalId - Modal id.
   * @returns {void} Nothing.
   */
  __closeCustomModal(modalId: string): void {
    return ra_closeCustomModal(this, modalId);
  }
  /**
   * @returns {Promise<void>} Resolves after refreshing paragraph list.
   */
  async reloadReadAloud(): Promise<void> {
    return ra_reloadReadAloud(this);
  }}

const RAM = new ReadAloudModule();

export const showMenu = RAM.getMenuHndlr();
export const reload = RAM.getReloadHndlr()
}

const RAM = new ReadAloudModule();

export const showMenu = RAM.getMenuHndlr();
export const reload = RAM.getReloadHndlr();