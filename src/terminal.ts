import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import * as helpers from "./helpers.ts";
import { THEME_CHANGED_EVENT } from "./themeChanger.ts";
import { checkMobile } from "./terminal/dependencies.ts";
import { attachExitControl } from "./terminal/exitControl.ts";
import {
    attachSafeResizeFitting,
    attachScrollTracking,
    attachTerminalResizeObserver,
    firstExistingEl,
    raf2,
    waitForTerminalTextarea
} from "./terminal/layout.ts";
import {
    hasTerminalInteracted,
    markTerminalInteracted
} from "./terminal/sessionState.ts";
import {
    attachWebSocketTransport,
    wsUnreachableNoticeText
} from "./terminal/transport.ts";
import type {
    FollowState,
    ScrollTrackingController,
    TerminalModule,
    TerminalReadyDetail,
    WebUiTheme
} from "./terminal/types.ts";

export type {
    TerminalModule,
    TerminalReadyDetail
} from "./terminal/types.ts";

export const TERMINAL_READY_EVENT = "kc:terminal-ready";

/**
 * @returns {Promise<TerminalModule>} Terminal module API.
 */
export async function setupTerminalModule(): Promise<TerminalModule> {
    const terminalWrapper = helpers.getEl("terminal-wrapper");
    const shellWrapper = firstExistingEl(["shell-wrapper", "banner-wrapper"]);

    if (!terminalWrapper) throw new Error("Missing element: #terminal-wrapper");
    if (!shellWrapper) throw new Error("Missing element: #shell-wrapper or #banner-wrapper");

    let ws: WebSocket | null = null;
    let reconnecting = false;
    let webUiThemePending: WebUiTheme | null = null;
    const events = new EventTarget();
    let ready = false;

    let lastWsNoticeAt = 0;
    let lastWsNoticeKey: string | null = null;

    // The build emits these stable containers, preserving their dimensions
    // from first paint. Keep a fallback for pages built by an older revision.
    const scrollArea = terminalWrapper.querySelector<HTMLElement>("#terminal-scroll")
        ?? document.createElement("div");
    scrollArea.id = "terminal-scroll";
    const termDiv = scrollArea.querySelector<HTMLElement>("#term")
        ?? document.createElement("div");
    termDiv.id = "term";
    if (termDiv.parentElement !== scrollArea) scrollArea.appendChild(termDiv);
    if (scrollArea.parentElement !== terminalWrapper) terminalWrapper.appendChild(scrollArea);

    const isMobile = checkMobile();

    const term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontSize: isMobile ? 12 : 14
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const followState: FollowState = { value: true };

    let scrollCtl: ScrollTrackingController | null = null;
    let fitScheduled = false;

    /**
     * @returns {void} Nothing.
     */
    const fitNow = (): void => {
        if (!scrollCtl) return;
        if (!term.element) return;

        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        fitAddon.fit();
        scrollCtl.maybeScroll();
    };

    /**
     * @returns {void} Nothing.
     */
    const scheduleFit = (): void => {
        if (fitScheduled) return;

        fitScheduled = true;
        raf2(() => {
            fitScheduled = false;
            fitNow();
        });
    };

    term.open(termDiv);

    scrollCtl = attachScrollTracking(term, followState);

    /**
     * @param {string} trigger - What triggered the notice.
     * @returns {void} Nothing.
     */
    const notifyWsUnreachable = (trigger: string): void => {
        const nowMs = Date.now();
        const throttleMs = 4000;
        const key = trigger;

        const tooSoon = nowMs - lastWsNoticeAt < throttleMs;
        if (tooSoon && lastWsNoticeKey === key) return;

        lastWsNoticeAt = nowMs;
        lastWsNoticeKey = key;

        term.writeln(`\r\n${wsUnreachableNoticeText(trigger)}`);
        scrollCtl?.forceFollowAndScroll();
    };

    let pendingResize: string | null = null;
    let lastCols = 0;
    let lastRows = 0;

    /**
     * @param {number} cols - Terminal columns.
     * @param {number} rows - Terminal rows.
     * @returns {void} Nothing.
     */
    function sendResize(cols: number, rows: number): void {
        if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
        if (cols <= 0 || rows <= 0) return;

        if (cols === lastCols && rows === lastRows) return;
        lastCols = cols;
        lastRows = rows;

        const payload = JSON.stringify({ type: "resize", cols, rows });

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            pendingResize = payload;
            return;
        }

        ws.send(payload);
    }

    term.onResize(({ cols, rows }) => {
        sendResize(cols, rows);
    });

    term.onData((data: string) => {
        markTerminalInteracted();
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(data);
    });

    /**
     * @param {WebSocket | null} socket - Optional socket override.
     * @returns {void} Nothing.
     */
    const sendPendingWebUiTheme = (socket: WebSocket | null = null): void => {
        const s = socket || ws;
        if (!webUiThemePending) return;
        if (!s || s.readyState !== WebSocket.OPEN) return;

        webUiThemePending = null;
    };

    /**
     * @param {WebUiTheme} theme - Theme value.
     * @returns {void} Nothing.
     */
    const setWebUiTheme = (theme: WebUiTheme): void => {
        webUiThemePending = theme;
        sendPendingWebUiTheme();
    };

    /**
     * @returns {Promise<void>} Resolves once a connection attempt finishes.
     */
    const connectWs = async (): Promise<void> => {
        if (reconnecting) return;
        if (!scrollCtl) return;

        reconnecting = true;

        try {
            const next = await attachWebSocketTransport(term, scrollCtl, {
                onOpen: (socket: WebSocket) => {
                    sendPendingWebUiTheme(socket);

                    if (pendingResize) {
                        socket.send(pendingResize);
                        pendingResize = null;
                        return;
                    }

                    sendResize(term.cols, term.rows);
                },
                connectRef: () => {
                    void connectWs();
                },
                onConnectivityIssue: (trigger: string) => {
                    notifyWsUnreachable(trigger);
                }
            });

            ws = next;

            ws.addEventListener("open", () => {
                if (!ws) return;

                if (pendingResize) {
                    ws.send(pendingResize);
                    pendingResize = null;
                    return;
                }

                sendResize(term.cols, term.rows);
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "unknown error";
            term.writeln(`\r\n[connection failed: ${msg}]`);
            scrollCtl.forceFollowAndScroll();
            notifyWsUnreachable("ws-setup-failed");
        } finally {
            reconnecting = false;
        }
    };

    // Connection and session-token lookup are independent of visual readiness.
    // Initiate later, after the terminal is constructed and all handlers exist.

    /**
     * Re-runs the decorative terminal output after a site-theme change only while
     * the current shell session is still untouched by the user.
     * @returns {void} Nothing.
     */
    const refreshUntouchedTerminal = (): void => {
        if (hasTerminalInteracted()) return;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        ws.send("clear\rnekofetch\r");
        scrollCtl?.forceFollowAndScroll();
    };

    document.addEventListener(THEME_CHANGED_EVENT, refreshUntouchedTerminal);

    if (typeof term.onRender === "function") {
        term.onRender(() => {
            scrollCtl?.maybeScroll();
        });
    } else {
        const origWrite = term.write.bind(term);
        const origWriteln = term.writeln.bind(term);

        (term as unknown as { write: (data: string, cb?: () => void) => void }).write = (
            data: string,
            cb?: () => void
        ) => {
            origWrite(data, cb);
            raf2(() => {
                scrollCtl?.maybeScroll();
            });
        };

        (term as unknown as { writeln: (data: string, cb?: () => void) => void }).writeln = (
            data: string,
            cb?: () => void
        ) => {
            origWriteln(data, cb);
            raf2(() => {
                scrollCtl?.maybeScroll();
            });
        };
    }

    const detachResizeHandlers = attachSafeResizeFitting(scheduleFit);
    const detachResizeObserver = attachTerminalResizeObserver(shellWrapper, scheduleFit);

    scheduleFit();

    void (async (): Promise<void> => {
        try {
            const textarea = await waitForTerminalTextarea(term);
            await helpers.nextFrame();

            attachExitControl(terminalWrapper, textarea);

            ready = true;

            events.dispatchEvent(new CustomEvent<TerminalReadyDetail>(TERMINAL_READY_EVENT, {
                detail: { textarea }
            }));
        } catch (error: unknown) {
            console.error("Failed to emit terminal ready event:", error);
        }
    })();

    void connectWs();

    return {
        term,
        fitAddon,
        sendSeq: (seq: string): void => {
            markTerminalInteracted();
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            ws.send(seq);
        },
        setWebUiTheme,
        events,
        isReady: (): boolean => ready,
        dispose: (): void => {
            document.removeEventListener(THEME_CHANGED_EVENT, refreshUntouchedTerminal);
            detachResizeHandlers();
            detachResizeObserver();

            try {
                ws?.close();
            } catch {
                // ignore
            }

            term.dispose();
        }
    };
}