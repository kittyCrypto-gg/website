import assert from "node:assert/strict";
import { runInitialCommand } from "../src/terminal/initialCommand.js";

const records = new Map<string, string>();
const sent: string[] = [];
const store = {
    getItem(key: string): string | null { return records.get(key) ?? null; },
    setItem(key: string, value: string): void { records.set(key, value); }
};
const session = { key(input: string): void { sent.push(input); } };

const settings = {
    command: "/opt/kittyterm/bin/nekofetch",
    username: "kittyterm",
    persistent: true,
    store
};
assert.equal(await runInitialCommand(session, settings), true);
assert.deepEqual(sent, ["/opt/kittyterm/bin/nekofetch\r"]);
assert.equal(records.size, 1);

assert.equal(await runInitialCommand(session, settings), false,
    "Reloading the same browser must not restart the greeting");
assert.equal(sent.length, 1);

assert.equal(await runInitialCommand(session, { ...settings, persistent: false }), true);
assert.equal(sent.length, 2, "Without persistent storage each boot is new");

assert.equal(await runInitialCommand(session, { ...settings, username: "another-user" }), true);
assert.equal(sent.length, 3, "Different guest accounts must not share first-launch flags");

assert.equal(await runInitialCommand(session, { ...settings, command: "" }), false);
assert.equal(sent.length, 3);
console.log("[mikuOS first boot] Homeless guest greeted once without writing to userland.");
