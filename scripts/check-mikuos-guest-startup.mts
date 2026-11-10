import assert from "node:assert/strict";
import { applyGuestStartup, applyGuestTheme } from "../src/terminal/guestStartup.js";

const bashrc = [
    'if [ "$(id -u)" -eq 1001 ]; then',
    '  export PATH="/opt/kittyterm/bin:/opt/kittyterm/node/bin:$PATH"',
    "  alias neofetch='nekofetch'",
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
const env = new Map([["PATH", "/bin:/usr/bin"], ["HOME", "/home/kittyterm"]]);
const aliases = new Map<string, string>();
const shell = {
    s: {
        uid: 1001,
        env(name: string): string | undefined { return env.get(name); },
        setenv(name: string, value: string): void { env.set(name, value); },
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
        aliases,
        prefs: { history: true }
    }
};

applyGuestStartup(shell, "light");
assert.equal(env.get("PATH"), "/opt/kittyterm/bin:/opt/kittyterm/node/bin:/bin:/usr/bin");
assert.equal(aliases.get("neofetch"), "nekofetch");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku.txt");
assert.equal(env.get("NEKOFETCH_TEXT"), "00D7D7");
assert.equal(shell.sh.prefs.history, false, "Homeless guest must not save history");
assert.ok(!filesystem.has("/home/kittyterm"), "Startup must not create a home");

applyGuestTheme(shell, "dark");
assert.equal(env.get("ASCII_LOGO"), "/opt/kittyterm/data/miku-dark.txt");
assert.equal(env.get("WEB_UI_THEME"), "dark");
console.log("[mikuOS guest startup] UID-1001 Bash settings imported without creating a home.");
