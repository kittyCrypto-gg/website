import assert from "node:assert/strict";
import { applyGuestStartup, applyGuestTheme } from "../src/terminal/guestStartup.js";

const ps1Body = "\\[\\e]12;#00d7d7\\a\\]\\[\\e[38;5;34m\\]kitty@\\H\\[\\e[38;5;44m\\]:\\[\\e[38;5;135m\\]\\w\\[\\e[38;5;44m\\]\\$ \\[\\e[0m\\]";
const bashrc = [
    'if [ "$(id -u)" -eq 1001 ]; then',
    '  export PATH="/opt/kittyterm/bin:/opt/kittyterm/node/bin:$PATH"',
    "  alias neofetch='nekofetch'",
    "  PS1=" + "$" + String.fromCharCode(39) + ps1Body + String.fromCharCode(39),
    "  . /opt/kittyterm/scripts/asciilogo.sh",
    'fi'
].join("\n");
const logoScript = [
    'if [ "$WEB_UI_THEME" = "dark" ]; then',
    '  export ASCII_LOGO=/opt/kittyterm/data/miku-dark.txt',
    'else',
    '  export ASCII_LOGO=/opt/kittyterm/data/miku.txt',
    'fi',
    'export NEKOFETCH_TEXT=00D7D7'
].join("\n");
const filesystem = new Map([
    ["/etc/bash.bashrc", bashrc],
    ["/opt/kittyterm/scripts/asciilogo.sh", logoScript],
    ["/opt/kittyterm/data/miku.txt", "test light logo"],
    ["/opt/kittyterm/data/miku-dark.txt", "test dark logo"]
]);
const env = new Map([["PATH", "/bin:/usr/bin"], ["HOME", "/home/kittyterm"],
    ["HOSTNAME", "mikuos"], ["USER", "kittyterm"]]);
const aliases = new Map<string, string>();
let workingDirectory = "/home/kittyterm";
const shell = {
    s: {
        uid: 1001,
        env(name: string): string | undefined { return env.get(name); },
        setenv(name: string, value: string): void { env.set(name, value); },
        cd(path: string): void { workingDirectory = path; env.set("PWD", path); },
        read(path: string): string {
            const content = filesystem.get(path);
            if (content === undefined) throw Object.assign(new Error("not found"), { code: "ENOENT" });
            return content;
        },
        stat(path: string): { kind: string } {
            if (!filesystem.has(path)) throw Object.assign(new Error("not found"), { code: "ENOENT" });
            return { kind: "file" };
        }
    },
    sh: {
        prompt(): string { return "kittyterm@mikuos:/$ "; },
        aliases,
        prefs: { history: true }
    }
};

assert.equal(applyGuestStartup(shell, "light"), true);
assert.equal(env.get("PATH"), "/opt/kittyterm/bin:/opt/kittyterm/node/bin:/bin:/usr/bin");
assert.equal(aliases.get("neofetch"), "nekofetch");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku.txt");
assert.equal(env.get("NEKOFETCH_TEXT"), "00D7D7");
assert.equal(shell.sh.prefs.history, false, "Homeless guest must not save history");
assert.ok(!filesystem.has("/home/kittyterm"));
assert.equal(workingDirectory, "/", "Shell must start in a readable directory");

const prompt = shell.sh.prompt();
const plainPrompt = prompt.replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "");
assert.ok(plainPrompt.includes("kitty@mikuos:/"), "Bash PS1 must override the shell username");
assert.ok(prompt.includes("\x1b[38;5;34m"), "Expected green username");
assert.ok(prompt.includes("\x1b[38;5;135m"), "Expected purple directory");
assert.ok(prompt.includes("\x1b]12;#00d7d7\x07"), "Expected cursor colour");
assert.ok(!prompt.includes("kittyterm@"));
assert.equal(env.get("HOME"), "/home/kittyterm");

applyGuestTheme(shell, "dark");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku-dark.txt");
assert.equal(env.get("WEB_UI_THEME"), "dark");
console.log("[mikuOS guest startup] Bash colours, aliases and homeless UID verified.");
