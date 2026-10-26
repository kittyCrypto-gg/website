/// <reference lib="dom" />
import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { cpus, platform } from "node:os";
import { build } from "esbuild";
import { chromium, type Browser, type BrowserServer, type Page } from "playwright";
import { PNG } from "pngjs";

type Prefs = { phosphorEnabled: boolean; phosphorOpacity: number; scanlinesEnabled: boolean; scanlineOpacity: number; scanlineSpeed: number; textShadowEnabled: boolean; textShadowIntensity: number };
type Sample = { dt: number; phase: string };
declare global { interface Window { __crtReady: boolean; __crtScanPending?: boolean; __crtApply: (prefs: Prefs) => void; __crtSamples: Sample[]; __crtPhase: string; __crtSampling: boolean; } }
type TraceEvent = { name: string; ts: number; dur?: number; ph: string; args?: { data?: { message?: string }; frameSeqId?: number; layerTreeId?: number } };
const baseline = resolve(process.argv[2] ?? "../baseline");
const candidate = resolve(process.argv[3] ?? ".");
const output = resolve(process.env.CRT_BENCH_OUTPUT ?? ".build/crt-benchmark");
const repeats = Number(process.env.CRT_BENCH_REPEATS ?? 3);
if (!Number.isInteger(repeats) || repeats < 1) throw new Error("CRT_BENCH_REPEATS must be a positive integer");
const viewport = { width: 1280, height: 720 };
const base: Prefs = { phosphorEnabled: true, phosphorOpacity: .048, scanlinesEnabled: true, scanlineOpacity: .09, scanlineSpeed: 90, textShadowEnabled: true, textShadowIntensity: 15 };
const profiles: Record<string, Prefs> = {
    off: { ...base, phosphorEnabled: false, scanlinesEnabled: false, textShadowEnabled: false },
    phosphor: { ...base, scanlinesEnabled: false, textShadowEnabled: false },
    all: base
};
const extraArgs: string[] = JSON.parse(process.env.CRT_CHROMIUM_ARGS ?? "[]") as string[];
const executablePath = process.env.CRT_CHROMIUM_EXECUTABLE;
const browserOptions = { headless: process.env.CRT_HEADFUL !== "1", executablePath, args: extraArgs };
await mkdir(output, { recursive: true });

async function serve(root: string): Promise<{ origin: string; server: Server }> {
    const fx = await build({ absWorkingDir: root, entryPoints: ["src/effects/preferences.ts"], bundle: true, format: "esm", write: false, plugins: [{
        name: "observe-initial-text-scan",
        setup(builder) {
            builder.onLoad({ filter: /[/\\]effects[/\\]textScan\.ts$/ }, async ({ path }) => {
                const original = await readFile(path, "utf8");
                const finished = "if (walker || roots.length > 0) schedule();";
                const queued = "roots.push(root);";
                if (!original.includes(finished) || !original.includes(queued)) throw new Error("Text scanner changed; update benchmark instrumentation");
                // Observe completion without changing scheduling or marking.
                const contents = original.replace(finished, "window.__crtScanPending = Boolean(walker || roots.length); " + finished)
                    .replace(queued, "window.__crtScanPending = true; " + queued);
                return { contents, loader: "ts" };
            });
        }
    }] });
    const server = createServer((req, res) => {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.pathname === "/__crt-runtime.js") {
                res.setHeader("Content-Type", "text/javascript");
                res.end(fx.outputFiles[0]!.contents);
                return;
            }
            const file = resolve(root, "." + url.pathname);
            if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
            let bytes = await readFile(file);
            if (file.endsWith(".html")) {
                // Retain the built site's HTML, CSS and assets, isolating its real
                // effects from live backend updates, tips and network retries.
                const prefs = JSON.parse(url.searchParams.get("prefs") ?? JSON.stringify(base)) as Prefs;
                const boot = `<script type="module">import{apply}from'/__crt-runtime.js';window.__crtApply=apply;document.documentElement.classList.add('${url.searchParams.get("dark") === "1" ? "dark" : "light"}-mode');document.getElementById('shell-wrapper')?.remove();apply(${JSON.stringify(prefs)});window.__crtReady=true;</script>`;
                bytes = Buffer.from(bytes.toString().replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<link\b[^>]*rel="modulepreload"[^>]*>/gi, "").replace("</body>", boot + "</body>"));
            }
            res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" } as Record<string, string>)[extname(file)] ?? "application/octet-stream");
            res.end(bytes);
        })().catch(() => { res.writeHead(404).end(); });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server port");
    return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function launch(): Promise<{ host: BrowserServer; browser: Browser }> {
    const host = await chromium.launchServer(browserOptions);
    return { host, browser: await chromium.connect(host.wsEndpoint()) };
}

