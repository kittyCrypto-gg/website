import assert from "node:assert/strict";
import { applyGuestStartup, applyGuestTheme } from "../src/terminal/guestStartup.js";

const bashrc = [
    'if [ "$(id -u)" -eq 1001 ]; then',
    '  export PATH="/opt/kittyterm/bin:/opt/kittyterm/node/bin:$PATH"',
    "  alias neofetch='nekofetch'",
    "  PS1=,
    "  . /opt/kittyterm/scripts/asciilogo.sh",
    'fi'
].join("\n");
const startup = [
    'if [ "$WEB_UI_THEME" = "dark" ]; then',
    '  export ASCII_LOGO=/opt/kittyterm/data/miku-dark.txt',
    'else',
    '  export ASCII_LOGO=/opt/kittyterm/data/miku.txt',
    'fi',
    'export NEKOFETCH_TEXT=00D7D7'
].join("\n");
const filesystem = new Map([
    ["/etc/bash.bashrc", bashrc],
    ["/opt/kittyterm/scripts/asciilogo.sh", startup],
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

assert.equal(applyGuestStartup(shell, "light"), true,
    "A homeless guest must have its invalid working directory corrected");
assert.equal(env.get("PATH"), "/opt/kittyterm/bin:/opt/kittyterm/node/bin:/bin:/usr/bin");
assert.equal(aliases.get("neofetch"), "nekofetch");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku.txt");
assert.equal(env.get("NEKOFETCH_TEXT"), "00D7D7");
assert.equal(shell.sh.prefs.history, false, "Homeless guest must not save history");
assert.ok(!filesystem.has("/home/kittyterm"), "Startup must not create a home");
assert.equal(workingDirectory, "/", "Homeless guest shell must start at a readable directory");

const prompt = shell.sh.prompt();
assert.ok(prompt.includes("kitty@mikuos:/"), "Bash PS1 must replace the default kittyterm prompt");
assert.ok(prompt.includes("\x1b[38;5;34m"), "Bash PS1 must retain its green username");
assert.ok(prompt.includes("\x1b[38;5;135m"), "Bash PS1 must retain its purple directory");
assert.ok(prompt.includes("\x1b]12;#00d7d7\x07"), "Bash PS1 must preserve cursor-colour control");
assert.ok(!prompt.includes("kittyterm@"), "No default thsh prompt should remain");
assert.equal(env.get("HOME"), "/home/kittyterm", "Do not silently grant the guest a new home");

applyGuestTheme(shell, "dark");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku-dark.txt");
assert.equal(env.get("WEB_UI_THEME"), "dark");
console.log("[mikuOS guest startup] UID-1001 Bash prompt, settings and homeless account verified.");
\\[\\e]12;#00d7d7\\a\\]\\[\\e[38;5;34m\\]kitty@\\H\\[\\e[38;5;44m\\]:\\[\\e[38;5;135m\\]\\w\\[\\e[38;5;44m\\]\\$ \\[\\e[0m\\]'",
    "  . /opt/kittyterm/scripts/asciilogo.sh",
    'fi'
].join("\n");
const startup = [
    'if [ "$WEB_UI_THEME" = "dark" ]; then',
    '  export ASCII_LOGO=/opt/kittyterm/data/miku-dark.txt',
    'else',
    '  export ASCII_LOGO=/opt/kittyterm/data/miku.txt',
    'fi',
    'export NEKOFETCH_TEXT=00D7D7'
].join("\n");
const filesystem = new Map([
    ["/etc/bash.bashrc", bashrc],
    ["/opt/kittyterm/scripts/asciilogo.sh", startup],
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

assert.equal(applyGuestStartup(shell, "light"), true,
    "A homeless guest must have its invalid working directory corrected");
assert.equal(env.get("PATH"), "/opt/kittyterm/bin:/opt/kittyterm/node/bin:/bin:/usr/bin");
assert.equal(aliases.get("neofetch"), "nekofetch");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku.txt");
assert.equal(env.get("NEKOFETCH_TEXT"), "00D7D7");
assert.equal(shell.sh.prefs.history, false, "Homeless guest must not save history");
assert.ok(!filesystem.has("/home/kittyterm"), "Startup must not create a home");
assert.equal(workingDirectory, "/", "Homeless guest shell must start at a readable directory");

const prompt = shell.sh.prompt();
assert.ok(prompt.includes("kitty@mikuos:/"), "Bash PS1 must replace the default kittyterm prompt");
assert.ok(prompt.includes("\x1b[38;5;34m"), "Bash PS1 must retain its green username");
assert.ok(prompt.includes("\x1b[38;5;135m"), "Bash PS1 must retain its purple directory");
assert.ok(prompt.includes("\x1b]12;#00d7d7\x07"), "Bash PS1 must preserve cursor-colour control");
assert.ok(!prompt.includes("kittyterm@"), "No default thsh prompt should remain");
assert.equal(env.get("HOME"), "/home/kittyterm", "Do not silently grant the guest a new home");

applyGuestTheme(shell, "dark");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku-dark.txt");
assert.equal(env.get("WEB_UI_THEME"), "dark");
console.log("[mikuOS guest startup] UID-1001 Bash prompt, settings and homeless account verified.");
