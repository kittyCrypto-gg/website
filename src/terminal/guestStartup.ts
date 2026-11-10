import { configuredBashPrompt } from "./bashPrompt.js";

/**
 * Apply the supported parts of the custom UID-1001 Bash configuration to
 * mikuOS's actual shell, thsh. Bash is not executed by the browser kernel.
 */
interface GuestShell {
    s: {
        uid: number;
        env(name: string): string | Map<string, string> | undefined;
        setenv(name: string, value: string): void;
        cd(path: string): void;
        read(path: string): string;
        stat(path: string): { kind: string };
    };
    sh: {
        prompt(): string;
        aliases: Map<string, string>;
        prefs: { history: boolean };
    };
}

export type GuestTheme = "dark" | "light";

function optionalRead(shell: GuestShell, path: string): string | null {
    try {
        return shell.s.read(path);
    } catch {
        return null;
    }
}

function currentPath(shell: GuestShell): string {
    const value = shell.s.env("PATH");
    return typeof value === "string" ? value : "/bin:/usr/bin";
}

function scopedBashPath(contents: string): string | null {
    const line = contents.split("\n").find(value =>
        /^\s*(?:export\s+)?PATH\s*=/.test(value) &&
        value.includes("/opt/kittyterm/bin"));
    if (!line) return null;
    const raw = line.split("=").slice(1).join("=").trim();
    return raw.replace(/^["']|["']$/g, "");
}

function addConfiguredPath(shell: GuestShell, bashrc: string): void {
    const path = scopedBashPath(bashrc);
    if (!path) return;
    const expanded = path
        .replace(/\$\{PATH\}|\$PATH/g, currentPath(shell))
        .split(":")
        .filter(part => part.length > 0);
    const unique = [...new Set(expanded)];
    shell.s.setenv("PATH", unique.join(":"));
}

function addConfiguredAliases(shell: GuestShell, bashrc: string): void {
    for (const line of bashrc.split("\n")) {
        const match = /^\s*alias\s+([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:'([^']*)'|"([^"]*)")\s*(?:#.*)?$/.exec(line);
        if (!match) continue;
        const value = match[2] ?? match[3] ?? "";
        if (!value || /[\r\n]/.test(value)) continue;
        shell.sh.aliases.set(match[1]!, value);
    }
}

function applyAsciiLogo(shell: GuestShell, theme: GuestTheme, bashrc: string): void {
    if (!bashrc.includes("/opt/kittyterm/scripts/asciilogo.sh")) return;
    const script = optionalRead(shell, "/opt/kittyterm/scripts/asciilogo.sh");
    if (!script) return;
    shell.s.setenv("WEB_UI_THEME", theme);

    const base = "/opt/kittyterm/data/";
    const filename = theme === "dark" ? "miku-dark.txt" : "miku.txt";
    if (script.includes(filename)) {
        try {
            shell.s.stat(base + filename);
            shell.s.setenv("ASCII_LOGO", base + filename);
        } catch {
            // The user's custom image may omit a logo variant.
        }
    }

    const colour = /(?:export\s+)?NEKOFETCH_TEXT\s*=\s*["']?([A-Fa-f0-9]{6})/.exec(script);
    if (colour) shell.s.setenv("NEKOFETCH_TEXT", colour[1]!);
}

/**
 * The kernel initially uses the account's HOME as its current directory,
 * even if that directory does not exist in the supplied filesystem.
 * A homeless guest must start from an existing directory instead.
 */
function correctMissingHome(shell: GuestShell): boolean {
    const home = shell.s.env("HOME");
    const path = typeof home === "string" ? home : "";
    try {
        if (path && shell.s.stat(path).kind === "dir") return false;
    } catch {
        // No home directory is expected for the unprivileged website guest.
    }

    shell.sh.prefs.history = false;
    shell.s.cd("/");
    return true;
}

function applyConfiguredPrompt(shell: GuestShell, bashrc: string): boolean {
    const nativePrompt = shell.sh.prompt.bind(shell.sh);
    const context = (): Parameters<typeof configuredBashPrompt>[1] => ({
        user: String(shell.s.env("USER") ?? "kittyterm"),
        host: String(shell.s.env("HOSTNAME") ?? "mikuos"),
        cwd: String(shell.s.env("PWD") ?? "/"),
        home: String(shell.s.env("HOME") ?? "/home/kittyterm"),
        root: shell.s.uid === 0
    });
    if (configuredBashPrompt(bashrc, context()) === null) return false;
    shell.sh.prompt = () => configuredBashPrompt(bashrc, context()) ?? nativePrompt();
    return true;
}

export function applyGuestStartup(shell: GuestShell, theme: GuestTheme): boolean {
    if (shell.s.uid !== 1001) return false;
    const corrected = correctMissingHome(shell);
    const bashrc = optionalRead(shell, "/etc/bash.bashrc");
    if (!bashrc) return corrected;

    addConfiguredPath(shell, bashrc);
    addConfiguredAliases(shell, bashrc);
    applyAsciiLogo(shell, theme, bashrc);
    const colouredPrompt = applyConfiguredPrompt(shell, bashrc);
    return corrected || colouredPrompt;
}

export function applyGuestTheme(shell: GuestShell, theme: GuestTheme): void {
    if (shell.s.uid !== 1001) return;
    const bashrc = optionalRead(shell, "/etc/bash.bashrc");
    if (!bashrc) return;
    applyAsciiLogo(shell, theme, bashrc);
}
