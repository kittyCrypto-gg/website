import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { runInNewContext } from "node:vm";

interface GuestSession {
    os: {
        run(command: string): Promise<number>;
        flush(): Promise<void>;
        s: {
            read(path: string): string;
            mkfile(path: string, value: string, mode?: number): void;
            stat(path: string): { kind: string; mode: number; uid: number; gid: number };
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
