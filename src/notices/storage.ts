import { fltActNtcs } from "./parser.ts";
import type { Ntc, Seen } from "./types.ts";

const STORAGE_KEY = "kc-ntcs-rd";

export function readSeen(): Seen {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];

        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        return parsed.filter(
            (item): item is string =>
                typeof item === "string" && item.trim().length > 0
        );
    } catch {
        return [];
    }
}

export function saveSeen(ids: Seen): void {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(Array.from(new Set(ids)))
        );
    } catch {
        // Storage can be blocked.
    }
}

export function filterUnreadNotices(
    notices: readonly Ntc[],
    now: Date = new Date(),
    seen: Seen = readSeen()
): readonly Ntc[] {
    const seenSet = new Set(seen);
    return fltActNtcs(notices, now)
        .filter((notice) => !seenSet.has(notice.id));
}
