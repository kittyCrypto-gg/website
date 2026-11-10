import assert from "node:assert/strict";
import type { Terminal } from "@xterm/xterm";
import { bufferedGuestTerminal } from "../src/terminal/bootOutput.js";

const displayed: string[] = [];
const fake = {
    rows: 24,
    cols: 20,
    write(text: string): void { displayed.push(text); },
    focus(): void {},
    onData(): { dispose(): void } { return { dispose(): void {} }; },
    onResize(): { dispose(): void } { return { dispose(): void {} }; }
} as unknown as Terminal;

const buffer = bufferedGuestTerminal(fake);
buffer.terminal.write("Welcome to mikuOS v0.3.\r\n");
const old = "kittyterm@mikuos:/$ ";
buffer.terminal.write("\r\x1b[2K" + old);
assert.deepEqual(displayed, [], "No default prompt should leak before loading Bash PS1");

const coloured = "\x1b[38;5;34mkitty@mikuos:\x1b[38;5;135m/$ \x1b[0m";
buffer.release(old, coloured);
assert.equal(displayed.join(""), "Welcome to mikuOS v0.3.\r\n\r\x1b[2K" + coloured);
assert.ok(!displayed.join("").includes("kittyterm@"));

buffer.terminal.write("ready\r\n");
assert.ok(displayed.join("").endsWith("ready\r\n"));
console.log("[mikuOS first prompt] Original banner retained; configured Bash colours shown first.");