async function stop(host: BrowserServer): Promise<void> {
    // Some serverless Chromium builds do not finish graceful shutdown.
    let timer: ReturnType<typeof setTimeout>;
    await Promise.race([
        host.close(),
        new Promise<void>((done) => {
            timer = setTimeout(() => { host.process().kill("SIGKILL"); done(); }, 1500);
        })
    ]).finally(() => clearTimeout(timer));
}

async function load(browser: Browser, origin: string, prefs: Prefs, scale = 1, dark = false): Promise<Page> {
    const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`${origin}/about.html?prefs=${encodeURIComponent(JSON.stringify(prefs))}&dark=${dark ? 1 : 0}`);
    await page.waitForFunction(() => window.__crtReady);
    if (prefs.textShadowEnabled) await page.waitForFunction(() => window.__crtScanPending === false, undefined, { timeout: 60000 });
    if (origin === servers.candidate.origin && prefs.phosphorEnabled && scale !== 1.25) {
        await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue("--effect-crt-phosphor-image").includes("blob:"));
    }
    await page.waitForTimeout(1500);
    return page;
}

function percentile(values: number[], fraction: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function summarise(samples: Sample[], events: TraceEvent[], phase: string) {
    const begin = events.find((event) => event.name === "TimeStamp" && event.args?.data?.message === `crt:${phase}:start`)?.ts;
    const end = events.find((event) => event.name === "TimeStamp" && event.args?.data?.message === `crt:${phase}:end`)?.ts;
    if (begin === undefined || end === undefined) throw new Error("Missing trace phase: " + phase);
    const selected = events.filter((event) => event.ts >= begin && event.ts < end);
    const draws = selected.filter((event) => event.name === "DrawFrame");
    const dropped = new Set(selected.filter((event) => event.name === "DroppedFrame").map((event) => `${event.args?.layerTreeId}:${event.args?.frameSeqId}`)).size;
    const intervals = samples.filter((sample) => sample.phase === phase).map((sample) => sample.dt).filter((dt) => dt > 0);
    const frameTimes = draws.slice(1).map((event, i) => (event.ts - draws[i]!.ts) / 1000);
    const work = (name: string) => selected.filter((event) => event.name === name && event.ph === "X").reduce((sum, event) => sum + (event.dur ?? 0), 0) / 1000;
    return { durationMs: (end - begin) / 1000, compositorDrawFps: draws.length * 1e6 / (end - begin), rafFps: intervals.length * 1000 / intervals.reduce((a, b) => a + b, 0), compositorP95Ms: percentile(frameTimes, .95), rafP95Ms: percentile(intervals, .95), droppedFrames: dropped, paintMs: work("Paint"), rasterMs: work("RasterTask") };
}

const servers = { baseline: await serve(baseline), candidate: await serve(candidate) };
const results: unknown[] = [];
let environment: unknown;
async function measure(version: keyof typeof servers, profile: string, repetition: number): Promise<void> {
    console.log("Starting", version, profile, repetition);
    const { host, browser } = await launch();
    try {
        const page = await load(browser, servers[version].origin, profiles[profile]!);
        const cdp = await page.context().newCDPSession(page);
        const system = await browser.newBrowserCDPSession();
        environment ??= { browser: browser.version(), system: await system.send("SystemInfo.getInfo"), platform: platform(), cpu: cpus()[0]?.model, logicalCpus: cpus().length, viewport, headless: browserOptions.headless };
        const texture = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--effect-crt-phosphor-image"));
        const textTargets = await page.locator(".text-shadow").count();
        await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,benchmark", transferMode: "ReturnAsStream" });
        await page.evaluate(() => {
            window.__crtSamples = []; window.__crtPhase = "idle"; window.__crtSampling = true;
            let previous: number | null = null;
            const tick = (now: number): void => {
                if (!window.__crtSampling) return;
                if (previous !== null) window.__crtSamples.push({ dt: now - previous, phase: window.__crtPhase });
                previous = now;
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
        const offsets: Record<string, number> = {};
        for (const phase of ["idle", "down", "up"]) {
            await page.evaluate((phase) => { window.__crtPhase = phase; console.timeStamp(`crt:${phase}:start`); }, phase);
            if (phase === "idle") await page.waitForTimeout(2500);
            if (phase !== "idle") await cdp.send("Input.synthesizeScrollGesture", { x: 900, y: 400, yDistance: phase === "down" ? -1800 : 1800, speed: 900, gestureSourceType: "mouse" });
            offsets[phase] = await page.evaluate((phase) => { console.timeStamp(`crt:${phase}:end`); return scrollY; }, phase);
        }
        if (offsets.down! < 1500 || offsets.up! > 5) throw new Error("Scroll did not traverse the document: " + JSON.stringify(offsets));
        const samples = await page.evaluate(() => { window.__crtSampling = false; return window.__crtSamples; });
        const completed = new Promise<{ stream?: string }>((done) => cdp.once("Tracing.tracingComplete", done));
        await cdp.send("Tracing.end");
        const { stream } = await completed;
        if (!stream) throw new Error("Chromium did not return a trace stream");
        let trace = "";
        let ended = false;
        while (!ended) { const chunk = await cdp.send("IO.read", { handle: stream, size: 1048576 }); trace += chunk.data; ended = chunk.eof; }
        await cdp.send("IO.close", { handle: stream });
        const events = (JSON.parse(trace) as { traceEvents: TraceEvent[] }).traceEvents;
        const row = { version, profile, repetition, textTargets, textureActive: texture.startsWith('url("blob:'), offsets, phases: Object.fromEntries(["idle", "down", "up"].map((phase) => [phase, summarise(samples, events, phase)])) };
        results.push(row);
        await writeFile(resolve(output, `${version}-${profile}-${repetition}.trace.json`), trace);
        await writeFile(resolve(output, "timings.json"), JSON.stringify({ environment, baselineSha: execFileSync("git", ["-C", baseline, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(), repeats, results }, null, 2));
        console.log(JSON.stringify(row));
    } finally { await stop(host); }
}

async function visualCheck(): Promise<void> {
    const { host, browser } = await launch();
    const checks: unknown[] = [];
    try {
        for (const scale of [1, 1.25, 2]) for (const dark of [false, true]) for (const opacity of [.048, .12]) {
            const pages = await Promise.all((Object.keys(servers) as (keyof typeof servers)[]).map(async (version) => ({ version, page: await load(browser, servers[version].origin, { ...base, phosphorOpacity: opacity }, scale, dark) })));
            for (const scroll of [0, 1200]) {
                const images: Buffer[] = [];
                for (const { version, page } of pages) {
                    await page.evaluate((y) => { scrollTo(0, y); for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 400; } }, scroll);
                    await page.waitForTimeout(150);
                    const image = await page.screenshot(); images.push(image);
                    await writeFile(resolve(output, `visual-${version}-${scale}-${dark}-${opacity}-${scroll}.png`), image);
                }
                const a = PNG.sync.read(images[0]!); const b = PNG.sync.read(images[1]!);
                let maxChannelDifference = 0; let differentPixels = 0; let totalDifference = 0;
                for (let i = 0; i < a.data.length; i += 4) {
                    const difference = [0, 1, 2].map((channel) => Math.abs(a.data[i + channel]! - b.data[i + channel]!));
                    maxChannelDifference = Math.max(maxChannelDifference, ...difference);
                    totalDifference += difference.reduce((sum, value) => sum + value, 0);
                    differentPixels += difference.some((value) => value > 0) ? 1 : 0;
                }
                checks.push({ scale, dark, opacity, scroll, maxChannelDifference, differentPixels, meanChannelDifference: totalDifference / (a.width * a.height * 3) });
            }
            for (const { page } of pages) await page.context().close();
        }
        await writeFile(resolve(output, "visuals.json"), JSON.stringify(checks, null, 2));
        console.log("Visual comparison:", JSON.stringify(checks));
    } finally { await stop(host); }
}
try {
    if (process.env.CRT_BENCH_VISUAL_ONLY !== "1") {
        for (let repetition = 0; repetition < repeats; repetition += 1) for (const profile of Object.keys(profiles)) {
            const order = repetition % 2 === 0 ? ["baseline", "candidate"] as const : ["candidate", "baseline"] as const;
            for (const version of order) await measure(version, profile, repetition);
        }
    }
    if (process.env.CRT_BENCH_SKIP_VISUALS !== "1") await visualCheck();
} finally { for (const { server } of Object.values(servers)) server.closeAllConnections(); for (const { server } of Object.values(servers)) server.close(); }
