import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, readFile, readdir, readlink, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";

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

interface GuestAccount {
    name: string;
    uid: number;
    gid: number;
    home: string;
    shell: string;
    groups: number[];
}

interface PackedGuest extends GuestAccount {
    rootBase: string;
    hostname: string;
    nekofetch: string | null;
    startup: { bashrc: string; logoScript: string } | null;
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
    const local = resolve("mikuOS/.thistle.base");

    try {
        const found = await lstat(local);
        if (!found.isDirectory() || found.isSymbolicLink()) {
            throw new Error("Website mikuOS/.thistle.base must be a real directory");
        }

        console.log("[mikuOS] Using website mikuOS/.thistle.base as the guest userland.");
        return local;
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const fallback = join(upstream, ".thistle.base");
    console.log("[mikuOS] Website mikuOS/.thistle.base is not present; using upstream guest root.");
    return fallback;
}

/**
 * The browser root packager consumes .thistle-meta.json, not a directory scan.
 * Reconcile it with the files actually supplied, otherwise freshly uploaded
 * binaries would be silently omitted from the deployed image.
 */
export async function synchroniseRootMetadata(rootDir: string = stage, account: Pick<GuestAccount, "home" | "uid" | "gid"> = { home: "/home/guest", uid: 1000, gid: 1000 }): Promise<RootMetadata> {
    const metadataPath = join(rootDir, ".thistle-meta.json");
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

    // The VFS requires the root inode itself. Git does not preserve POSIX
    // ownership or setuid bits, so metadata from the original image wins.
    const rootInfo = await lstat(rootDir);
    const oldRoot = prior.get("/");
    const rootTime = Math.trunc(rootInfo.mtimeMs / 1000);
    entries.push({
        p: "/",
        k: "d",
        id: oldRoot?.k === "d" ? oldRoot.id : ++nextId,
        mode: oldRoot?.k === "d" ? oldRoot.mode : 0o755,
        uid: oldRoot?.k === "d" ? oldRoot.uid : 0,
        gid: oldRoot?.k === "d" ? oldRoot.gid : 0,
        at: oldRoot?.at ?? rootTime,
        mt: oldRoot?.mt ?? rootTime,
        ct: oldRoot?.ct ?? rootTime
    });

    while (pending.length > 0) {
        const parent = pending.pop()!;
        const hostParent = parent === "/" ? rootDir : join(rootDir, parent.slice(1));
        const children = await readdir(hostParent, { withFileTypes: true });

        for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
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
            const home = guestPath === account.home ||
                guestPath.startsWith(account.home + "/");
            const entry: RootEntry = {
                p: guestPath,
                k: kind,
                id,
                mode: matched?.mode ?? (info.mode & 0o7777),
                uid: matched?.uid ?? (home ? account.uid : 0),
                gid: matched?.gid ?? (home ? account.gid : 0),
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

function guestPath(path: string): string {
    if (!path.startsWith("/") || path.split("/").some(part => part === ".." || part === ".")) {
        throw new Error("Guest account uses an unsafe absolute path: " + path);
    }
    return path;
}

function renameGroupMembership(content: string, from: string, to: string, shadow: boolean): string {
    return content.split("\n").map(line => {
        if (!line.trim()) return line;
        const fields = line.split(":");
        for (const index of shadow ? [2, 3] : [3]) {
            const members = fields[index];
            if (members === undefined) continue;
            fields[index] = members.split(",").map(member => member === from ? to : member).join(",");
        }
        return fields.join(":");
    }).join("\n");
}

export async function resolveGuestAccount(username: string, rootDir: string = stage): Promise<GuestAccount> {
    const passwdPath = join(rootDir, "etc/passwd");
    const passwd = await readFile(passwdPath, "utf8");
    let rows = passwd.split("\n");
    let chosen = rows.find(row => row.startsWith(username + ":"));

    if (!chosen) {
        const fallback = rows.findIndex(row => row.startsWith("guest:"));
        if (fallback < 0) {
            throw new Error("The custom userland has no account called " + username +
                " and no default guest account to rename");
        }

        rows[fallback] = username + rows[fallback]!.slice("guest".length);
        await writeFile(passwdPath, rows.join("\n"));
        const shadow = join(rootDir, "etc/shadow");
        const currentShadow = await readFile(shadow, "utf8");
        if (!currentShadow.split("\n").some(row => row.startsWith("guest:"))) {
            throw new Error("Cannot rename guest: missing /etc/shadow record");
        }
        await writeFile(shadow, currentShadow.replace(/^guest:/m, username + ":"));

        for (const [file, shadowGroups] of [["group", false], ["gshadow", true]] as const) {
            const path = join(rootDir, "etc", file);
            const members = await readFile(path, "utf8");
            await writeFile(path, renameGroupMembership(members, "guest", username, shadowGroups));
        }
        chosen = rows[fallback];
        console.log("[mikuOS] Renamed the upstream guest account to " + username + ".");
    }

    const columns = chosen.split(":");
    if (columns.length < 7) throw new Error("Invalid /etc/passwd record for " + username);
    const uid = Number(columns[2]);
    const gid = Number(columns[3]);
    if (!Number.isSafeInteger(uid) || uid < 1 || !Number.isSafeInteger(gid) || gid < 1) {
        throw new Error("The browser guest must have valid, non-root UID/GID");
    }

    const home = guestPath(columns[5]!);
    const shell = guestPath(columns[6]!);
    const memberships = (await readFile(join(rootDir, "etc/group"), "utf8"))
        .split("\n")
        .map(row => row.split(":"))
        .filter(fields => (fields[3] ?? "").split(",").includes(username))
        .map(fields => Number(fields[2]))
        .filter(value => Number.isSafeInteger(value) && value >= 0);
    const groups = [...new Set([gid, ...memberships])];

    return { name: username, uid, gid, home, shell, groups };
}

export async function selectGuestName(rootDir: string = stage): Promise<string> {
    const passwd = await readFile(join(rootDir, "etc/passwd"), "utf8");
    const candidates = passwd.split("\n").map(line => line.split(":")).filter(fields =>
        fields.length >= 7 &&
        validAccount(fields[0] ?? "") &&
        Number.isSafeInteger(Number(fields[2])) &&
        Number(fields[2]) >= 1000 &&
        fields[5]?.startsWith("/home/"));
    const custom = candidates.filter(fields => fields[0] !== "guest");
    const available = custom.length > 0 ? custom : candidates;
    if (available.length !== 1) {
        throw new Error("Cannot infer the browser guest from /etc/passwd. " +
            "Set username explicitly in config/mikuos.json. Found: " +
            candidates.map(fields => fields[0]).join(", "));
    }
    return available[0]![0]!;
}

async function packRoot(config: WebsiteMikuOSConfig): Promise<PackedGuest> {
    await rm(stage, { recursive: true, force: true });
    await mkdir(dirname(stage), { recursive: true });
    const sourceRoot = await rootSource();
    await cp(sourceRoot, stage, {
        recursive: true,
        verbatimSymlinks: true
    });

    // A homeless account still needs /tmp. Keep the temporary directory
    // writable and sticky, but do not synthesise the user's home.
    const tmp = join(stage, "tmp");
    await mkdir(tmp, { recursive: true, mode: 0o1777 });
    if (!(await lstat(tmp)).isDirectory()) throw new Error("Guest /tmp is not a directory");
    await chmod(tmp, 0o1777);

    // Existing web accounts and ownership inside a supplied image are
    // authoritative. The default guest can still be renamed via config.
    const username = config.username === "auto" ? await selectGuestName(stage) : config.username;
    const guest = await resolveGuestAccount(username);
    const hostname = config.hostname === "auto"
        ? (await readFile(join(stage, "etc/hostname"), "utf8")).trim()
        : config.hostname;
    if (!validHost(hostname)) throw new Error("Invalid hostname in the guest base: " + hostname);
    await synchroniseRootMetadata(stage, guest);

    // Identity from the supplied root wins in automatic mode. Explicit
    // website overrides still behave as they did before.
    if (config.hostname !== "auto") {
        await writeFile(join(stage, "etc/hostname"), hostname + "\n");
        await writeFile(join(stage, "etc/hosts"),
            "127.0.0.1 localhost " + hostname + "\n::1 localhost " + hostname + "\n");
    }
    console.log("[mikuOS] Guest identity: " + guest.name + "@" + hostname +
        " (UID " + String(guest.uid) + ").");

    // Keep the source Bash configuration authoritative even when the guest
    // user cannot synchronously read it under its restricted permissions.
    // This is a translation for thsh, not execution of Bash in the browser.
    const optionalText = async (path: string): Promise<string> => {
        try {
            return await readFile(join(stage, path), "utf8");
        } catch (error: unknown) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
            throw error;
        }
    };
    const bashrc = await optionalText("etc/bash.bashrc");
    const logoScript = await optionalText("opt/kittyterm/scripts/asciilogo.sh");
    const isCustomKittyterm = guest.uid === 1001 &&
        sourceRoot === resolve("mikuOS/.thistle.base");
    if (isCustomKittyterm && !/^[ \t]*(?:export[ \t]+)?PS1[ \t]*=/m.test(bashrc)) {
        throw new Error("Custom kittyterm image needs a PS1 assignment in " +
            "mikuOS/.thistle.base/etc/bash.bashrc");
    }
    if (isCustomKittyterm && !logoScript.includes("ASCII_LOGO")) {
        throw new Error("Custom kittyterm image needs ASCII_LOGO configuration in " +
            "mikuOS/.thistle.base/opt/kittyterm/scripts/asciilogo.sh");
    }
    if (isCustomKittyterm && !bashrc.includes("/opt/kittyterm/bin")) {
        throw new Error("Custom /etc/bash.bashrc must add /opt/kittyterm/bin to PATH");
    }
    if (isCustomKittyterm && !/^\s*alias\s+neofetch\s*=/m.test(bashrc)) {
        throw new Error("Custom /etc/bash.bashrc must define alias neofetch");
    }
    const startup = bashrc ? { bashrc, logoScript } : null;
    if (startup) console.log("[mikuOS] Embedded Bash startup configuration from guest root " +
        "(PS1: " + String(/^[ \t]*(?:export[ \t]+)?PS1[ \t]*=/m.test(bashrc)) +
        ", logo script: " + String(Boolean(logoScript)) + ").");

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

    // Each deployment must publish its root manifest, core and lazy blobs as
    // one immutable unit. Fixed URLs caused stale core.gz and a fresh manifest
    // to be mixed by browser/CDN caches, preventing the guest from mounting.
    const packedRoot = join(destination, "root");
    const packedManifest = await readFile(join(packedRoot, "manifest.json"));
    const fingerprint = createHash("sha256").update(packedManifest).digest("hex").slice(0, 16);
    const versionedName = "root-" + fingerprint;
    const versionedRoot = join(destination, versionedName);
    await rename(packedRoot, versionedRoot);

    // Keep the original URL working for terminal bundles already cached by
    // the local test browser. The versioned copy remains authoritative for
    // new sessions; the fallback is a complete copy, including lazy blobs.
    await cp(versionedRoot, packedRoot, { recursive: true });
    const rootBase = "/dist/mikuos/" + versionedName + "/";
    console.log("[mikuOS] Versioned root: " + rootBase + " (legacy /dist/mikuos/root/ retained).");

    const fetchers = metadata.ent.filter(entry =>
        entry.p.endsWith("/nekofetch") &&
        (entry.k === "l" || (entry.k === "f" && (entry.mode & 0o111) !== 0)));
    const preferred = ["/bin/nekofetch", "/usr/bin/nekofetch",
        "/usr/sbin/nekofetch", "/usr/local/bin/nekofetch"];
    const found = preferred.map(path => fetchers.find(entry => entry.p === path))
        .find(entry => entry !== undefined) ?? fetchers[0];
    const nekofetch = found?.p ?? null;
    return { ...guest, hostname, nekofetch, startup, rootBase };
}

export async function buildMikuOS(): Promise<void> {
    const config = JSON.parse(await readFile("config/mikuos.json", "utf8")) as WebsiteMikuOSConfig;
    if ((config.username !== "auto" && !validAccount(config.username)) ||
        (config.hostname !== "auto" && !validHost(config.hostname))) {
        throw new Error("mikuOS username or hostname is invalid");
    }
    if (!["teto", "thistle", "auto"].includes(config.kernel)) throw new Error("Invalid mikuOS kernel");
    if (typeof config.persistence !== "boolean" || typeof config.initialCommand !== "string") {
        throw new Error("Invalid mikuOS browser configuration");
    }
    if (!Array.isArray(config.packages)) throw new Error("mikuOS packages must be an array");

    const expected = execFileSync("git", ["rev-parse", "HEAD:vendor/mikuOS"],
        { encoding: "utf8" }).trim();
    const actual = execFileSync("git", ["rev-parse", "HEAD"],
        { cwd: upstream, encoding: "utf8" }).trim();
    if (actual !== expected) {
        throw new Error("The checked-out mikuOS submodule is stale. Website pins " +
            expected.slice(0, 8) + " but vendor/mikuOS contains " + actual.slice(0, 8) +
            ". Run: git submodule update --init --recursive");
    }
    console.log("[mikuOS] Building pinned upstream submodule " + actual.slice(0, 8) + "...");
    execFileSync("npm", ["ci"], { cwd: upstream, stdio: "inherit" });
    execFileSync("npm", ["run", "build"], { cwd: upstream, stdio: "inherit" });

    await cp(join(upstream, "dist/web"), destination, { recursive: true });

    // Website-only splash adaptation: approximate the midpoint of the
    // website's dark terminal gradient (#1b1b1b to #0e0e0e) with #151515.
    // Change only the boot programme's explicit black ANSI background
    // output. The CSS, xterm configuration and pinned WASM remain intact.
    const bootloaderPath = join(destination, "bootloader.js");
    const bootloader = await readFile(join(upstream, "src/boot/loader.js"), "utf8");
    const sourceWrite = "terminal.write(decoder.decode(data));";
    const themedWrite = 'terminal.write(decoder.decode(data).replaceAll("\\x1b[48;2;0;0;0m", "\\x1b[48;2;21;21;21m"));';
    if (bootloader.split(sourceWrite).length !== 2) {
        throw new Error("Pinned mikuOS bootloader source changed; check the website splash colour patch");
    }
    const websiteBoot = await transform(bootloader.replace(sourceWrite, themedWrite), {
        loader: "js",
        format: "iife",
        target: "es2022",
        minify: true,
        legalComments: "none"
    });
    await writeFile(bootloaderPath, websiteBoot.code);
    console.log("[mikuOS] Website splash uses ANSI background #151515; terminal styling unchanged.");

    const guest = await packRoot(config);

    const base = JSON.parse(await readFile(join(upstream, "mikuos.config.json"), "utf8")) as Record<string, unknown>;
    const accounts = base.accounts as Record<string, Record<string, unknown>>;
    const merged = {
        ...base,
        hostName: guest.hostname,
        // The kernel's development notice is useful upstream, but the
        // website banner should begin directly with the guest MOTD.
        messages: {
            ...(base.messages as Record<string, unknown>),
            tetoBanner: ""
        },
        accounts: {
            ...accounts,
            web: {
                ...accounts.web,
                name: guest.name,
                displayName: guest.name,
                home: guest.home,
                shell: guest.shell,
                cred: { uid: guest.uid, gid: guest.gid, groups: guest.groups }
            }
        }
    };
    const system = await import(pathToFileURL(join(upstream, "build/main/config.js")).href) as {
        mergeConfig(value: unknown): unknown;
    };
    // Retain the old website's automatic nekofetch greeting when the
    // custom image provides it, without breaking the upstream fallback.
    // The guest's Bash-derived PATH must resolve nekofetch itself. An
    // absolute path bypasses the user's shell configuration and aliases.
    const initialCommand = config.initialCommand === "nekofetch" &&
        guest.nekofetch === null ? "" : config.initialCommand;
    if (config.initialCommand === "nekofetch" && guest.nekofetch === null) {
        console.log("[mikuOS] No nekofetch in the guest root; skipping the optional startup greeting.");
    }
    await writeFile(join(destination, "website-config.json"),
        JSON.stringify({ system: system.mergeConfig(merged), kernel: config.kernel,
            persistence: config.persistence, initialCommand, startup: guest.startup,
            rootBase: guest.rootBase }, null, 2) + "\n");

    console.log("[mikuOS] Prepared complete standalone browser runtime and customised guest root.");
}
