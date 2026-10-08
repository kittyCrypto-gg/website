import { recreateSingleton } from "../domSingletons.ts";

/** Reuse a static shell button when present; keep old dynamic behaviour as fallback. */
export function obtainSiteToggle(id: string): HTMLButtonElement {
    const existing = document.getElementById(id);
    if (existing instanceof HTMLButtonElement) return existing;
    return recreateSingleton(id, () => document.createElement("button"), document);
}
