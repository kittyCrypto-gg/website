import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { runInNewContext } from "node:vm";

interface GuestSession {
    os: {
        run(command: string): Promise<number>;
        s: {
            read(path: string): string;
            stat(path: string): { kind: string; mode: number; uid: number; gid: number };
        };
    };
}

interface GuestHandle {
    kernel: string;
    session: GuestSession;
    dispose(): void;
}

interface BrowserApi {
    launchThistle(options: {
        terminal: object;
        config: object;
        kernel: string;
        rootBase: string;
        tetoBase: string;
        persistence: boolean;
    }): Promise<GuestHandle>;
}

const origin = "https://mikuos-smoke.invalid";
const assetRoot = resolve("dist/mikuos");
const config = JSON.parse(await readFile(join(assetRoot, "website-config.json"), "utf8")) as {
    kernel: string;
    system: { hostName: string; accounts: { web: {
        name: string; home: string; cred: { uid: number; gid: number }
    } } };
};

const rootManifest = JSON.parse(await readFile(join(assetRoot, "root/manifest.json"), "utf8")) as {
    entries: Array<{ p: string; k: string; mode: number; uid: number; gid: number }>;
};
const root = rootManifest.entries.find(entry => entry.p === "/");
assert.ok(root, "The guest root inode must be present");
assert.equal(root.k, "d");
assert.ok(root.mode & 0o400, "The guest root must be readable");

const account = config.system.accounts.web;
const guestHome = rootManifest.entries.find(entry => entry.p === account.home);
assert.ok(guestHome, "The guest home must exist");
assert.equal(guestHome.k, "d");
assert.equal(guestHome.uid, account.cred.uid, "The guest home must belong to the selected account");
assert.equal(guestHome.gid, account.cred.gid, "The guest home must belong to the selected group");

const required = ["/etc/passwd", "/etc/group", "/etc/hostname", "/bin/thsh", "/usr/bin/nano"];
for (const path of required) {
    assert.ok(rootManifest.entries.some(entry => entry.p === path), "Missing browser root entry: " + path);
}

async function localFetch(input: string | URL): Promise<Response> {
    const url = new URL(String(input));
    const prefix = "/dist/mikuos/";
    if (url.origin !== origin || !url.pathname.startsWith(prefix)) {
        throw new Error("Unexpected network access in mikuOS smoke test: " + url.href);
    }

    const source = resolve(assetRoot, url.pathname.slice(prefix.length));
    if (!source.startsWith(assetRoot + sep)) throw new Error("Static asset escapes mikuOS root");

    try {
        const data = await readFile(source);
        return new Response(new Uint8Array(data), { status: 200 });
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return new Response("not found", { status: 404 });
        }
        throw error;
    }
}

const output: string[] = [];
const terminal = {
    rows: 24,
    cols: 80,
    focus(): void {},
    write(value: string): void { output.push(value); },
    onData(): { dispose(): void } { return { dispose(): void {} }; },
    onResize(): { dispose(): void } { return { dispose(): void {} }; }
};

const script = await readFile(join(assetRoot, "thistle.js"), "utf8");
const context: Record<string, unknown> = {
    URL, Response, DecompressionStream, TextDecoder, TextEncoder,
    AbortController, AbortSignal, Headers, Request,
    Uint8Array, ArrayBuffer, console, setTimeout, clearTimeout, queueMicrotask,
    WebAssembly: (globalThis as unknown as { WebAssembly: unknown }).WebAssembly,
    performance, fetch: localFetch, navigator: {},
    location: { href: origin + "/" },
    document: {
        baseURI: origin + "/",
        currentScript: { getAttribute: (name: string) => name === "data-mikuos-embed" ? "true" : null },
        documentElement: { dataset: {} },
        querySelector: () => null
    }
};
context.window = context;

runInNewContext(script, context, { filename: "mikuos/thistle.js", timeout: 5000 });
const runtime = context.Thistle as BrowserApi | undefined;
assert.equal(typeof runtime?.launchThistle, "function", "The browser bundle must expose launchThistle");

const handle = await runtime!.launchThistle({
    terminal,
    config: config.system,
    kernel: config.kernel,
    rootBase: origin + "/dist/mikuos/root/",
    tetoBase: origin + "/dist/mikuos/teto/",
    persistence: false
});

try {
    const bootOutput = output.join("");
    assert.ok(bootOutput.startsWith("Welcome to mikuOS v0.3."),
        "Website terminal should open with the mikuOS welcome, not Teto diagnostics");
    assert.ok(!bootOutput.includes("Baguette-generated WebAssembly"),
        "Do not show the upstream kernel development banner on the website");

    assert.equal(handle.kernel, config.kernel === "auto" ? handle.kernel : config.kernel);
    assert.equal(handle.session.os.s.read("/etc/hostname").trim(), config.system.hostName);

    const passwd = handle.session.os.s.read("/etc/passwd");
    assert.match(passwd, new RegExp("^" + account.name + ":x:" + String(account.cred.uid) + ":" + String(account.cred.gid) + ":", "m"));

    const exitCode = await handle.session.os.run("echo website-mikuos-smoke");
    if (exitCode !== 0) {
        console.error("[mikuOS smoke] echo returned " + String(exitCode));
        console.error("[mikuOS smoke] terminal output: " + output.join("").slice(-3000));
    }
    assert.equal(exitCode, 0);
    assert.ok(output.join("").includes("website-mikuos-smoke"), "The shell must produce terminal output");

    console.log("[mikuOS smoke] " + handle.kernel + " kernel booted from the packed filesystem.");
    console.log("[mikuOS smoke] Hostname, guest identity, filesystem and shell execution verified.");
} finally {
    handle.dispose();
}
