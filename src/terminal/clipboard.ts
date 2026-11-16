/**
 * Browser-only clipboard shortcuts for the embedded xterm.js terminal.
 * These events are handled before terminal input reaches mikuOS.
 */

export interface ClipboardTerminal {
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void;
    hasSelection(): boolean;
    getSelection(): string;
    paste(text: string): void;
    focus(): void;
}

export interface ClipboardAccess {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
}

function browserClipboard(): ClipboardAccess | undefined {
    return typeof navigator === "undefined" ? undefined : navigator.clipboard;
}

/**
 * Install Windows Terminal-style clipboard controls on one xterm instance.
 * Returns a teardown function for the hosting terminal component.
 */
export function attachTerminalClipboard(
    term: ClipboardTerminal,
    container: HTMLElement,
    clipboard: ClipboardAccess | undefined = browserClipboard()
): () => void {
    let attached = true;

    const reportFailure = (operation: "copy" | "paste", error: unknown): void => {
        if (attached) console.warn("Terminal clipboard " + operation + " failed:", error);
    };

    const copySelection = (): void => {
        if (!clipboard || !term.hasSelection()) return;
        const selected = term.getSelection();
        if (!selected) return;
        // Start clipboard access inside the trusted keyboard event.
        void clipboard.writeText(selected).catch(error => reportFailure("copy", error));
    };

    const pasteClipboard = (): void => {
        if (!clipboard) return;
        // Request clipboard permission in the keyboard/contextmenu gesture.
        void clipboard.readText().then(text => {
            if (!attached || !text) return;
            term.focus();
            // xterm's paste API forwards input through onData, respecting
            // bracketed-paste mode. Never print the text using term.write().
            term.paste(text);
        }).catch(error => reportFailure("paste", error));
    };

    term.attachCustomKeyEventHandler(event => {
        if (!attached || !event.ctrlKey || !event.shiftKey ||
            event.altKey || event.metaKey) return true;

        const key = event.code === "KeyC" ? "c"
            : event.code === "KeyV" ? "v"
                : event.key.toLowerCase();
        if (key !== "c" && key !== "v") return true;

        event.preventDefault();
        if (event.type === "keydown" && !event.repeat) {
            if (key === "c") copySelection();
            else pasteClipboard();
        }
        // Consume the shortcut before it becomes guest Ctrl+C/V input.
        return false;
    });

    const onContextMenu = (event: MouseEvent): void => {
        if (!attached || event.button !== 2) return;
        event.preventDefault();
        pasteClipboard();
    };
    container.addEventListener("contextmenu", onContextMenu, true);

    return (): void => {
        attached = false;
        container.removeEventListener("contextmenu", onContextMenu, true);
    };
}
