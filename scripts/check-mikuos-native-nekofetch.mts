import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildMikuOSNekofetch } from "./build-mikuos-nekofetch.mjs";

// CI cannot access the website's private .thistle.base. Exercise the exact
// native cross-compiler against a disposable empty guest bin instead.
const testRoot = resolve(".build/nekofetch-native-smoke");
await mkdir(join(testRoot, "opt/kittyterm/bin"), { recursive: true });
await buildMikuOSNekofetch(testRoot, resolve("vendor/mikuOS"));

const binary = await readFile(join(testRoot, "opt/kittyterm/bin/nekofetch"));
assert.equal(binary.toString("ascii", 0, 4), "THX2");
assert.ok(binary.length > 512, "Native Nekofetch binary is unexpectedly small");
console.log("[nekofetch] Pinned mikuOS branch cross-compiled to THX2 successfully.");
