/**
 * Browser-private interactive history for the intentionally homeless guest.
 *
 * Shell history is saved per browser origin, outside the guest filesystem.
 * The guest never gains a home directory or a guest history file.
 */
export interface HistoryStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface HistoryGuest {
    restoreHistory(entries: readonly string[]): void;
    os: {
        s: { uid: number };
        sh: {
        hist: string[];
        saveHistory(): void;
            prefs: { historySize: number; history: boolean };
        };
    };
}

function historyKey(account: string): string {
    return "kc:mikuos:command-history:v1:" + account;
}

/**
 * Restore previous command history and persist each subsequent thsh update.
 * thsh already filters secrets using its historyIgnorePatterns preference.
 */
export function attachBrowserHistory(
    guest: HistoryGuest,
    account: string,
    store: HistoryStore | null
): void {
    if (!store || guest.os.s.uid !== 1001 || !guest.os.sh.prefs.history) return;
    const key = historyKey(account);
    const capacity = Math.max(0, Math.min(1000, guest.os.sh.prefs.historySize));

    try {
        const raw = store.getItem(key);
        const parsed: unknown = raw === null ? [] : JSON.parse(raw);
        if (Array.isArray(parsed)) {
            const entries = parsed.filter((entry): entry is string =>
                typeof entry === "string" && entry.length <= 8192);
            guest.restoreHistory(entries.slice(-capacity));
        }
    } catch {
        // Storage is optional; the in-memory shell still works.
    }

    guest.os.sh.saveHistory = (): void => {
        try {
            store.setItem(key, JSON.stringify(guest.os.sh.hist.slice(-capacity)));
        } catch {
            // Storage blocked or full: continue with in-memory history.
        }
    };
}
