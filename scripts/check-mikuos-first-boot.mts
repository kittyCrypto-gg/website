import assert from "node:assert/strict";
import { runInitialCommand } from "../src/terminal/initialCommand.js";

const files = new Map<string, string>();
const sent: string[] = [];
let flushes = 0;

function fakeSession(): Parameters<typeof runInitialCommand>[0] {
    return {
        key(input: string): void { sent.push(input); },
        os: {
            s: {
                read(path: string): string {
                    const value = files.get(path);
                    if (value === undefined) {
                        throw Object.assign(new Error("missing file"), { code: "ENOENT" });
                    }
                    return value;
                },
                mkfile(path: string, value: string): void {
                    assert.ok(!files.has(path));
                    files.set(path, value);
                }
            },
            async flush(): Promise<void> { flushes++; }
        }
    };
}

const settings = {
    command: "/opt/kittyterm/bin/nekofetch",
    home: "/home/kittyterm",
    persistent: true
};
const ranFirst = await runInitialCommand(fakeSession(), settings);
assert.equal(ranFirst, true);
assert.deepEqual(sent, ["/opt/kittyterm/bin/nekofetch\r"]);
assert.equal(flushes, 1);

const ranAgain = await runInitialCommand(fakeSession(), settings);
assert.equal(ranAgain, false, "A second page load must not repeat the greeting");
assert.equal(sent.length, 1);
assert.equal(flushes, 1);
assert.ok(files.has("/home/kittyterm/.kittycrypto-web-banner-started"));

const newSessionWithoutPersistence = { ...settings, persistent: false };
assert.equal(await runInitialCommand(fakeSession(), newSessionWithoutPersistence), true);
assert.equal(sent.length, 2, "Non-persistent guests start a new session on every page load");

assert.equal(await runInitialCommand(fakeSession(), { ...settings, command: "" }), false);
assert.equal(sent.length, 2);
console.log("[mikuOS first boot] Greeting runs once per persistent filesystem, then stays suppressed.");
