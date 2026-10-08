import { makeAuthorPillKey, makeDatePillKey } from "./filterModel.ts";
import type { PillSnap } from "./types.ts";

/**
 * Fly key, ish.
 * @param {HTMLElement} el
 * @returns {string | null}
 */
function getPillFlyKey(el: HTMLElement): string | null {
    const sumKey = el.dataset.rssFilterSummaryKey;
    if (sumKey) return sumKey;

    const ath = el.dataset.rssAuthor;
    if (ath) return makeAuthorPillKey(ath);

    const lvl = el.dataset.calLvl as "yr" | "mo" | "dy" | undefined;
    const rawVal = el.dataset.calVal ?? "";
    const val = Number(rawVal);

    if (!lvl || Number.isNaN(val)) return null;

    return makeDatePillKey(lvl, val);
}


/**
 * Pill spots.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {Map<string, PillSnap>}
 */
export function colPillRects(root: ParentNode, sel: string): Map<string, PillSnap> {
    const snaps = new Map<string, PillSnap>();

    Array.from(root.querySelectorAll<HTMLElement>(sel)).forEach((el) => {
        const key = getPillFlyKey(el);
        if (!key || snaps.has(key)) return;

        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        snaps.set(key, {
            key,
            rect,
            el
        });
    });

    return snaps;
}


/**
 * Css clock thing.
 * @param {string} raw
 * @param {number} fallback
 * @returns {number}
 */
function cssMs(raw: string, fallback: number): number {
    const value = raw.trim();

    if (value.endsWith("ms")) {
        const ms = Number.parseFloat(value);
        return Number.isFinite(ms) ? ms : fallback;
    }

    if (value.endsWith("s")) {
        const sec = Number.parseFloat(value);
        return Number.isFinite(sec) ? sec * 1000 : fallback;
    }

    return fallback;
}


/**
 * Flight timeout.
 * @returns {number}
 */
function pillFlyMs(): number {
    const styles = window.getComputedStyle(document.documentElement);
    const duration = styles.getPropertyValue("--kc-pill-migrate-duration");

    return cssMs(duration, 620) + 160;
}


/**
 * Little flying ghosts.
 * @param {ReadonlyMap<string, PillSnap>} from
 * @param {ReadonlyMap<string, PillSnap>} to
 * @returns {Promise<void>}
 */
export async function flyPills(
    from: ReadonlyMap<string, PillSnap>,
    to: ReadonlyMap<string, PillSnap>
): Promise<void> {
    const flights: Promise<void>[] = [];
    const timeoutMs = pillFlyMs();

    from.forEach((snap, key) => {
        const target = to.get(key);
        if (!target) return;

        const ghost = target.el.cloneNode(true);
        if (!(ghost instanceof HTMLElement)) return;

        ghost.classList.add("kc-pill-migrate-fly");
        ghost.removeAttribute("id");

        ghost.style.left = `${snap.rect.left}px`;
        ghost.style.top = `${snap.rect.top}px`;
        ghost.style.width = `${snap.rect.width}px`;
        ghost.style.height = `${snap.rect.height}px`;
        ghost.style.setProperty("--kc-pill-fly-x", `${target.rect.left - snap.rect.left}px`);
        ghost.style.setProperty("--kc-pill-fly-y", `${target.rect.top - snap.rect.top}px`);

        const flight = new Promise<void>((resolve) => {
            let done = false;

            const finish = (): void => {
                if (done) return;

                done = true;
                window.clearTimeout(timer);
                ghost.remove();
                resolve();
            };

            const timer = window.setTimeout(finish, timeoutMs);

            ghost.addEventListener("animationend", finish, { once: true });
            ghost.addEventListener("animationcancel", finish, { once: true });

            document.body.appendChild(ghost);
        });

        flights.push(flight);
    });

    return Promise.all(flights).then(() => undefined);
}

