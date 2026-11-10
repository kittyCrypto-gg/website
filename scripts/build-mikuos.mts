import { execFileSync } from "node:child_process";
import { cp, lstat, mkdir, readFile, readdir, readlink, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

interface UpstreamPackage {
    kind: "upstream";
    name: string;
}
interface FilePackage {
    kind: "file";
    name: string;
    source: string;
    target: string;
}
type Package = UpstreamPackage | FilePackage;

interface WebsiteMikuOSConfig {
    hostname: string;
    username: string;
    kernel: "teto" | "thistle" | "auto";
    persistence: boolean;
    initialCommand: string;
    packages: Package[];
}

interface RootEntry {
    p: string;
    k: "d" | "f" | "l";
    id: number;
    mode: number;
    uid: number;
    gid: number;
    at: number;
    mt: number;
    ct: number;
}

interface RootMetadata {
    ent: RootEntry[];
    [field: string]: unknown;
}

const upstream = resolve("vendor/mikuOS");
const destination = resolve("dist/mikuos");
const stage = resolve(".build/mikuos-root");

function validAccount(value: string): boolean {
    return /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/.test(value);
}

function validHost(value: string): boolean {
    return /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,61}[A-Za-z0-9])?$/.test(value);
}

function safeTarget(target: string): string {
    const segments = target.split("/");
    if (!target.startsWith("/") || segments.includes("..") || segments.includes(".") || target.includes("\\")) {
        throw new Error("Unsafe guest package path: " + target);
    }

    const result = resolve(stage, "." + target);
    if (!result.startsWith(stage + sep)) throw new Error("Guest package escapes root: " + target);
    return result;
}

function safeSource(source: string): string {
    const base = resolve("config/mikuos-packages");
    const result = resolve(source);
    if (!result.startsWith(base + sep)) {
        throw new Error("Package source must be inside config/mikuos-packages/: " + source);
    }
    return result;
}

/**
 * Prefer the website's own complete guest filesystem when provided.
 * During the transition, builds can still use the untouched upstream root.
 */
