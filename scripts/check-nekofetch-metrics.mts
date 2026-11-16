import assert from "node:assert/strict";
// Load browser code at runtime so the Node-only tools typecheck stays isolated.
const metricsModule = new URL("../src/terminal/nekofetchMetrics.ts", import.meta.url).href;
const { populateNekofetchMetrics } = await import(metricsModule) as {
    populateNekofetchMetrics(os: {
        activeKernelMode: "teto" | "thistle";
        k: { name: string; release: string; config: { kernel: { machine: string } } };
        s: { uptime(): number; setenv(name: string, value: string): void };
    }): Promise<void>;
};

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, "fetch");
const readings = new Map<string, string>();
const minimums = new Map<string, string>();
const requests: Array<{ url: string; mode: string | undefined }> = [];

const browserWindow = {
    location: { href: "https://test.kittycrow.dev/", origin: "https://test.kittycrow.dev" },
    localStorage: {
        getItem(key: string): string | null { return minimums.get(key) ?? null; },
        setItem(key: string, value: string): void { minimums.set(key, value); }
    },
    setTimeout,
    clearTimeout
};
const browserNavigator = {
    gpu: {
        async requestAdapter(): Promise<object> {
            return {
                info: { vendor: "apple", architecture: "Apple", device: "APPLE", description: "" },
                limits: { maxTextureDimension2D: 16384 },
                features: { has(name: string): boolean { return name === "shader-f16"; } }
            };
        }
    }
};

function restore(name: string, descriptor: PropertyDescriptor | undefined): void {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
}

try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: browserWindow });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: browserNavigator });
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async (input: string, options: { mode?: string }): Promise<Response> => {
            requests.push({ url: String(input), mode: options.mode });
            return new Response(null, { status: 204 });
        }
    });
    await populateNekofetchMetrics({
        activeKernelMode: "teto",
        k: { name: "Teto", release: "2.1.0", config: { kernel: { machine: "Thistle64 RV64GC" } } },
        s: {
            uptime(): number { return 3661000; },
            setenv(name: string, value: string): void { readings.set(name, value); }
        }
    });
    assert.equal(readings.get("NEKOFETCH_KERNEL"), "Teto 2.1.0");
    assert.equal(readings.get("NEKOFETCH_CPU"), "Thistle64 RV64GC (virtual)");
    assert.equal(readings.get("NEKOFETCH_UPTIME_SECONDS"), "3661");
    assert.equal(readings.get("NEKOFETCH_GPU"), "Apple GPU (WebGPU, texture 16384px, FP16)");
    assert.equal(readings.get("NEKOFETCH_BATTERY_PCT"), "100.0");
    assert.equal(readings.get("NEKOFETCH_SIGNAL_PCT"), "100.0");
    assert.equal(readings.has("NEKOFETCH_DEVICE_MEMORY_GIB"), false);
    assert.equal(requests.length, 4);
    assert.equal(requests.filter(item => item.url ===
        "https://test.kittycrow.dev/dist/mikuos/website-config.json" &&
        item.mode === "same-origin").length, 2);
    assert.equal(requests.filter(item => item.url === "https://srv.kittycrow.dev/" &&
        item.mode === "no-cors").length, 2);
    console.log("[nekofetch] Kernel, virtual CPU, uptime, WebGPU and same-origin signal verified.");
} finally {
    restore("fetch", originalFetch);
    restore("navigator", originalNavigator);
    restore("window", originalWindow);
}


// Integration regression: opening the actual website terminal must inject
// measurements before the initial Nekofetch command is executed.
const priorSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const startupEnv = new Map<string, string>();
const startupCommands: string[] = [];
const startupOs = {
    activeKernelMode: "teto" as const,
    k: { name: "Teto", release: "2.1.0", config: { kernel: { machine: "Thistle64 RV64GC" } } },
    s: {
        uptime(): number { return 3661000; },
        setenv(name: string, value: string): void { startupEnv.set(name, value); }
    },
    async run(command: string): Promise<number> {
        startupCommands.push(command);
        assert.equal(startupEnv.get("NEKOFETCH_KERNEL"), "Teto 2.1.0");
        assert.equal(startupEnv.get("NEKOFETCH_UPTIME_SECONDS"), "3661");
        assert.equal(startupEnv.get("NEKOFETCH_CPU"), "Thistle64 RV64GC (virtual)");
        return 0;
    }
};
const startupWindow = {
    ...browserWindow,
    Thistle: {
        async launchThistle(): Promise<object> {
            return {
                session: { os: startupOs },
                kernel: "teto",
                persistent: true,
                dispose(): void {}
            };
        }
    }
};
try {
    Object.defineProperty(globalThis, "window", { configurable: true, value: startupWindow });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: browserNavigator });
    Object.defineProperty(globalThis, "sessionStorage", {
        configurable: true, value: { getItem(): null { return null; } }
    });
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        value: async (input: string): Promise<Response> => {
            if (input === "/dist/mikuos/website-config.json") {
                return new Response(JSON.stringify({
                    system: {}, kernel: "teto", persistence: true, initialCommand: "nekofetch"
                }), { status: 200 });
            }
            return new Response(null, { status: 204 });
        }
    });
    const terminalModule = new URL("../src/terminal/mikuos.ts", import.meta.url).href;
    const { startMikuOS } = await import(terminalModule) as {
        startMikuOS(terminal: never): Promise<unknown>;
    };
    await startMikuOS({} as never);
    assert.deepEqual(startupCommands, ["nekofetch"]);
    assert.equal(startupEnv.get("NEKOFETCH_KERNEL"), "Teto 2.1.0");
    assert.equal(startupEnv.get("NEKOFETCH_UPTIME_SECONDS"), "3661");
    console.log("[nekofetch] Website header injects live telemetry before startup Nekofetch.");
} finally {
    restore("fetch", originalFetch);
    restore("sessionStorage", priorSessionStorage);
    restore("navigator", originalNavigator);
    restore("window", originalWindow);
}
