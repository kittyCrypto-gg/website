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

/**
 * Bash accepts adjacent quoted fragments as one assignment:
 *
 * PS1='\[\e[32m\]kitty@'\
 * '\H:\w\$ '
 *
 * It also allows an earlier Debian default PS1 to be overridden by a
 * later account-specific assignment. Evaluate those literals in order,
 * without evaluating commands or arbitrary Bash expressions.
 */
function quotedFragments(expression: string): string | null {
    let offset = 0;
    let output = "";
    let fragments = 0;
    while (offset < expression.length) {
        while (/\s/.test(expression.charAt(offset))) offset++;
        if (offset >= expression.length || expression.charAt(offset) === "#") break;

        const ansiQuoted = expression.startsWith("$'", offset);
        if (ansiQuoted) offset++;
        const quote = expression.charAt(offset);
        if (quote !== "'" && quote !== '"') return null;
        offset++;

        const beginning = offset;
        let escaped = false;
        while (offset < expression.length) {
            const char = expression.charAt(offset);
            if (quote === '"' && char === "\\" && !escaped) {
                escaped = true;
                offset++;
                continue;
            }
            if (char === quote && !escaped) break;
            escaped = false;
            offset++;
        }
        if (offset >= expression.length) return null;
        output += expression.slice(beginning, offset);
        fragments++;
        offset++;
    }
    return fragments > 0 ? output : null;
}

function bashValue(text: string): string | null {
    const lines = text.split(/\r?\n/);
    let last: string | null = null;
    for (let i = 0; i < lines.length; i++) {
        const assignment = /^\s*(?:export\s+)?PS1\s*=\s*(.*)$/.exec(lines[i]!);
        if (!assignment) continue;
        let expression = assignment[1]!;
        // Shell line-continuation removes the backslash and newline
        // before joining the next quoted fragment.
        while (/\\\s*$/.test(expression) && i + 1 < lines.length) {
            expression = expression.replace(/\\\s*$/, "") + lines[++i]!.trimStart();
        }
        const value = quotedFragments(expression);
        if (value !== null) last = value;
    }
    return last;
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
