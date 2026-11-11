interface WritableTerminal {
    readonly rows: number;
    readonly cols: number;
    focus(): void;
    write(text: string): void;
    onData(listener: (text: string) => void): { dispose(): void };
    onResize(listener: (size: { rows: number; cols: number }) => void): { dispose(): void };
}

/**
 * mikuOS calls WebSession.start() before launchThistle() returns, which
 * otherwise draws a default thsh prompt before the website can import
 * kittyterm's Bash settings. Buffer only that first output and render it
 * after the guest configuration is applied.
 */
export function bufferedGuestTerminal(term: WritableTerminal): {
    terminal: {
        readonly rows: number;
        readonly cols: number;
        focus(): void;
        write(text: string): void;
        onData(listener: (text: string) => void): { dispose(): void };
        onResize(listener: (size: { rows: number; cols: number }) => void): { dispose(): void };
    };
    release(previousPrompt: string, configuredPrompt: string): void;
} {
    let buffered: string[] | null = [];
    const output = (value: string): void => {
        if (buffered === null) {
            term.write(value);
            return;
        }
        buffered.push(value);
    };
    return {
        terminal: {
            get rows(): number { return term.rows; },
            get cols(): number { return term.cols; },
            focus(): void { term.focus(); },
            write: output,
            onData(listener: (text: string) => void) { return term.onData(listener); },
            onResize(listener: (size: { rows: number; cols: number }) => void) {
                return term.onResize(listener);
            }
        },
        release(previousPrompt: string, configuredPrompt: string): void {
            if (buffered === null) return;
            const raw = buffered.join("");
            buffered = null;
            const prefix = previousPrompt && raw.endsWith(previousPrompt)
                ? raw.slice(0, -previousPrompt.length)
                : raw + "\r\x1b[2K";
            term.write(prefix + configuredPrompt);
        }
    };
}
