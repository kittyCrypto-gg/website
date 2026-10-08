const SESSION_TOKEN_KEY = "kc-session-token";
const INTERACTION_KEY = "kc-terminal-interacted-token";
const PENDING_INTERACTION = "__pending__";

function readSessionValue(key: string): string | null {
    try {
        return window.sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeSessionValue(key: string, value: string): void {
    try {
        window.sessionStorage.setItem(key, value);
    } catch {
        // Ignore storage failures.
    }
}

function dropSessionValue(key: string): void {
    try {
        window.sessionStorage.removeItem(key);
    } catch {
        // Ignore storage failures.
    }
}

export function readTerminalSessionToken(): string | null {
    return readSessionValue(SESSION_TOKEN_KEY);
}

export function writeTerminalSessionToken(token: string): void {
    writeSessionValue(SESSION_TOKEN_KEY, token);
}

export function clearTerminalSessionState(): void {
    dropSessionValue(SESSION_TOKEN_KEY);
    dropSessionValue(INTERACTION_KEY);
}

export function markTerminalInteracted(): void {
    const token = readTerminalSessionToken();
    writeSessionValue(
        INTERACTION_KEY,
        token || PENDING_INTERACTION
    );
}

export function bindInteractionToSession(token: string): void {
    const marker = readSessionValue(INTERACTION_KEY);

    if (marker === PENDING_INTERACTION) {
        writeSessionValue(INTERACTION_KEY, token);
        return;
    }

    if (marker && marker !== token) {
        dropSessionValue(INTERACTION_KEY);
    }
}

export function hasTerminalInteracted(): boolean {
    const marker = readSessionValue(INTERACTION_KEY);
    if (!marker) return false;

    const token = readTerminalSessionToken();

    if (marker === PENDING_INTERACTION && token) {
        writeSessionValue(INTERACTION_KEY, token);
    }

    if (marker === PENDING_INTERACTION) return true;

    return !!token && marker === token;
}
