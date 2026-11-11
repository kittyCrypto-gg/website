import assert from "node:assert/strict";
import { runInitialCommand } from "../src/terminal/initialCommand.js";

const records = new Map<string, string>();
const sent: string[] = [];
const store = {
    getItem(key: string): string | null { return records.get(key) ?? null; },
    setItem(key: string, value: string): void { records.set(key, value); }
};
let exitOkay = true;
const session = {
    async execute(command: string): Promise<boolean> {
        sent.push(command);
        return exitOkay;
    }
};

const settings = {
    command: "/opt/kittyterm/bin/nekofetch",
    username: "kittyterm",
    persistent: true,
    store
};
exitOkay = false;
assert.equal(await runInitialCommand(session, settings), false);
assert.equal(records.size, 0, "Failed commands must not mark the first boot as finished");

exitOkay = true;
assert.equal(await runInitialCommand(session, settings), true);
assert.deepEqual(sent, [settings.command, settings.command]);
assert.equal(records.size, 1);

assert.equal(await runInitialCommand(session, settings), false,
    "A subsequent page load must not rerun the successful greeting");
assert.equal(sent.length, 2);

assert.equal(await runInitialCommand(session, { ...settings, persistent: false }), true);
assert.equal(sent.length, 3, "Without persistent storage each boot is new");

assert.equal(await runInitialCommand(session, { ...settings, username: "another-user" }), true);
assert.equal(sent.length, 4, "Different guest accounts must not share first-launch flags");

assert.equal(await runInitialCommand(session, { ...settings, command: "" }), false);
assert.equal(sent.length, 4);
console.log("[mikuOS first boot] Guest greeting runs directly, once after success.");
