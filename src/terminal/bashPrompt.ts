/**
 * Translate the Bash PS1 syntax used by the supplied kittyterm base into
 * terminal control sequences. thsh does not evaluate Bash configuration.
 * Unknown escape sequences are retained rather than evaluated as shell code.
 */
export interface PromptContext {
    user: string;
    host: string;
    cwd: string;
    home: string;
    root: boolean;
}

function bashValue(text: string): string | null {
    const line = text.split("\n").find(value =>
        /^\s*(?:export\s+)?PS1\s*=/.test(value));
    if (!line) return null;
    const raw = line.replace(/^\s*(?:export\s+)?PS1\s*=\s*/, "").trim();
    const prefix = raw.startsWith("$'") ? 2 : 1;
    const quote = raw.startsWith("$'") ? "'" : raw.charAt(0);
    if (quote !== "'" && quote !== '"') return null;
    const chars: string[] = [];
    let escaped = false;
    for (let i = prefix; i < raw.length; i++) {
        const char = raw.charAt(i);
        if (char === quote && !escaped) return chars.join("");
        chars.push(char);
        if (char === "\\" && !escaped) escaped = true;
        else escaped = false;
    }
    return null;
}

function decodeEscape(value: string, context: PromptContext): string {
    const cwd = context.cwd === context.home && context.home !== "/"
        ? "~" : context.cwd;
    const basename = cwd.split("/").filter(Boolean).at(-1) ?? "/";
    switch (value) {
        case "[": case "]": return "";
        case "e": case "033": case "x1b": return "\x1b";
        case "a": case "007": return "\x07";
        case "u": return context.user;
        case "H": return context.host;
        case "h": return context.host.split(".")[0] ?? context.host;
        case "w": return cwd;
        case "W": return basename;
        case "$": return context.root ? "#" : "$";
        case "n": return "\n";
        case "\\": return "\\";
        default: return "\\" + value;
    }
}

export function configuredBashPrompt(
    bashrc: string,
    context: PromptContext
): string | null {
    const value = bashValue(bashrc);
    if (value === null) return null;
    return value.replace(/\\(033|007|x1b|[\[\]eauHhwW$n\\])/g,
        (_, escape: string) => decodeEscape(escape, context));
}
