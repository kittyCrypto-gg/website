import * as uiFetch from "../uiFetch.ts";
import { prsNtcs } from "./parser.ts";
import { filterUnreadNotices } from "./storage.ts";
import { mountNotices } from "./window.ts";

export type { Ntc } from "./types.ts";
export { prsNtcs, fltActNtcs, getActNtcs } from "./parser.ts";
export { rndNtcs } from "./render.ts";
export { hydNtcs, popNtcs } from "./hydrate.ts";

function isIndexPath(raw: string): boolean {
    const path = raw.trim().toLowerCase();
    return path === "/" || path === "/index" || path === "/index.html";
}

export async function initNtcs(): Promise<void> {
    if (isIndexPath(window.location.pathname)) return;

    const raw = await uiFetch.fetchNtcsData().catch(() => null);
    if (!raw) return;

    const notices = await prsNtcs(raw);
    if (notices.length === 0) return;

    const visible = filterUnreadNotices(notices);
    if (visible.length === 0) return;

    mountNotices(visible);
}
