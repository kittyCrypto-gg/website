import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

// Reviewed kitty-crow/nekofetch:mikuOS revision. The repository is private:
// read it from the established local checkout instead of an unauthenticated
// download or embedding its source in the public website repository.
const sourceRevision = "d5bc49e5c31e61f3af2782419dd5272ae16c23ee";

function git(args: string[]): string {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function availableRevision(repository: string, ref: string): string | null {
    try {
        return git(["-C", repository, "rev-parse", "--verify", ref]);
    } catch {
        return null;
    }
}

function localSourceRepository(): string {
    const candidates = [
        process.env.NEKOFETCH_MIKUOS_SOURCE,
        join(homedir(), "mikuOSWeb/nekofetch"),
        join(homedir(), "server/kittycrypto/nekofetch")
    ];
    for (const path of candidates) {
        if (path && existsSync(join(path, ".git"))) return resolve(path);
    }
    throw new Error("Private Nekofetch checkout not found. Expected " +
        "~/mikuOSWeb/nekofetch or ~/server/kittycrypto/nekofetch; " +
        "override with NEKOFETCH_MIKUOS_SOURCE.");
}

/**
 * Build from the source-controlled mikuOS branch into ONLY the disposable
 * packed guest root. The source checkout, private userland and node.39 are
 * never modified, even when compilation fails.
 */
export async function buildMikuOSNekofetch(rootDir: string, mikuOSHome: string): Promise<void> {
    const target = join(rootDir, "opt/kittyterm/bin/nekofetch");
    const binDir = dirname(target);
    const directory = await lstat(binDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
        throw new Error("Custom kittyterm bin must be a real directory: " + binDir);
    }

    const sourceRepo = localSourceRepository();
    const heads = [
        availableRevision(sourceRepo, "refs/heads/mikuOS"),
        availableRevision(sourceRepo, "refs/remotes/origin/mikuOS")
    ];
    if (!heads.includes(sourceRevision)) {
        throw new Error("Local Nekofetch mikuOS ref does not match pinned " +
            sourceRevision.slice(0, 8) + " (found " + heads.filter(Boolean).join(", ") +
            "). Fetch the mikuOS branch in " + sourceRepo +
            " and review source updates before changing the pinned revision.");
    }

    const buildDir = resolve(".build/nekofetch-mikuos-source");
    await rm(buildDir, { recursive: true, force: true });
    await mkdir(buildDir, { recursive: true });

    // git show reads the immutable pinned commit, NOT potentially edited
    // working-tree files. No checkout, reset, clone, branch switch or fetch.
    const nativeSource = execFileSync("git", [
        "-C", sourceRepo, "show", sourceRevision + ":nekofetch.c"
    ], { encoding: "utf8" });
    const sourcePath = join(buildDir, "nekofetch.c");
    await writeFile(sourcePath, nativeSource);
    // The native C translation unit includes this project-owned header.
    // Stage it from the same immutable commit, rather than the possibly
    // modified local checkout or a header from another Nekofetch revision.
    const colourTags = execFileSync("git", [
        "-C", sourceRepo, "show", sourceRevision + ":colour_tags.h"
    ], { encoding: "utf8" });
    await writeFile(join(buildDir, "colour_tags.h"), colourTags);

    const compiler = join(mikuOSHome, "thistlecc/bin/thistlecc.ts");
    const result = join(buildDir, "nekofetch.39");
    execFileSync("bun", [
        compiler, "--mikuos-home", mikuOSHome,
        "-DNEKOFETCH_MIKUOS", "-std=c11", "-O2",
        "-Wall", "-Wextra", "-Wpedantic",
        sourcePath, "-o", result
    ], { cwd: mikuOSHome, stdio: "inherit" });

    const binary = await readFile(result);
    if (binary.length < 16 || binary.toString("ascii", 0, 4) !== "THX2") {
        throw new Error("ThistleCC did not produce an RV64GC THX2 Nekofetch executable");
    }

    const next = target + ".new";
    await copyFile(result, next);
    await chmod(next, 0o755);
    await rename(next, target);
    console.log("[mikuOS] Built private nekofetch:mikuOS " + sourceRevision.slice(0, 8) +
        " into disposable packed guest root; source checkout and custom root untouched.");
}
