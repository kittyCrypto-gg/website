const INTERACTION_KEY = "kc-terminal-interacted";

export function markTerminalInteracted(): void {
    try {
        window.sessionStorage.setItem(INTERACTION_KEY, "true");
    } catch {
        // An unavailable storage API does not prevent keyboard input.
    }
}

export function hasTerminalInteracted(): boolean {
    try {
        return window.sessionStorage.getItem(INTERACTION_KEY) === "true";
    } catch {
        return false;
    }
}
