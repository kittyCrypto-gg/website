import type { ITerminalAddon } from "@xterm/xterm";

export type MobileDetectInstance = Readonly<{
    mobile: () => unknown;
}>;

export type MobileDetectCtor = new (
    userAgent: string
) => MobileDetectInstance;

export type XtermResizeEvent = Readonly<{
    cols: number;
    rows: number;
}>;

export type XtermTerminal = Readonly<{
    element?: HTMLElement | null;
    cols: number;
    rows: number;

    loadAddon: (addon: ITerminalAddon) => void;
    open: (parent: HTMLElement) => void;

    write: (data: string, callback?: () => void) => void;
    writeln: (data: string, callback?: () => void) => void;

    scrollToBottom: () => void;

    onData: (handler: (data: string) => void) => unknown;
    onResize: (handler: (event: XtermResizeEvent) => void) => unknown;
    onRender?: (handler: () => void) => unknown;

    dispose: () => void;
}>;

export type XtermTerminalCtor = new (
    options: Record<string, unknown>
) => XtermTerminal;

export type XtermFitAddon = Readonly<{
    fit: () => void;
}>;

export type XtermFitAddonCtor = new () => XtermFitAddon;

export type FollowState = {
    value: boolean;
};

export type ScrollTrackingController = Readonly<{
    scrollToBottom: () => void;
    maybeScroll: () => void;
    forceFollowAndScroll: () => void;
}>;

export type SessionTokenResult = Readonly<{
    token: string;
    isNew: boolean;
}>;

export type WebSocketTransportOptions = Readonly<{
    onOpen?: (socket: WebSocket) => void;
    connectRef?: (socket: WebSocket) => void;
    onConnectivityIssue?: (trigger: string) => void;
}>;

export type WebUiTheme = "dark" | "light";

export type TerminalReadyDetail = Readonly<{
    textarea: HTMLTextAreaElement;
}>;

export type TerminalModule = Readonly<{
    term: XtermTerminal;
    fitAddon: XtermFitAddon;
    sendSeq: (seq: string) => void;
    setWebUiTheme?: (theme: WebUiTheme) => void;
    events: EventTarget;
    isReady: () => boolean;
    dispose: () => void;
}>;

declare global {
    interface Window {
        MobileDetect?: MobileDetectCtor;
        Terminal?: XtermTerminalCtor;
        FitAddon?: Readonly<{
            FitAddon: XtermFitAddonCtor;
        }>;
    }
}
