import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { runInNewContext } from "node:vm";
import { applyGuestStartup } from "../src/terminal/guestStartup.js";

interface GuestSession {
    os: {
        run(command: string, heredocBodies?: readonly string[], recordHistory?: boolean): Promise<number>;
        prompt(): string;
        flush(): Promise<void>;
        s: {
            uid: number;
            env(name: string): string | Map<string, string> | undefined;
            setenv(name: string, value: string): void;
            cd(path: string): void;
            read(path: string): string;
            mkfile(path: string, value: string, mode?: number): void;
            stat(path: string): { kind: string; mode: number; uid: number; gid: number };
        };
        sh: {
            prompt(): string;
            ensureUserState(): void;
            aliases: Map<string, string>;
            prefs: { history: boolean };
        };
    };
}

interface GuestHandle {
    kernel: string;
    persistent: boolean;
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
const bootWasm = await readFile(join(assetRoot, "boot.wasm"));
assert.ok(bootWasm.length < 32 * 1024,
    "The original full-colour Unicode artwork must fit in a lightweight preloaded WASM");
assert.equal(bootWasm.subarray(0, 4).toString("hex"), "0061736d",
    "The boot screen must be genuine WebAssembly, not a CSS mock");
const bootstrap = await readFile(join(assetRoot, "bootloader.js"), "utf8");
assert.ok(bootstrap.includes("MikuBoot"), "Missing upstream mikuOS boot bridge");
const homepage = await readFile(resolve("index.html"), "utf8");
assert.ok(!homepage.includes("terminal-loading") && !homepage.includes("Loading terminal..."),
    "The website must no longer render a separate hardcoded loading notice");
console.log("[mikuOS boot] Precompiled C/WASM splash and upstream bridge verified.");
const config = JSON.parse(await readFile(join(assetRoot, "website-config.json"), "utf8")) as {
    kernel: string;
    initialCommand: string;
    startup?: { bashrc: string; logoScript: string } | null;
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

// The custom CLI entry must use PATH and aliases, never an absolute
// filename baked into the website's first-launch configuration.
if (rootManifest.entries.some(entry => entry.p === "/opt/kittyterm/bin/nekofetch")) {
    assert.equal(config.initialCommand, "nekofetch",
        "Custom nekofetch must execute by name through the guest PATH");
    assert.ok(config.startup?.bashrc.includes("/opt/kittyterm/bin"),
        "The custom base must provide the Bash PATH setup");
    assert.match(config.startup!.bashrc, /^\s*alias\s+neofetch\s*=/m,
        "The custom base must retain its neofetch alias");
}
const account = config.system.accounts.web;
const guestHome = rootManifest.entries.find(entry => entry.p === account.home);
if (guestHome) {
    assert.equal(guestHome.k, "d");
    assert.equal(guestHome.uid, account.cred.uid, "Guest home ownership must match when a home exists");
    assert.equal(guestHome.gid, account.cred.gid);
}

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

interface MemoryFile {
    kind: "file";
    data: Uint8Array;
}
interface MemoryDirectory {
    kind: "directory";
    entries: Map<string, MemoryFile | MemoryDirectory>;
}
type MemoryNode = MemoryFile | MemoryDirectory;

class MemoryFolder {
    constructor(private readonly node: MemoryDirectory) {}

    private get(name: string, kind: MemoryNode["kind"], create = false): MemoryNode {
        let entry = this.node.entries.get(name);
        if (!entry && create) {
            entry = kind === "directory"
                ? { kind, entries: new Map() }
                : { kind, data: new Uint8Array() };
            this.node.entries.set(name, entry);
        }
        if (!entry) throw Object.assign(new Error("not found"), { name: "NotFoundError" });
        if (entry.kind !== kind) {
            throw Object.assign(new Error("type mismatch"), { name: "TypeMismatchError" });
        }
        return entry;
    }

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryFolder> {
        return new MemoryFolder(this.get(name, "directory", options?.create) as MemoryDirectory);
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<{
        getFile(): Promise<Blob>;
        createWritable(): Promise<{
            write(bytes: Uint8Array | string): Promise<void>;
            close(): Promise<void>;
        }>;
    }> {
        const file = this.get(name, "file", options?.create) as MemoryFile;
        return {
            async getFile(): Promise<Blob> { return new Blob([Uint8Array.from(file.data)]); },
            async createWritable() {
                let pending = new Uint8Array();
                return {
                    async write(bytes: Uint8Array | string): Promise<void> {
                        pending = typeof bytes === "string"
                            ? new TextEncoder().encode(bytes)
                            : Uint8Array.from(bytes);
                    },
                    async close(): Promise<void> { file.data = pending; }
                };
            }
        };
    }

    async removeEntry(name: string): Promise<void> {
        if (!this.node.entries.delete(name)) {
            throw Object.assign(new Error("not found"), { name: "NotFoundError" });
        }
    }
}

const persistentStorage = new MemoryFolder({ kind: "directory", entries: new Map() });
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
    performance, fetch: localFetch,
    // Browser realms expose global crypto. Node's vm context does not
    // inherit it, but mikuOS guest syscalls need Web Crypto entropy.
    crypto: webcrypto,
    navigator: { storage: { getDirectory: async () => persistentStorage } },
    location: { href: origin + "/" },
    document: {
        baseURI: origin + "/",
        currentScript: { getAttribute: (name: string) => name === "data-mikuos-embed" ? "true" : null },
        documentElement: { dataset: {} },
        querySelector: () => null
    }
};
context.window = context;
assert.equal(runInNewContext("crypto.getRandomValues(new Uint8Array(8)).length", context), 8,
    "The isolated browser realm must expose a working Web Crypto API");

runInNewContext(script, context, { filename: "mikuos/thistle.js", timeout: 5000 });
const runtime = context.Thistle as BrowserApi | undefined;
assert.equal(typeof runtime?.launchThistle, "function", "The browser bundle must expose launchThistle");

const handle = await runtime!.launchThistle({
    terminal,
    config: config.system,
    kernel: config.kernel,
    rootBase: origin + "/dist/mikuos/root/",
    tetoBase: origin + "/dist/mikuos/teto/",
    persistence: true
});

try {
    const bootOutput = output.join("");
    assert.ok(bootOutput.startsWith("Welcome to mikuOS v0.3."),
        "Website terminal should open with the mikuOS welcome, not Teto diagnostics");
    assert.ok(!bootOutput.includes("Baguette-generated WebAssembly"),
        "Do not show the upstream kernel development banner on the website");

    assert.equal(handle.kernel, config.kernel === "auto" ? handle.kernel : config.kernel);
    const correctedHome = applyGuestStartup(handle.session.os, "light", config.startup);
    if (account.cred.uid === 1001 && config.startup?.bashrc.includes("/opt/kittyterm/bin")) {
        const fullPrompt = handle.session.os.prompt();
        const readablePrompt = fullPrompt.replace(/\x1b\[[0-9;]*m/g, "")
            .replace(/\x1b\][^\x07]*\x07/g, "");
        assert.ok(readablePrompt.includes("kitty@" + config.system.hostName),
            "The actual custom base must display the final KittyTerm PS1");
        assert.ok(fullPrompt.includes("\x1b[38;5;34m"),
            "The actual custom prompt must retain the green username colour");
        const guestPath = handle.session.os.s.env("PATH");
        assert.ok(typeof guestPath === "string" &&
            guestPath.startsWith("/opt/kittyterm/bin:/opt/kittyterm/node/bin:"),
            "Custom /etc/bash.bashrc must add executable directories before first command");
        assert.equal(handle.session.os.sh.aliases.get("neofetch"), "nekofetch");
        const logo = handle.session.os.s.env("ASCII_LOGO");
        assert.ok(typeof logo === "string" && logo.includes("/miku"),
            "The sourced asciilogo.sh must set ASCII_LOGO");
        assert.equal(handle.session.os.s.stat(String(logo)).kind, "file",
            "Nekofetch logo must exist in the guest filesystem");
        console.log("[mikuOS custom Bash] PS1, PATH, alias and ASCII_LOGO verified.");
    }
    if (account.cred.uid === 1001 && !guestHome) {
        assert.equal(correctedHome, true, "Homeless UID-1001 shell must correct its working directory");
        const prompt = handle.session.os.prompt().replace(/\x1b\[[0-9;]*m/g, "");
        assert.ok(prompt.includes(":/"), "Homeless shell prompt must start at /, not the nonexistent home");
    }
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
    if (account.cred.uid === 1001 &&
        rootManifest.entries.some(entry => entry.p === "/opt/kittyterm/bin/nekofetch")) {
        const before = output.length;
        const status = await handle.session.os.run("nekofetch", [], false);
        const greeting = output.slice(before).join("");
        console.log("[mikuOS custom Bash] nekofetch exit " + String(status) +
            ", output " + JSON.stringify(greeting.slice(-3000)));
        if (status !== 0) {
            const explicitLogo = String(handle.session.os.s.env("ASCII_LOGO") ?? "");
            console.log("[mikuOS custom Bash] guest environment: PATH=" +
                String(handle.session.os.s.env("PATH")) +
                ", ASCII_LOGO=" + explicitLogo +
                ", TERM=" + String(handle.session.os.s.env("TERM")));
            // Differentiate environment propagation from problems inside
            // the binary without changing the browser's normal invocation.
            if (explicitLogo) {
                const beforeExplicit = output.length;
                const explicitStatus = await handle.session.os.run(
                    "nekofetch " + explicitLogo, [], false);
                console.log("[mikuOS custom Bash] explicit logo exit " +
                    String(explicitStatus) + ", output " +
                    JSON.stringify(output.slice(beforeExplicit).join("").slice(-3000)));
            }
        }
        assert.equal(status, 0, "Custom nekofetch failed. Review diagnostic output above.");
        assert.ok(!greeting.includes("No logo file specified"),
            "The custom ASCII_LOGO must be present before nekofetch starts");
        console.log("[mikuOS custom Bash] Nekofetch runs through PATH with its logo.");
    }

    // These two simple commands previously printed their result and then
    // produced "Maximum call stack size exceeded" in the website terminal.
    for (const command of ["whoami", "ls"]) {
        const before = output.length;
        const status = await handle.session.os.run(command);
        const text = output.slice(before).join("");
        console.log("[mikuOS commands] " + command + ": exit " + String(status) +
            ", output " + JSON.stringify(text.slice(-300)));
        assert.equal(status, 0, "Guest command failed: " + command);
        assert.ok(!text.includes("Maximum call stack size exceeded"),
            "Guest stack overflow after " + command);
    }

    assert.equal(handle.persistent, true, "OPFS support must activate the overlay");
    const overlayFile = "/tmp/.website-overlay-regression";
    handle.session.os.s.mkfile(overlayFile, "survives a browser reload", 0o600);
    await handle.session.os.flush();
    const opfsFolder = await persistentStorage.getDirectoryHandle(".mikuos");
    const opfsFile = await opfsFolder.getFileHandle(".thistle-overlay.json");
    const persisted = JSON.parse(await (await opfsFile.getFile()).text()) as {
        entries: Array<{ id: number; p: string; k: string }>;
    };
    const saved = persisted.entries.find(entry => entry.p === "/tmp/.website-overlay-regression");
    const conflicting = rootManifest.entries.find(entry => (entry as { id?: number }).id === saved?.id);
    console.log("[mikuOS overlay] New file ID: " + String(saved?.id) +
        ", existing base ID: " + String(conflicting?.p ?? "none"));
    console.log("[mikuOS smoke] " + handle.kernel + " kernel booted from the packed filesystem.");
    console.log("[mikuOS smoke] Hostname, guest identity, filesystem and shell execution verified.");
} finally {
    handle.dispose();
}

// Simulate a new browser document with the same origin and OPFS storage.
const reopened = await runtime!.launchThistle({
    terminal,
    config: config.system,
    kernel: config.kernel,
    rootBase: origin + "/dist/mikuos/root/",
    tetoBase: origin + "/dist/mikuos/teto/",
    persistence: true
});
try {
    assert.equal(reopened.session.os.s.read("/tmp/.website-overlay-regression"),
        "survives a browser reload");
    assert.ok(reopened.session.os.s.read("/etc/passwd").includes(account.name),
        "The static base must remain present underneath the overlay");
    console.log("[mikuOS overlay] Writable guest files survived a simulated page reload.");
} finally {
    reopened.dispose();
}
