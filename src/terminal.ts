import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import * as helpers from "./helpers.ts";
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

interface EmbeddedConfig {
    system: object;
    kernel: "teto" | "thistle" | "auto";
    persistence: boolean;
    initialCommand: string;
}

interface MikuOSSession {
    key(data: string): void;
}

interface MikuOSHandle {
    session: MikuOSSession;
    dispose(): void;
}

interface MikuOSApi {
    launchThistle(options: {
        terminal: Terminal;
        config: object;
        rootBase: string;
        tetoBase: string;
        persistence: boolean;
        kernel: "teto" | "thistle" | "auto";
    }): Promise<MikuOSHandle>;
}

interface MikuOSGlobal {
    Thistle?: MikuOSApi;
}

let bundlePromise: Promise<MikuOSApi> | null = null;

async function loadMikuOS(): Promise<MikuOSApi> {
    const existing = (window as unknown as MikuOSGlobal).Thistle;
    if (existing) return existing;

    if (bundlePromise) return bundlePromise;

    bundlePromise = new Promise<MikuOSApi>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/dist/mikuos/thistle.js";
        script.setAttribute("data-mikuos-embed", "true");
        script.onload = () => {
            const api = (window as unknown as MikuOSGlobal).Thistle;
            if (api && typeof api.launchThistle === "function") {
                resolve(api);
                return;
            }

            reject(new Error("mikuOS browser bundle has no launchThistle API"));
        };
        script.onerror = () => reject(new Error("Unable to load the local mikuOS runtime"));
        document.head.appendChild(script);
    }).catch((error: unknown) => {
        bundlePromise = null;
        throw error;
    });

    return bundlePromise;
}

async function loadConfig(): Promise<EmbeddedConfig> {
    const response = await fetch("/dist/mikuos/website-config.json");
    if (!response.ok) {
        throw new Error("Unable to load mikuOS configuration (HTTP " + String(response.status) + ")");
    }

    const config: unknown = await response.json();
    if (!config || typeof config !== "object") {
        throw new Error("Invalid mikuOS configuration");
    }

    const value = config as Partial<EmbeddedConfig>;
    if (!value.system || typeof value.system !== "object" ||
        (value.kernel !== "thistle" && value.kernel !== "teto" && value.kernel !== "auto") ||
        typeof value.persistence !== "boolean" || typeof value.initialCommand !== "string") {
        throw new Error("Incomplete mikuOS configuration");
    }

    return value as EmbeddedConfig;
}

/**
 * Keep the site's xterm.js instance and all its keyboard, window and theme
 * controls. The actual shell, filesystem and kernel run in the visitor's browser.
 */
export async function setupTerminalModule(): Promise<TerminalModule> {
    const terminalWrapper = helpers.getEl("terminal-wrapper");
    const shellWrapper = firstExistingEl(["shell-wrapper", "banner-wrapper"]);

    if (!terminalWrapper) throw new Error("Missing element: #terminal-wrapper");
    if (!shellWrapper) throw new Error("Missing element: #shell-wrapper or #banner-wrapper");

    const scrollArea = terminalWrapper.querySelector<HTMLElement>("#terminal-scroll")
        ?? document.createElement("div");
    scrollArea.id = "terminal-scroll";

    const termDiv = scrollArea.querySelector<HTMLElement>("#term")
        ?? document.createElement("div");
    termDiv.id = "term";

    if (termDiv.parentElement !== scrollArea) scrollArea.appendChild(termDiv);
    if (scrollArea.parentElement !== terminalWrapper) terminalWrapper.appendChild(scrollArea);

    const term = new Terminal({
        cursorBlink: true,
        convertEol: true,
        fontSize: checkMobile() ? 12 : 14
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termDiv);

    const followState: FollowState = { value: true };
    const scrollCtl: ScrollTrackingController = attachScrollTracking(term, followState);
    const events = new EventTarget();
    let runtime: MikuOSHandle | null = null;
    let disposed = false;
    let ready = false;
    let fitScheduled = false;
    let userInteracted = false;

    const fitNow = (): void => {
        if (disposed || !term.element) return;
        const rect = termDiv.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        fitAddon.fit();
        scrollCtl.maybeScroll();
    };

    const scheduleFit = (): void => {
        if (fitScheduled) return;
        fitScheduled = true;
        raf2(() => {
            fitScheduled = false;
            fitNow();
        });
    };

    const detachResizeHandlers = attachSafeResizeFitting(scheduleFit);
    const detachResizeObserver = attachTerminalResizeObserver(shellWrapper, scheduleFit);
    const interaction = term.onData(() => { userInteracted = true; });

    if (typeof term.onRender === "function") {
        term.onRender(() => scrollCtl.maybeScroll());
    }

    scheduleFit();

    const [api, config] = await Promise.all([loadMikuOS(), loadConfig()]);
    if (disposed) throw new Error("Terminal was disposed before mikuOS booted");

    fitNow();
    runtime = await api.launchThistle({
        terminal: term,
        config: config.system,
        rootBase: "/dist/mikuos/root/",
        tetoBase: "/dist/mikuos/teto/",
        persistence: config.persistence,
        kernel: config.kernel
    });

    if (disposed) {
        runtime.dispose();
        throw new Error("Terminal was disposed while mikuOS was booting");
    }

    if (config.initialCommand.trim() && !userInteracted) {
        runtime.session.key(config.initialCommand + "\r");
    }

    const textarea = await waitForTerminalTextarea(term);
    await helpers.nextFrame();

    attachExitControl(terminalWrapper, textarea);
    ready = true;
    events.dispatchEvent(new CustomEvent<TerminalReadyDetail>(TERMINAL_READY_EVENT, {
        detail: { textarea }
    }));

    scheduleFit();

    return {
        term,
        fitAddon,
        sendSeq: (seq: string): void => {
            userInteracted = true;
            runtime?.session.key(seq);
        },
        setWebUiTheme: (_theme: WebUiTheme): void => {
            // Website themes already own the xterm colour and CRT presentation.
        },
        events,
        isReady: (): boolean => ready,
        dispose: (): void => {
            if (disposed) return;
            disposed = true;
            detachResizeHandlers();
            detachResizeObserver();
            interaction.dispose();
            runtime?.dispose();
            term.dispose();
        }
    };
}
