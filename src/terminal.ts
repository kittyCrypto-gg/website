import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import * as helpers from "./helpers.ts";
import { checkMobile } from "./terminal/dependencies.ts";
import { attachExitControl } from "./terminal/exitControl.ts";
import { runInitialCommand } from "./terminal/initialCommand.ts";
import { applyGuestStartup, applyGuestTheme } from "./terminal/guestStartup.ts";
import { attachBrowserHistory } from "./terminal/browserHistory.ts";
import { launchWithGuestStorage } from "./terminal/guestStorage.ts";
import { bufferedGuestTerminal } from "./terminal/bootOutput.ts";
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
    system: {
        accounts: {
            web: {
                home: string;
            name: string;
            };
        };
    };
    kernel: "teto" | "thistle" | "auto";
    persistence: boolean;
    initialCommand: string;
    startup?: { bashrc: string; logoScript: string } | null;
}

interface MikuBootDisplay {
    report(phase: number, done?: number, total?: number): void;
    finish(): void;
    fail(error: unknown): void;
    dispose(): void;
}
interface MikuBootApi {
    create(term: Terminal, base: URL): Promise<MikuBootDisplay>;
}

interface MikuOSSession {
    key(data: string): void;
    os: {
        prompt(): string;
        run(command: string, heredocBodies?: readonly string[], recordHistory?: boolean): Promise<number>;
        s: {
            uid: number;
            env(name: string): string | Map<string, string> | undefined;
            setenv(name: string, value: string): void;
            cd(path: string): void;
            read(path: string): string;
            stat(path: string): { kind: string };
        };
        sh: {
            prompt(): string;
            ensureUserState(): void;
            saveHistory(): void;
            aliases: Map<string, string>;
            hist: string[];
            prefs: { history: boolean; historySize: number; autocomplete: boolean };
        };
    };
}

interface MikuOSHandle {
    session: MikuOSSession;
    persistent: boolean;
    dispose(): void;
}

interface MikuOSApi {
    launchThistle(options: {
        terminal: ReturnType<typeof bufferedGuestTerminal>["terminal"];
        config: object;
        rootBase: string;
        tetoBase: string;
        persistence: boolean;
        kernel: "teto" | "thistle" | "auto";
        boot?: MikuBootDisplay;
    }): Promise<MikuOSHandle>;
}

interface MikuOSGlobal {
    Thistle?: MikuOSApi;
    MikuBoot?: MikuBootApi;
}

// Bootloader comes directly from the pinned mikuOS install. Its C/WASM
// display starts before the large main browser runtime is fetched.
let bootPromise: Promise<MikuBootApi> | null = null;
async function loadBootloader(): Promise<MikuBootApi> {
    const ready = (window as unknown as MikuOSGlobal).MikuBoot;
    if (ready) return ready;
    if (bootPromise) return bootPromise;
    bootPromise = new Promise<MikuBootApi>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/dist/mikuos/bootloader.js";
        script.onload = () => {
            const api = (window as unknown as MikuOSGlobal).MikuBoot;
            if (api) resolve(api);
            else reject(new Error("mikuOS bootloader did not initialise"));
        };
        script.onerror = () => reject(new Error("Unable to load mikuOS bootloader"));
        document.head.appendChild(script);
    });
    return bootPromise;
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
    const accounts = value.system?.accounts;
    if (!value.system || typeof value.system !== "object" ||
        !accounts || typeof accounts.web?.home !== "string" ||
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

    // Never scroll synchronously from xterm's renderer callback: doing so
    // can recursively schedule another render on some browser versions.
    let scrollScheduled = false;
    const onRendered = (): void => {
        if (scrollScheduled || disposed) return;
        scrollScheduled = true;
        window.requestAnimationFrame(() => {
            scrollScheduled = false;
            if (!disposed) scrollCtl.maybeScroll();
        });
    };
    if (typeof term.onRender === "function") term.onRender(onRendered);

    scheduleFit();

    fitNow();
    // The mikuOS-owned C programme is first on the screen, before thistle.js.
    const bootApi = await loadBootloader();
    const boot = await bootApi.create(term, new URL("/dist/mikuos/", document.baseURI));
    let api: MikuOSApi;
    let config: EmbeddedConfig;
    try {
        [api, config] = await Promise.all([loadMikuOS(), loadConfig()]);
        boot.report(1);
        if (disposed) throw new Error("Terminal was disposed before mikuOS booted");
    } catch (error) {
        boot.fail(error);
        throw error;
    }

    const bootOutput = bufferedGuestTerminal(term);
    try {
        runtime = await launchWithGuestStorage(() => api.launchThistle({
            terminal: bootOutput.terminal,
            boot,
            config: config.system,
            rootBase: "/dist/mikuos/root/",
            tetoBase: "/dist/mikuos/teto/",
            persistence: config.persistence,
            kernel: config.kernel
        }));
    } catch (error) {
        boot.fail(error);
        throw error;
    }

    if (disposed) {
        runtime.dispose();
        throw new Error("Terminal was disposed while mikuOS was booting");
    }

    const guestTheme = document.documentElement.classList.contains("dark-mode")
        ? "dark" : "light";
    const previousPrompt = runtime.session.os.prompt();
    applyGuestStartup(runtime.session.os, guestTheme, config.startup);
    // The banner is released only after /etc/bash.bashrc has supplied the
    // correct colours, PATH, aliases and working directory.
    bootOutput.release(previousPrompt, runtime.session.os.prompt());
    let firstBootStore: Storage | null = null;
    try {
        firstBootStore = window.localStorage;
    } catch {
        // A locked-down browser can still run the guest without localStorage.
    }
    if (config.persistence) {
        attachBrowserHistory(runtime.session.os, config.system.accounts.web.name, firstBootStore);
    }
    if (!userInteracted) {
        await runInitialCommand({
            execute: async (command: string): Promise<boolean> => {
                // Use the guest kernel directly. Sending a command through
                // xterm's character editor causes mobile line-wrap artefacts.
                term.write("\r\n");
                const status = await runtime!.session.os.run(command, [], false);
                term.write("\r\n" + runtime!.session.os.prompt());
                return status === 0;
            }
        }, {
            command: config.initialCommand,
            username: config.system.accounts.web.name,
            persistent: runtime.persistent,
            store: firstBootStore
        });
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
        setWebUiTheme: (theme: WebUiTheme): void => {
            if (!runtime) return;
            applyGuestTheme(runtime.session.os, theme, config.startup);
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
