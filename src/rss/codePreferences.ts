import type { CodeVariant } from "./types.ts";

const STORAGE_KEY = "kittycrow:rss-code-language-preferences:v1";

function isStringRecord(value: unknown): value is Record<string, string> {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every(
        (item: unknown) => typeof item === "string"
    );
}

function getStorage(): Storage | null {
    if (typeof window === "undefined") return null;

    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

function readPreferences(): Record<string, string> {
    const storage = getStorage();
    if (!storage) return {};

    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return {};

        const parsed: unknown = JSON.parse(raw);
        return isStringRecord(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function saveCodePreference(
    groupKey: string,
    langKey: string
): void {
    const storage = getStorage();
    if (!storage) return;

    const preferences = readPreferences();
    preferences[groupKey] = langKey;

    try {
        storage.setItem(
            STORAGE_KEY,
            JSON.stringify(preferences)
        );
    } catch {
        return;
    }
}

function readCodePreference(groupKey: string): string | null {
    const preference = readPreferences()[groupKey];
    return preference && preference.trim().length > 0
        ? preference
        : null;
}

export function makeCodeGroupPreferenceKey(
    variants: readonly CodeVariant[]
): string {
    return Array.from(
        new Set<string>(
            variants.map((variant) => variant.langKey)
        )
    )
        .sort((left, right) => left.localeCompare(right))
        .join("|");
}

export function getPreferredCodeVariantIndex(
    variants: readonly CodeVariant[],
    groupKey: string
): number {
    const preferredLang = readCodePreference(groupKey);
    if (!preferredLang) return 0;

    const index = variants.findIndex(
        (variant) => variant.langKey === preferredLang
    );

    return index >= 0 ? index : 0;
}
