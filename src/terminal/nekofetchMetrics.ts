/**
 * Browser measurements for the visitor's GPU and network.
 * Virtual processor identity, kernel details and uptime come from mikuOS.
 */
interface GuestMetricsOS {
    activeKernelMode: "teto" | "thistle";
    k: {
        name: string;
        release: string;
        config: { kernel: { machine: string } };
    };
    s: {
        uptime(): number;
        setenv(name: string, value: string): void;
    };
}

interface BrowserNavigator extends Navigator {
    gpu?: {
        requestAdapter(options?: { powerPreference?: string }): Promise<{
            info?: {
                vendor?: string;
                architecture?: string;
                device?: string;
                description?: string;
            };
            limits?: { maxTextureDimension2D?: number };
            features?: { has(feature: string): boolean };
        } | null>;
    };
}

interface LatencyResult {
    milliseconds: number;
    score: number;
}

const endpoints = {
    battery: "https://srv.kittycrow.dev/",
    signal: "/dist/mikuos/website-config.json"
} as const;

const baselineKeys = {
    battery: "kc:nekofetch:minimum-latency:battery:v1",
    signal: "kc:nekofetch:minimum-latency:signal:v1"
} as const;

function storedMinimum(key: string): number | null {
    try {
        const value = Number(window.localStorage.getItem(key));
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch {
        return null;
    }
}

function saveMinimum(key: string, value: number): void {
    try {
        window.localStorage.setItem(key, String(value));
    } catch {
        // Private browsing must not prevent network measurements.
    }
}

async function fetchLatency(url: string): Promise<number | null> {
    const timeout = new AbortController();
    const deadline = window.setTimeout(() => timeout.abort(), 3000);
    const started = performance.now();
    try {
        const target = new URL(url, window.location.href);
        const sameOrigin = target.origin === window.location.origin;
        const response = await fetch(target.href, {
            method: "GET",
            mode: sameOrigin ? "same-origin" : "no-cors",
            cache: "no-store",
            credentials: "omit",
            signal: timeout.signal
        });
        if (!response.ok && response.type !== "opaque") return null;
        return performance.now() - started;
    } catch {
        return null;
    } finally {
        window.clearTimeout(deadline);
    }
}

async function measureLatency(url: string, storageKey: string): Promise<LatencyResult | null> {
    const attempts = await Promise.all([fetchLatency(url), fetchLatency(url)]);
    const results = attempts.filter((value): value is number => value !== null && value >= 0);
    if (!results.length) return null;
    const current = Math.max(1, Math.min(...results));
    // The minimum is calibrated from actual successful observations on this
    // device. The first observation is 100%; slower future ones score lower.
    const minimum = Math.min(storedMinimum(storageKey) ?? current, current);
    saveMinimum(storageKey, minimum);
    return { milliseconds: current, score: Math.max(0, Math.min(100, 100 * minimum / current)) };
}

async function hostGpuDescription(nav: BrowserNavigator): Promise<string | null> {
    try {
        const adapter = await nav.gpu?.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) return null;
        const info = adapter.info;
        const reportedVendor = info?.vendor?.trim() ?? "";
        const vendorNames: Record<string, string> = {
            apple: "Apple", nvidia: "NVIDIA", amd: "AMD", intel: "Intel", qualcomm: "Qualcomm"
        };
        const vendor = vendorNames[reportedVendor.toLowerCase()] ?? reportedVendor;
        const candidates = [info?.description, info?.device, info?.architecture, vendor]
            .filter((value): value is string => typeof value === "string" && !!value.trim())
            .map(value => value.trim());
        const names = candidates.filter((value, index) =>
            candidates.findIndex(candidate => candidate.toLowerCase() === value.toLowerCase()) === index);
        const specific = names.find(value => value.toLowerCase() !== vendor.toLowerCase());
        const name = specific
            ? (vendor && !specific.toLowerCase().includes(vendor.toLowerCase()) ? vendor + " " + specific : specific)
            : (vendor ? vendor + " GPU" : "WebGPU adapter");
        const texture = adapter.limits?.maxTextureDimension2D;
        const capabilities = [
            "WebGPU",
            Number.isSafeInteger(texture) && (texture ?? 0) > 0 ? "texture " + texture + "px" : "",
            adapter.features?.has("shader-f16") ? "FP16" : ""
        ].filter(Boolean);
        return name + " (" + capabilities.join(", ") + ")";
    } catch {
        return null;
    }
}

/** Read actual mikuOS identity and browser GPU/network measurements. */
export async function populateNekofetchMetrics(os: GuestMetricsOS): Promise<void> {
    os.s.setenv("NEKOFETCH_KERNEL", os.k.name + " " + os.k.release);
    os.s.setenv("NEKOFETCH_CPU", os.k.config.kernel.machine + " (virtual)");
    os.s.setenv("NEKOFETCH_UPTIME_SECONDS",
        String(Math.max(0, Math.floor(os.s.uptime() / 1000))));
    const nav = navigator as BrowserNavigator;
    const [gpu, battery, signal] = await Promise.all([
        hostGpuDescription(nav),
        measureLatency(endpoints.battery, baselineKeys.battery),
        measureLatency(endpoints.signal, baselineKeys.signal)
    ]);
    if (gpu) os.s.setenv("NEKOFETCH_GPU", gpu);
    os.s.setenv("NEKOFETCH_BATTERY_PCT", battery ? battery.score.toFixed(1) : "");
    os.s.setenv("NEKOFETCH_SIGNAL_PCT", signal ? signal.score.toFixed(1) : "");
}
