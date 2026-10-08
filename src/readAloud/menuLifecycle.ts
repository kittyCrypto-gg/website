import type { ReadAloudModule } from "./controller.tsx";
import * as helpers from "../helpers.ts";
import { showToggleVisual } from "../toggleIcons.ts";
import { migrateSpeechResource } from "./speechResource.ts";
import { getSpeechRate } from "./preferences.ts";
import { READ_ALOUD_TOGGLE_ICON_SPEC } from "./menuControls.ts";
import { bindMenuEvents } from "./menuBindings.tsx";
import { queryEl, resolveMenuElements } from "./menuDom.ts";


/**
   * @returns {void} Nothing.
   */
export function showMenu(self: ReadAloudModule): void {
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
      toggleBtn.removeEventListener("click", self.__boundShowMenu);
      toggleBtn.addEventListener("click", self.__boundCloseMenu);
    }

    const menu = helpers.getEl("read-aloud-menu");
    if (!menu) {
      console.error("Read Aloud menu element not found in DOM");
      return;
    }

    if (menu.style.display === "flex") return;

    // Keep the complete build-time form on its first activation.
    // Reopening continues to use a fresh form, as before.
    if (menu.dataset.kcReadAloudHydrated === "1") menu.innerHTML = self.__MENU_HTML;
    if (!menu.querySelector("#read-aloud-voice")) menu.innerHTML = self.__MENU_HTML;
    menu.dataset.kcReadAloudHydrated = "1";
    menu.style.display = "flex";

    migrateSpeechResource();

    const menuElements = resolveMenuElements();
    if (!menuElements) return;

    bindMenuEvents(self, menuElements);

    window.readAloudState.speechRate = getSpeechRate();

    self.__enableNav();

    helpers.getEl("read-aloud-close")?.addEventListener("click", () => {
      self.__boundCloseMenu();
    });

    const fields = queryEl(".read-aloud-fields");
    if (fields) fields.style.display = window.readAloudState.configVisible ? "flex" : "none";

    const controls = queryEl(".reader-controls-top");
    self.__positionMenu(!!controls && controls.classList.contains("is-detached"));
}

/**
   * @returns {Promise<void>} Resolves when menu is closed and speech paused.
   */
export async function __closeMenu(self: ReadAloudModule): Promise<void> {
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
      toggleBtn.removeEventListener("click", self.__boundCloseMenu);
      toggleBtn.addEventListener("click", self.__boundShowMenu);
    }

    menu.style.display = "none";

    self.__setPlayPauseButton(false);

    window.readAloudState.pressed = false;

    menu.style.left = "50%";
    menu.style.top = "0";
    menu.style.transform = "translateX(-50%)";

    await self.__pause();
}
