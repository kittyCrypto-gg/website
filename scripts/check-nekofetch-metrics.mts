import assert from "node:assert/strict";
import { populateNekofetchMetrics } from "../src/terminal/nekofetchMetrics.js";

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
