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
        ensureUserState(): void;
        saveHistory(): void;
        aliases: Map<string, string>;
        prefs: { history: boolean; autocomplete: boolean };
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

interface PackedStartup {
    bashrc: string;
    logoScript: string;
}

/** The live guest overlay takes priority over the packaged base. */
function guestText(shell: GuestShell, path: string, packed = ""): string | null {
    return optionalRead(shell, path) ?? (packed || null);
}

function configuredLogos(script: string, theme: GuestTheme): string[] {
    const paths = [...new Set(
        [...script.matchAll(/\/opt\/kittyterm\/(?:data|scripts)\/[A-Za-z0-9._-]+\.txt/g)]
            .map(match => match[0])
            .filter(path => /miku/i.test(path))
    )];
    return paths.filter(path => theme === "dark"
        ? /dark/i.test(path)
        : !/dark/i.test(path));
}

function applyAsciiLogo(
    shell: GuestShell,
    theme: GuestTheme,
    bashrc: string,
    packed?: PackedStartup | null
): void {
    const scriptPath = "/opt/kittyterm/scripts/asciilogo.sh";
    if (!bashrc.includes(scriptPath)) return;
    const script = guestText(shell, scriptPath, packed?.logoScript);
    if (!script) return;

    shell.s.setenv("WEB_UI_THEME", theme);
    // Respect the filenames declared by asciilogo.sh, including different
    // directories and miku-light.txt rather than guessing a fixed name.
    for (const path of configuredLogos(script, theme)) {
        try {
            if (shell.s.stat(path).kind !== "file") continue;
            shell.s.setenv("ASCII_LOGO", path);
            break;
        } catch {
            // A variant may be absent; preserve the remaining candidates.
        }
    }

    const colour = /(?:export\s+)?NEKOFETCH_TEXT\s*=\s*["']?([A-Fa-f0-9]{6})/m.exec(script);
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

    // Initialise thsh preferences before disabling only disk history.
    // Autocomplete suggestions read the in-memory history, so setting
    // prefs.history=false would disable that feature as well.
    // A homeless guest must never create /home/kittyterm or a history file.
    shell.sh.ensureUserState();
    shell.sh.saveHistory = (): void => {};
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

export function applyGuestStartup(
    shell: GuestShell,
    theme: GuestTheme,
    packed?: PackedStartup | null
): boolean {
    if (shell.s.uid !== 1001) return false;
    const corrected = correctMissingHome(shell);
    const bashrc = guestText(shell, "/etc/bash.bashrc", packed?.bashrc);
    if (!bashrc) {
        console.warn("[mikuOS] UID-1001 Bash configuration is missing or unreadable.");
        return corrected;
    }

    addConfiguredPath(shell, bashrc);
    addConfiguredAliases(shell, bashrc);
    applyAsciiLogo(shell, theme, bashrc, packed);
    const colouredPrompt = applyConfiguredPrompt(shell, bashrc);
    return corrected || colouredPrompt;
}

export function applyGuestTheme(
    shell: GuestShell,
    theme: GuestTheme,
    packed?: PackedStartup | null
): void {
    if (shell.s.uid !== 1001) return;
    const bashrc = guestText(shell, "/etc/bash.bashrc", packed?.bashrc);
    if (!bashrc) return;
    applyAsciiLogo(shell, theme, bashrc, packed);
}
