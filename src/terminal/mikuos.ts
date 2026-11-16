import type { XtermTerminal } from "./types.ts";

export interface MikuOSSession {
    key(data: string): void;
    idle(): Promise<void>;
    os: {
        run(command: string, heredocs?: readonly string[], recordHistory?: boolean): Promise<number>;
    };
}

export interface MikuOSHandle {
    session: MikuOSSession;
    kernel: "thistle" | "teto";
    persistent: boolean;
    dispose(): void;
}

interface RuntimeOptions {
    terminal: XtermTerminal;
    config: Record<string, unknown>;
    kernel: "auto" | "teto" | "thistle";
    persistence: boolean;
    rootBase: URL;
    tetoBase: URL;
}

interface MikuOSRuntime {
    launchThistle(options: RuntimeOptions): Promise<MikuOSHandle>;
}

interface SiteSettings {
    system: Record<string, unknown>;
    kernel: "auto" | "teto" | "thistle";
    persistence: boolean;
    initialCommand: string;
}

declare global {
    interface Window {
        Thistle?: MikuOSRuntime;
    }
}

let bundlePromise: Promise<void> | null = null;

function loadBundle(): Promise<void> {
    if (window.Thistle) return Promise.resolve();
    if (bundlePromise) return bundlePromise;

    bundlePromise = new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "/dist/mikuos/thistle.js";
        script.dataset.mikuosEmbed = "true";
        script.onload = () => {
            if (window.Thistle?.launchThistle) {
                resolve();
                return;
            }
            reject(new Error("mikuOS browser API was not exported"));
        };
        script.onerror = () => reject(new Error("Unable to load the mikuOS browser runtime"));
        document.head.appendChild(script);
    });
    return bundlePromise;
}

function validHostname(value: string): boolean {
    return /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,61}[A-Za-z0-9])?$/.test(value);
}

function validUsername(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(value);
}

function queryConfig(system: Record<string, unknown>): Record<string, unknown> {
    const search = new URL(window.location.href).searchParams;
    const hostname = search.get("miku-host");
    const username = search.get("miku-user");
    const configured = { ...system };

    if (hostname && validHostname(hostname)) configured.hostName = hostname;
    if (!username || !validUsername(username)) return configured;

    const accounts = configured.accounts as Record<string, Record<string, unknown>>;
    configured.accounts = {
        ...accounts,
        web: { ...accounts.web, name: username, displayName: username }
    };
    return configured;
}

async function settings(): Promise<SiteSettings> {
    const response = await fetch("/dist/mikuos/website-config.json");
    if (!response.ok) {
        throw new Error("mikuOS configuration failed to load (HTTP " + response.status + ")");
    }
    const config = await response.json() as SiteSettings;
    if (!config || typeof config !== "object" || !config.system) {
        throw new Error("Invalid mikuOS browser configuration");
    }
    if (!["teto", "thistle", "auto"].includes(config.kernel)) {
        throw new Error("Invalid mikuOS kernel setting");
    }
    if (typeof config.persistence !== "boolean" || typeof config.initialCommand !== "string") {
        throw new Error("Invalid mikuOS browser settings");
    }
    return config;
}

export async function startMikuOS(term: XtermTerminal): Promise<MikuOSHandle> {
    const config = await settings();
    await loadBundle();
    const runtime = window.Thistle;
    if (!runtime) throw new Error("mikuOS runtime is not loaded");

    const search = new URL(window.location.href).searchParams;
    const requested = search.get("miku-kernel");
    const kernel = requested === "teto" || requested === "thistle" || requested === "auto"
        ? requested : config.kernel;

    const handle = await runtime.launchThistle({
        terminal: term,
        config: queryConfig(config.system),
        kernel,
        persistence: config.persistence,
        rootBase: new URL("/dist/mikuos/root/", window.location.origin),
        tetoBase: new URL("/dist/mikuos/teto/", window.location.origin)
    });

    // A host-specific welcome command runs only after the real guest is ready.
    // Do not contaminate its shell history with the website's presentation.
    const initial = config.initialCommand.trim();
    if (initial && !sessionStorage.getItem("kc-mikuos-interacted")) {
        try {
            await handle.session.os.run(initial, [], false);
        } catch (error: unknown) {
            console.warn("mikuOS optional initial command failed:", error);
        }
    }

    return handle;
}
