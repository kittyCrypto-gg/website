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
    printTerminalHeader
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

    const reconnectDelaysMs = [250, 500, 1_000, 2_000, 5_000, 10_000] as const;
    let reconnectTimer: number | null = null;
    let reconnectAttempt = 0;
    let connectGeneration = 0;
    let disposed = false;
    let hiddenAt: number | null = document.visibilityState === "hidden" ? Date.now() : null;
    let lastHealAt = 0;

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

    // Match the admin dashboard's recoverable transport, with a longer final
    // delay to stay below the public gateway's 10-connections/minute limit.
    const scheduleReconnect = (): void => {
        if (disposed || reconnectTimer !== null || !navigator.onLine) return;

        const delay = reconnectDelaysMs[Math.min(reconnectAttempt, reconnectDelaysMs.length - 1)] ?? 10_000;
        reconnectAttempt += 1;
        reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            void connectWs();
        }, delay);
    };

    const connectWs = async (): Promise<void> => {
        if (disposed || reconnecting || !navigator.onLine) return;
        if (!scrollCtl) return;
        if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;

        const generation = connectGeneration;
        reconnecting = true;

        try {
            const next = await attachWebSocketTransport(term, scrollCtl, {
                onOpen: (socket: WebSocket) => {
                    if (disposed || generation !== connectGeneration) {
                        socket.close();
                        return;
                    }

                    reconnectAttempt = 0;
                    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                    sendPendingWebUiTheme(socket);

                    // Send current dimensions on every attachment, including
                    // a newly spawned PTY using the existing session token.
                    const cols = term.cols;
                    const rows = term.rows;
                    if (Number.isFinite(cols) && Number.isFinite(rows) && cols > 0 && rows > 0) {
                        socket.send(JSON.stringify({ type: "resize", cols, rows }));
                        lastCols = cols;
                        lastRows = rows;
                        pendingResize = null;
                        return;
                    }
                    if (!pendingResize) return;
                    socket.send(pendingResize);
                    pendingResize = null;
                },
                connectRef: (closedSocket: WebSocket) => {
                    if (disposed || ws !== closedSocket) return;
                    ws = null;
                    scheduleReconnect();
                }
            });

            if (disposed || generation !== connectGeneration) {
                next.close();
                return;
            }
            ws = next;
        } catch (error: unknown) {
            if (disposed || generation !== connectGeneration) return;
            console.warn("Terminal connection failed; retrying:", error);
            scheduleReconnect();
        } finally {
            reconnecting = false;
            // A visibility/network refresh may supersede an in-flight token lookup.
            // Start its replacement once the stale attempt has finished.
            if (!disposed && generation !== connectGeneration) void connectWs();
        }
    };

    // Recover from mobile Safari suspending a page, and from network changes.
    const healConnection = (): void => {
        if (disposed || !navigator.onLine) return;

        const now = Date.now();
        if (now - lastHealAt < 1_000) return;
        lastHealAt = now;

        connectGeneration += 1;
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
        reconnectAttempt = 0;

        const stale = ws;
        ws = null;
        if (stale?.readyState === WebSocket.OPEN || stale?.readyState === WebSocket.CONNECTING) {
            stale.close(1000, "refresh transport after resume");
        }
        void connectWs();
    };

    const onVisibilityChange = (): void => {
        if (document.visibilityState === "hidden") {
            hiddenAt = Date.now();
            return;
        }

        const hiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
        hiddenAt = null;
        if (hiddenFor >= 5_000) healConnection();
    };

    const onPageShow = (event: PageTransitionEvent): void => {
        if (event.persisted || ws?.readyState === WebSocket.CLOSED) healConnection();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", healConnection);

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

        printTerminalHeader(ws, true);
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
            disposed = true;
            connectGeneration += 1;
            if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("pageshow", onPageShow);
            window.removeEventListener("online", healConnection);
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