import { checkMobile } from "./dependencies.ts";
import { clearTerminalSessionState, hasTerminalInteracted } from "./sessionState.ts";
import { getOrCreateSessionToken } from "./token.ts";
import type {
    ScrollTrackingController,
    WebSocketTransportOptions,
    XtermTerminal
} from "./types.ts";

const BBS_COMMAND = "ssh bbs.kittycrow.dev";
const BBS_DESKTOP_COMMENT = " #I have a bbs too, just press return!";
const bbsSuggestionTimers = new WeakMap<WebSocket, number>();

function clearBbsSuggestionTimer(ws: WebSocket): void {
    const timer = bbsSuggestionTimers.get(ws);
    if (timer === undefined) return;

    window.clearTimeout(timer);
    bbsSuggestionTimers.delete(ws);
}

function deferBbsSuggestion(ws: WebSocket): void {
    clearBbsSuggestionTimer(ws);

    const timer = window.setTimeout(() => {
        bbsSuggestionTimers.delete(ws);
        if (ws.readyState !== WebSocket.OPEN) return;
        if (hasTerminalInteracted()) return;

        // Do not suggest the BBS on mobile; leave only nekofetch.
        if (checkMobile()) return;

        ws.send(BBS_COMMAND + BBS_DESKTOP_COMMENT);
    }, 500);
    bbsSuggestionTimers.set(ws, timer);
}

export function printTerminalHeader(ws: WebSocket, clearFirst = false): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (hasTerminalInteracted()) return;

    clearBbsSuggestionTimer(ws);
    // Clear an untouched suggestion before a theme refresh.
    ws.send((clearFirst ? "\x15clear\r" : "") + "nekofetch\r");
    deferBbsSuggestion(ws);
}

export async function attachWebSocketTransport(
    term: XtermTerminal,
    scrollCtl: ScrollTrackingController,
    opts: WebSocketTransportOptions = {}
): Promise<WebSocket> {
    const { token: sessionToken, isNew } =
        await getOrCreateSessionToken();

    const wsUrl =
        "wss://bash.kittycrow.dev/?sessionToken=" +
        encodeURIComponent(sessionToken);

    const onOpen = typeof opts.onOpen === "function"
        ? opts.onOpen
        : null;
    const connectRef = typeof opts.connectRef === "function"
        ? opts.connectRef
        : null;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    let openTimer: number | null = null;
    const openTimeoutMs = 12_000;

    const clearOpenTimer = (): void => {
        if (openTimer === null) return;
        window.clearTimeout(openTimer);
        openTimer = null;
    };

    openTimer = window.setTimeout(() => {
        openTimer = null;

        if (ws.readyState === WebSocket.OPEN) return;

        const terminalState =
            ws.readyState === WebSocket.CLOSING ||
            ws.readyState === WebSocket.CLOSED;

        if (terminalState) return;

        // Let the close handler initiate a backoff retry.
        ws.close();
    }, openTimeoutMs);

    ws.addEventListener("open", () => {
        clearOpenTimer();
        scrollCtl.forceFollowAndScroll();
        onOpen?.(ws);

        if (!isNew) return;

        window.setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            printTerminalHeader(ws);
        }, 50);
    });

    ws.addEventListener("message", (event: MessageEvent) => {
        // Wait for the nekofetch output to settle before filling the prompt.
        if (bbsSuggestionTimers.has(ws)) deferBbsSuggestion(ws);
        if (typeof event.data === "string") {
            term.write(event.data);
            scrollCtl.maybeScroll();
            return;
        }

        if (event.data instanceof ArrayBuffer) {
            term.write(new TextDecoder().decode(event.data));
            scrollCtl.maybeScroll();
            return;
        }

        if (!(event.data instanceof Blob)) return;

        void event.data.arrayBuffer().then((buffer) => {
            term.write(new TextDecoder().decode(buffer));
            scrollCtl.maybeScroll();
        });
    });

    ws.addEventListener("close", (event: CloseEvent) => {
        clearOpenTimer();
        clearBbsSuggestionTimer(ws);

        const sessionEnded = event.code === 4001;

        if (sessionEnded) clearTerminalSessionState();
        if (sessionEnded) {
            term.writeln(
                "\r\n[session ended, reconnecting with a new token…]"
            );
            scrollCtl.forceFollowAndScroll();
        }

        if (sessionEnded) {
            connectRef?.(ws);
            return;
        }

        // A WebSocket is only an attachment to the token-backed PTY.
        // Transport loss should not leave the terminal permanently disconnected.
        connectRef?.(ws);
    });

    ws.addEventListener("error", () => {
        clearOpenTimer();
        clearBbsSuggestionTimer(ws);
        // The corresponding close event handles retry; avoid transient error
        // notices appearing inside a recoverable terminal session.
    });

    return ws;
}

export function wsUnreachableNoticeText(trigger: string): string {
    const base =
        "Try refreshing to reconnect. If the issue persists email me at kitty@kittycrow.dev";

    return "[notice] " + base + " (trigger: " + trigger + ")";
}
