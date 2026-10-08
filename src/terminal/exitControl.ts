/** Reuse the exit row emitted by the page build; keep its height reserved even when hidden. */
export function attachExitControl(
    terminalWrapper: HTMLElement,
    textarea: HTMLTextAreaElement
): void {
    const prebuilt = terminalWrapper.querySelector<HTMLButtonElement>("#terminal-exit-control");
    const exit = prebuilt ?? document.createElement("button");

    exit.id = "terminal-exit-control";
    exit.textContent = "Exit terminal";
    exit.type = "button";
    if (exit.parentElement !== terminalWrapper) terminalWrapper.appendChild(exit);

    const hideExit = (): void => {
        exit.classList.remove("is-visible");
        exit.tabIndex = -1;
        exit.setAttribute("aria-hidden", "true");
    };

    const showExit = (): void => {
        exit.classList.add("is-visible");
        exit.tabIndex = 0;
        exit.setAttribute("aria-hidden", "false");
    };

    hideExit();
    textarea.addEventListener("focus", showExit);

    textarea.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;

        event.preventDefault();
        showExit();
        exit.focus();
    });

    exit.addEventListener("click", () => {
        exit.blur();
        hideExit();
    });

    exit.addEventListener("blur", hideExit);
}
