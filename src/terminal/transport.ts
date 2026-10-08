import { clearTerminalSessionState } from "./sessionState.ts";
import { getOrCreateSessionToken } from "./token.ts";
import type {
    ScrollTrackingController,
    WebSocketTransportOptions,
    XtermTerminal
} from "./types.ts";

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
    const onConnectivityIssue =
        typeof opts.onConnectivityIssue === "function"
            ? opts.onConnectivityIssue
            : null;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    let openTimer: number | null = null;
    const openTimeoutMs = 3500;
    let connectivityIssueEmitted = false;

    const emitConnectivityIssue = (trigger: string): void => {
        if (!onConnectivityIssue) return;
        if (connectivityIssueEmitted) return;

        connectivityIssueEmitted = true;
        onConnectivityIssue(trigger);
    };

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

        term.writeln("\r\n[connection timeout]");
        scrollCtl.forceFollowAndScroll();
        emitConnectivityIssue("ws-open-timeout");
    }, openTimeoutMs);

    ws.addEventListener("open", () => {
        clearOpenTimer();
        scrollCtl.forceFollowAndScroll();
        onOpen?.(ws);

        if (!isNew) return;

        window.setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            ws.send("nekofetch\r");
        }, 50);
    });

    ws.addEventListener("message", (event: MessageEvent) => {
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

        const sessionEnded = event.code === 4001;

        if (sessionEnded) clearTerminalSessionState();
        if (sessionEnded) {
            term.writeln(
                "\r\n[session ended, reconnecting with a new token…]"
            );
            scrollCtl.forceFollowAndScroll();
        }

        if (sessionEnded && connectRef) {
            window.setTimeout(connectRef, 0);
        }

        if (sessionEnded) return;

        const normalClosure = event.code === 1000;
        term.writeln("\r\n[disconnected]");
        scrollCtl.forceFollowAndScroll();

        if (normalClosure) return;
        emitConnectivityIssue("ws-close-" + String(event.code));
    });

    ws.addEventListener("error", () => {
        clearOpenTimer();
        term.writeln("\r\n[connection error]");
        scrollCtl.forceFollowAndScroll();
        emitConnectivityIssue("ws-error");
    });

    return ws;
}

export function wsUnreachableNoticeText(trigger: string): string {
    const base =
        "Try refreshing to reconnect. If the issue persists email me at kitty@kittycrow.dev";

    return "[notice] " + base + " (trigger: " + trigger + ")";
}
