import type { ReadAloudModule } from "./controller.tsx";
import * as helpers from "../helpers.ts";
import { showToggleVisual } from "../toggleIcons.ts";
import { EYE_CLOSED_SVG, EYE_OPEN_SVG, JUMP_VIS_KEY, READ_ALOUD_BUTTONS } from "./config.ts";
import { getSvgMarkup } from "./svgMarkup.ts";
import { queryEl } from "./menuDom.ts";

export const READ_ALOUD_TOGGLE_ICON_SPEC = {
  size: 32,
  wrapperClass: "theme-toggle-button__icon",
  svgClass: "theme-toggle-button__svg"
} as const;

/**
   * @param {HTMLInputElement | null} apikeyInput - API key input.
   * @param {HTMLElement | null} apikeyEye - Eye button container.
   * @param {boolean} visible - Whether to show the key.
   * @returns {Promise<void>} Resolves once UI is updated.
   */
export async function __applyApiKeyVisibility(self: ReadAloudModule, apikeyInput: HTMLInputElement | null,
    apikeyEye: HTMLElement | null,
    visible: boolean): Promise<void> {
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
   * @param {boolean} visible - Whether to show region input.
   * @returns {void} Nothing.
   */
export function __setRegionUiVisible(self: ReadAloudModule, visible: boolean): void {
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
   * @param {boolean} detached - Whether reader controls are detached.
   * @returns {void} Nothing.
   */
export function __positionMenu(self: ReadAloudModule, detached: boolean): void {
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

    if (!self.__menuResizeObserver) {
      self.__menuResizeObserver = new ResizeObserver(updateBottomAnchor);
      self.__menuResizeObserver.observe(menu);
    }
}

/**
   * @param {boolean} isPlaying - Whether playback is active.
   * @returns {void} Nothing.
   */
export function __setPlayPauseButton(self: ReadAloudModule, isPlaying: boolean): void {
    const btn = helpers.getEl("read-aloud-toggle-playpause");
    if (!btn) return;

    btn.textContent = isPlaying ? READ_ALOUD_BUTTONS.pause.icon : READ_ALOUD_BUTTONS.play.icon;
    btn.title = isPlaying ? READ_ALOUD_BUTTONS.pause.action : READ_ALOUD_BUTTONS.play.action;
}

/**
   * @param {boolean | null} forceValue - Forced value or null to toggle.
   * @returns {boolean} New config visibility.
   */
export function __toggleCnfg(self: ReadAloudModule, forceValue: boolean | null = null): boolean {
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
export function __toggleJump(self: ReadAloudModule, forceValue: boolean | null = null): boolean {
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
export function __toggleVis(self: ReadAloudModule): void {
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
      toggleBtn.removeEventListener("click", self.__boundCloseMenu);
      toggleBtn.addEventListener("click", self.__boundMenuVis);
      return;
    }

    menu.style.display = window.readAloudState.originalMenuDisplay || "flex";
    window.readAloudState.menuVisible = true;

    toggleBtn.classList.add("active");
    toggleBtn.classList.remove("menu-eye");

    if (toggleBtn instanceof HTMLButtonElement) {
      void showToggleVisual(toggleBtn, "disable", READ_ALOUD_TOGGLE_ICON_SPEC);
    }

    toggleBtn.removeEventListener("click", self.__boundMenuVis);
    toggleBtn.addEventListener("click", self.__boundCloseMenu);
}
