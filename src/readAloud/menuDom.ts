/** Resolves and validates the read-aloud menu's live DOM controls. */
export function queryEl(selector: string): HTMLElement | null {
  const el = document.querySelector(selector);
  return el instanceof HTMLElement ? el : null;
}

export function resolveMenuElements() {
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

    return menuElements;
}

export type MenuElements = NonNullable<ReturnType<typeof resolveMenuElements>>;
