import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveGuestAccount, synchroniseRootMetadata } from "./build-mikuos.mjs";

const root = await mkdtemp(join(tmpdir(), "website-mikuos-account-"));

try {
    await mkdir(join(root, "etc"), { recursive: true });
    await mkdir(join(root, "home/kittyterm"), { recursive: true });
    await writeFile(join(root, "home/kittyterm/hello.txt"), "a custom home file");

    const passwd = [
        "root:x:0:0:root:/root:/bin/thsh",
        "guest:x:1000:1000:Guest:/home/guest:/bin/thsh",
        "kittyterm:x:1001:1001:Custom:/home/kittyterm:/bin/bash",
        ""
    ].join("\n");
    await writeFile(join(root, "etc/passwd"), passwd);
    await writeFile(join(root, "etc/group"), [
        "root:x:0:",
        "sudo:x:27:guest,kittyterm",
        "users:x:1000:guest",
        "kittyterm:x:1001:kittyterm",
        ""
    ].join("\n"));

    const existing = await resolveGuestAccount("kittyterm", root);
    assert.equal(existing.uid, 1001);
    assert.equal(existing.gid, 1001);
    assert.equal(existing.home, "/home/kittyterm");
    assert.equal(existing.shell, "/bin/bash");
    assert.deepEqual(existing.groups, [1001, 27]);
    assert.equal(await readFile(join(root, "etc/passwd"), "utf8"), passwd);

    const metadata = await synchroniseRootMetadata(root, existing);
    const byPath = new Map(metadata.ent.map(entry => [entry.p, entry]));
    assert.equal(byPath.get("/home/kittyterm")?.uid, 1001);
    assert.equal(byPath.get("/home/kittyterm/hello.txt")?.gid, 1001);

    await writeFile(join(root, "etc/shadow"), [
        "root:!:19723:0:99999:7:::",
        "guest:!:19723:0:99999:7:::",
        ""
    ].join("\n"));
    await writeFile(join(root, "etc/gshadow"), [
        "root:!::",
        "sudo:!::guest",
        "users:!::guest",
        ""
    ].join("\n"));

    const renamed = await resolveGuestAccount("webguest", root);
    assert.equal(renamed.uid, 1000);
    assert.equal(renamed.home, "/home/guest");
    const nextPasswd = await readFile(join(root, "etc/passwd"), "utf8");
    const nextShadow = await readFile(join(root, "etc/shadow"), "utf8");
    const nextGroup = await readFile(join(root, "etc/group"), "utf8");
    assert.match(nextPasswd, /^webguest:x:1000:1000:/m);
    assert.match(nextShadow, /^webguest:!/m);
    assert.match(nextGroup, /^sudo:x:27:webguest,kittyterm$/m);
    console.log("[mikuOS account] Existing UID 1001 account and default guest rename verified.");
} finally {
    await rm(root, { recursive: true, force: true });
}