async function rootSource(): Promise<string> {
    const local = resolve(".thistle.base");

    try {
        const found = await lstat(local);
        if (!found.isDirectory() || found.isSymbolicLink()) {
            throw new Error("Website .thistle.base must be a real directory");
        }

        console.log("[mikuOS] Using website .thistle.base as the guest userland.");
        return local;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const fallback = join(upstream, ".thistle.base");
    console.log("[mikuOS] Website .thistle.base is not present; using upstream guest root.");
    return fallback;
}

/**
 * The browser root packager consumes .thistle-meta.json, not a directory scan.
 * Reconcile it with the files actually supplied, otherwise freshly uploaded
 * binaries would be silently omitted from the deployed image.
 */
async function synchroniseRootMetadata(): Promise<RootMetadata> {
    const metadataPath = join(stage, ".thistle-meta.json");
    let original: RootMetadata = { ent: [] };

    try {
        original = JSON.parse(await readFile(metadataPath, "utf8")) as RootMetadata;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    if (!Array.isArray(original.ent)) {
        throw new Error("Custom .thistle.base has an invalid .thistle-meta.json entry list");
    }

    const prior = new Map(original.ent.map(entry => [entry.p, entry]));
    let nextId = original.ent.reduce((largest, entry) =>
        Math.max(largest, Number.isSafeInteger(entry.id) ? entry.id : 0), 0);
    const entries: RootEntry[] = [];
    const pending = ["/"];

    while (pending.length > 0) {
        const parent = pending.pop()!;
        const hostParent = parent === "/" ? stage : join(stage, parent.slice(1));
        const children = await readdir(hostParent, { withFileTypes: true });

        for (const child of children) {
            if (parent === "/" && child.name === ".thistle-meta.json") continue;

            const guestPath = parent === "/" ? "/" + child.name : parent + "/" + child.name;
            const hostPath = join(hostParent, child.name);
            const info = await lstat(hostPath);
            const kind = info.isDirectory()
                ? "d"
                : info.isFile()
                    ? "f"
                    : info.isSymbolicLink()
                        ? "l"
                        : null;
            if (!kind) throw new Error("Unsupported guest filesystem entry: " + guestPath);

            const previous = prior.get(guestPath);
            const matched = previous?.k === kind ? previous : undefined;
            const id = matched?.id ?? ++nextId;
            const time = Math.trunc(info.mtimeMs / 1000);
            const entry: RootEntry = {
                p: guestPath,
                k: kind,
                id,
                mode: info.mode & 0o7777,
                uid: matched?.uid ?? 0,
                gid: matched?.gid ?? 0,
                at: matched?.at ?? time,
                mt: matched?.mt ?? time,
                ct: matched?.ct ?? time,
                ...(kind === "l" ? { to: await readlink(hostPath) } : {})
            };
            entries.push(entry);
            if (kind === "d") pending.push(guestPath);
        }
    }

    original.ent = entries;
    await writeFile(metadataPath, JSON.stringify(original) + "\n");
    console.log("[mikuOS] Indexed " + String(entries.length) + " guest filesystem entries.");
    return original;
}

async function replaceText(file: string, pattern: RegExp, replacement: string): Promise<void> {
    const source = await readFile(file, "utf8");
    if (!pattern.test(source)) throw new Error("Missing expected guest identity in " + file);
    await writeFile(file, source.replace(pattern, replacement));
}

async function packRoot(config: WebsiteMikuOSConfig): Promise<void> {
    await rm(stage, { recursive: true, force: true });
    await mkdir(dirname(stage), { recursive: true });
    await cp(await rootSource(), stage, {
        recursive: true
    });

    // Metadata must be derived from the actual website image before applying
    // guest identity changes and the optional package additions.
    await synchroniseRootMetadata();

    const guest = config.username;
    await writeFile(join(stage, "etc/hostname"), config.hostname + "\n");
    await writeFile(join(stage, "etc/hosts"),
        "127.0.0.1 localhost " + config.hostname + "\n::1 localhost " + config.hostname + "\n");
    await replaceText(join(stage, "etc/passwd"),
        /^guest:x:1000:1000:[^\n]*$/m,
        guest + ":x:1000:1000:" + guest + ":/home/guest:/bin/thsh");
    await replaceText(join(stage, "etc/shadow"),
        /^guest:/m, guest + ":");
    await replaceText(join(stage, "etc/group"),
        /^(users:x:1000:)[^\n]*$/m, "$1" + guest);
    await replaceText(join(stage, "etc/gshadow"),
        /^(users:!::)[^\n]*$/m, "$1" + guest);

    const metadataPath = join(stage, ".thistle-meta.json");
    const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as RootMetadata;
    if (!Array.isArray(metadata.ent)) throw new Error("mikuOS base is missing root metadata");
    let id = Math.max(0, ...metadata.ent.map(entry => entry.id));

    for (const pkg of config.packages) {
        if (!validAccount(pkg.name)) throw new Error("Invalid package name: " + pkg.name);
        if (pkg.kind === "upstream") {
            const paths = ["/bin/", "/usr/bin/", "/usr/sbin/"].map(prefix => prefix + pkg.name);
            if (!paths.some(path => metadata.ent.some(entry => entry.p === path && entry.k === "f"))) {
                throw new Error("Required upstream guest package is absent: " + pkg.name);
            }
            continue;
        }

        if (pkg.kind !== "file") throw new Error("Unsupported guest package type");
        const source = safeSource(pkg.source);
        const target = safeTarget(pkg.target);
        const parent = pkg.target.slice(0, pkg.target.lastIndexOf("/")) || "/";
        if (!metadata.ent.some(entry => entry.p === parent && entry.k === "d")) {
            throw new Error("Package target directory is not in the guest root: " + parent);
        }
        if (metadata.ent.some(entry => entry.p === pkg.target)) {
            throw new Error("Package would overwrite an upstream guest file: " + pkg.target);
        }
        const input = await stat(source);
        if (!input.isFile()) throw new Error("Package source is not a file: " + pkg.source);
        await cp(source, target);
        metadata.ent.push({
            p: pkg.target,
            k: "f",
            id: ++id,
            mode: 0o755,
            uid: 0,
            gid: 0,
            at: 0,
            mt: 0,
            ct: 0
        });
    }

    await writeFile(metadataPath, JSON.stringify(metadata));
    const manifest = JSON.parse(await readFile(join(destination, "root/manifest.json"), "utf8")) as { image: number };
    const module = await import(pathToFileURL(join(upstream, "build/main/webroot.js")).href) as {
        WebRootPackage: new (root: string, output: string, image: number) => {
            build(): Promise<unknown>;
        };
    };
    await new module.WebRootPackage(stage, join(destination, "root"), manifest.image).build();
}

export async function buildMikuOS(): Promise<void> {
    const config = JSON.parse(await readFile("config/mikuos.json", "utf8")) as WebsiteMikuOSConfig;
    if (!validAccount(config.username) || !validHost(config.hostname)) {
        throw new Error("mikuOS username or hostname is invalid");
    }
    if (!["teto", "thistle", "auto"].includes(config.kernel)) throw new Error("Invalid mikuOS kernel");
    if (typeof config.persistence !== "boolean" || typeof config.initialCommand !== "string") {
        throw new Error("Invalid mikuOS browser configuration");
    }
    if (!Array.isArray(config.packages)) throw new Error("mikuOS packages must be an array");

    console.log("[mikuOS] Building pinned upstream submodule...");
    execFileSync("npm", ["ci"], { cwd: upstream, stdio: "inherit" });
    execFileSync("npm", ["run", "build"], { cwd: upstream, stdio: "inherit" });

    await cp(join(upstream, "dist/web"), destination, { recursive: true });
    await packRoot(config);

    const base = JSON.parse(await readFile(join(upstream, "mikuos.config.json"), "utf8")) as Record<string, unknown>;
    const accounts = base.accounts as Record<string, Record<string, unknown>>;
    const merged = {
        ...base,
        hostName: config.hostname,
        accounts: {
            ...accounts,
            web: {
                ...accounts.web,
                name: config.username,
                displayName: config.username,
                home: "/home/guest"
            }
        }
    };
    const system = await import(pathToFileURL(join(upstream, "build/main/config.js")).href) as {
        mergeConfig(value: unknown): unknown;
    };
    await writeFile(join(destination, "website-config.json"),
        JSON.stringify({ system: system.mergeConfig(merged), kernel: config.kernel,
            persistence: config.persistence, initialCommand: config.initialCommand }, null, 2) + "\n");

    console.log("[mikuOS] Prepared complete standalone browser runtime and customised guest root.");
}
