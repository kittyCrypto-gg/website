/**
 * Browser measurements for the visitor's device and network. These are
 * passed to the WASI guest through its existing environment map.
 *
 * mikuOS kernel identity and virtual memory come exclusively from mikuOS.
 * Browser APIs cannot expose a trustworthy physical CPU model or exact RAM.
 */
interface GuestMetricsOS {
    activeKernelMode: "teto" | "thistle";
    k: {
        release: string;
        fs: { cap: number; used(): number };
    };
    s: {
        uptime(): number;
        setenv(name: string, value: string): void;
    };
}

interface BrowserCpuHints {
    architecture?: string;
    bitness?: string;
}

interface BrowserNavigator extends Navigator {
    deviceMemory?: number;
    userAgentData?: {
        getHighEntropyValues(hints: string[]): Promise<BrowserCpuHints>;
    };
    gpu?: {
        requestAdapter(options?: { powerPreference?: string }): Promise<{
            info?: { vendor?: string; architecture?: string; device?: string };
        } | null>;
    };
}

interface LatencyResult {
    milliseconds: number;
    score: number;
}

const endpoints = {
    battery: "https://srv.kittycrow.dev/",
    signal: "https://www.cloudflare.com/cdn-cgi/trace"
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
        await fetch(url, {
            method: "GET",
            mode: "no-cors",
            cache: "no-store",
            credentials: "omit",
            signal: timeout.signal
        });
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

async function hostCpuDescription(nav: BrowserNavigator): Promise<string | null> {
    const count = nav.hardwareConcurrency;
    const logical = Number.isInteger(count) && count > 0
        ? String(count) + " logical processors" : "";
    let architecture = "";
    try {
        const hints = await nav.userAgentData?.getHighEntropyValues(["architecture", "bitness"]);
        if (hints?.architecture) {
            architecture = hints.architecture + (hints.bitness ? "-" + hints.bitness : "");
        }
    } catch {
        // Some browsers intentionally conceal architecture hints.
    }
    const parts = [architecture, logical].filter(Boolean);
    return parts.length ? parts.join(", ") + " (browser-reported)" : null;
}

async function hostGpuDescription(nav: BrowserNavigator): Promise<string | null> {
    try {
        const adapter = await nav.gpu?.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter?.info) return null;
        const info = adapter.info;
        const values = [info.vendor, info.architecture, info.device]
            .filter((value): value is string => typeof value === "string" && !!value.trim());
        return values.length ? values.join(" ") : null;
    } catch {
        return null;
    }
}

/** Refreshes each metric without claiming access to private physical hardware. */
export async function populateNekofetchMetrics(os: GuestMetricsOS): Promise<void> {
    os.s.setenv("NEKOFETCH_KERNEL",
        (os.activeKernelMode === "teto" ? "Teto" : "Thistle") + " " + os.k.release);
    os.s.setenv("NEKOFETCH_UPTIME_SECONDS",
        String(Math.max(0, Math.floor(os.s.uptime() / 1000))));
    const total = os.k.fs.cap;
    const used = os.k.fs.used();
    if (Number.isFinite(total) && total > 0 && Number.isFinite(used) && used >= 0 && used <= total) {
        os.s.setenv("NEKOFETCH_GUEST_TOTAL_BYTES", String(total));
        os.s.setenv("NEKOFETCH_GUEST_USED_BYTES", String(used));
    }
    const nav = navigator as BrowserNavigator;
    const [cpu, gpu, battery, signal] = await Promise.all([
        hostCpuDescription(nav),
        hostGpuDescription(nav),
        measureLatency(endpoints.battery, baselineKeys.battery),
        measureLatency(endpoints.signal, baselineKeys.signal)
    ]);
    if (cpu) os.s.setenv("NEKOFETCH_CPU", cpu);
    if (gpu) os.s.setenv("NEKOFETCH_GPU", gpu);
    if (Number.isFinite(nav.deviceMemory) && (nav.deviceMemory ?? 0) > 0) {
        os.s.setenv("NEKOFETCH_DEVICE_MEMORY_GIB", String(nav.deviceMemory));
    }
    // Failed probes must not leave a stale success from a previous refresh.
    os.s.setenv("NEKOFETCH_BATTERY_PCT", battery ? battery.score.toFixed(1) : "");
    os.s.setenv("NEKOFETCH_SIGNAL_PCT", signal ? signal.score.toFixed(1) : "");
}
