import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { synchroniseRootMetadata } from "./build-mikuos.mjs";

const root = await mkdtemp(join(tmpdir(), "website-mikuos-root-"));

try {
    await mkdir(join(root, "usr/bin"), { recursive: true });
    await mkdir(join(root, "home/guest"), { recursive: true });
    await mkdir(join(root, "bin"), { recursive: true });
    await writeFile(join(root, "usr/bin/sudo"), "custom guest executable");
    await writeFile(join(root, "home/guest/new-file"), "custom guest data");
    await symlink("../usr/bin/sudo", join(root, "bin/sudo"));

    await writeFile(join(root, ".thistle-meta.json"), JSON.stringify({
        ent: [
            { p: "/", k: "d", id: 1, mode: 0o755, uid: 0, gid: 0, at: 1, mt: 1, ct: 1 },
            { p: "/usr/bin/sudo", k: "f", id: 2, mode: 0o4755, uid: 0, gid: 0, at: 2, mt: 2, ct: 2 },
            { p: "/deleted-file", k: "f", id: 3, mode: 0o644, uid: 0, gid: 0, at: 3, mt: 3, ct: 3 }
        ]
    }));

    const result = await synchroniseRootMetadata(root);
    const files = new Map(result.ent.map(entry => [entry.p, entry]));
    assert.equal(files.get("/")?.id, 1, "Retain the original root inode");
    assert.equal(files.get("/usr/bin/sudo")?.mode, 0o4755, "Preserve setuid bits from guest metadata");
    assert.equal(files.get("/usr/bin/sudo")?.id, 2, "Preserve executable inode");
    assert.ok(!files.has("/deleted-file"), "Do not package deleted files");
    assert.equal(files.get("/home/guest")?.uid, 1000, "New home directories belong to the guest");
    assert.equal(files.get("/home/guest/new-file")?.uid, 1000, "New home files belong to the guest");
    assert.equal(files.get("/bin/sudo")?.k, "l", "New symlinks must be indexed");

    const written = JSON.parse(await readFile(join(root, ".thistle-meta.json"), "utf8")) as {
        ent: Array<{ p: string }>;
    };
    assert.ok(written.ent.some(entry => entry.p === "/home/guest/new-file"));
    console.log("[mikuOS root] Custom binaries, permissions, symlinks and ownership verified.");
} finally {
    await rm(root, { recursive: true, force: true });
}
