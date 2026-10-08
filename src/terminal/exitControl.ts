export function attachExitControl(
    terminalWrapper: HTMLElement,
    textarea: HTMLTextAreaElement
): void {
    const exit = document.createElement("button");

    exit.textContent = "Exit terminal";
    exit.type = "button";
    exit.style.display = "none";
    exit.tabIndex = -1;

    const showExit = (): void => {
        if (!exit.isConnected) terminalWrapper.appendChild(exit);
        exit.style.display = "block";
        exit.tabIndex = 0;
    };

    textarea.addEventListener("focus", showExit);

    textarea.addEventListener("keydown", (event) => {
        if (event.key !== "Tab") return;

        event.preventDefault();
        showExit();
        exit.focus();
    });

    exit.addEventListener("click", () => {
        exit.blur();
        exit.remove();
    });

    exit.addEventListener("blur", () => {
        exit.style.display = "none";
        exit.tabIndex = -1;
    });
}
