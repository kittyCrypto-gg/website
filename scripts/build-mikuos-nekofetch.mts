import { execFileSync } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Verified head of kitty-crow/nekofetch:mikuOS. Never silently pick up changes
// to native guest executables without reviewing and updating this revision.
const sourceRevision = "372daa8b61b62bef2635d0efc9ba592d8df882fa";
const sourceUrl = "https://github.com/kitty-crow/nekofetch.git";

function git(args: string[]): string {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
}

/**
 * Replace ONLY the disposable packed guest's Nekofetch, not the user's
 * private mikuOS/.thistle.base, its logo, or any unrelated guest binary.
 */
export async function buildMikuOSNekofetch(rootDir: string, mikuOSHome: string): Promise<void> {
    const target = join(rootDir, "opt/kittyterm/bin/nekofetch");
    const binDir = dirname(target);
    const directory = await lstat(binDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
        throw new Error("Custom kittyterm bin directory must be a real directory: " + binDir);
    }
    // Do not depend on an old Nekofetch already being present. A new custom
    // root must also get the pinned native build.

    const checkout = resolve(".build/nekofetch-mikuos-source");
    // This is disposable, ignored build output. The private guest source is
    // never touched, even if the fetch or cross-compile fails.
    await rm(checkout, { recursive: true, force: true });
    await mkdir(dirname(checkout), { recursive: true });
    execFileSync("git", [
        "clone", "--quiet", "--depth", "1", "--single-branch", "--branch", "mikuOS",
        sourceUrl, checkout
    ], { stdio: "inherit" });

    const revision = git(["-C", checkout, "rev-parse", "HEAD"]);
    if (revision !== sourceRevision) {
        throw new Error("Nekofetch mikuOS branch advanced to " + revision +
            "; review it and update the pinned source revision before building");
    }

    const compiler = join(mikuOSHome, "thistlecc/bin/thistlecc.ts");
    const source = join(checkout, "nekofetch.c");
    const result = join(checkout, "nekofetch.39");

    execFileSync("bun", [
        compiler, "--mikuos-home", mikuOSHome,
        "-DNEKOFETCH_MIKUOS", "-std=c11", "-O2",
        "-Wall", "-Wextra", "-Wpedantic",
        source, "-o", result
    ], { cwd: mikuOSHome, stdio: "inherit" });

    const binary = await readFile(result);
    if (binary.length < 16 || binary.toString("ascii", 0, 4) !== "THX2") {
        throw new Error("ThistleCC did not produce an RV64GC THX2 Nekofetch executable");
    }

    // Only the staged copy is updated, atomically, after successful compilation.
    const next = target + ".new";
    await copyFile(result, next);
    await chmod(next, 0o755);
    await rename(next, target);
    console.log("[mikuOS] Installed nekofetch:mikuOS " + revision.slice(0, 8) +
        " into disposable packed guest root; private source filesystem unchanged.");
}
