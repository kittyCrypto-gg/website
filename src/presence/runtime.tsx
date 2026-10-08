import { render2Frag } from "../reactHelpers.tsx";
import type { JSX } from "react";
import { PresenceCard, PresenceErrorCard } from "./view.tsx";
import { PRESENCE_ENDPOINT, DEFAULT_PRESENCE_REFRESH_INTERVAL_MS, MINIMUM_PRESENCE_REFRESH_INTERVAL_MS, PRESENCE_VISIBILITY_THRESHOLD, isPresenceSnapshot, formatLocalDateTime } from "./model.ts";
import type { PresenceSnapshot, PresenceRuntimeState } from "./model.ts";

/**
 * Finds every place where presence content can be mounted.
 *
 * @returns {HTMLElement[]} All dedicated presence mount points.
 */
export function getPresenceMounts(): HTMLElement[] {
    return Array.from(document.querySelectorAll("[data-presence-mount='true'], .presence-window__mount"))
        .filter((node): node is HTMLElement => node instanceof HTMLElement);
}

/**
 * Picks the effective refresh interval from the visible mounts.
 * If several mounts are configured, the shortest valid interval wins.
 *
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @returns {number} Refresh interval in milliseconds.
 */
export function getPresenceRefreshInterval(mounts: readonly HTMLElement[]): number {
    const configuredIntervals = mounts
        .map((mount) => {
            const hostWindow = mount.closest(".presence-window");
            if (!(hostWindow instanceof HTMLElement)) return Number.NaN;
            return Number(hostWindow.dataset.presenceRefreshMs ?? "");
        })
        .filter((value) => Number.isFinite(value) && value >= MINIMUM_PRESENCE_REFRESH_INTERVAL_MS);

    if (configuredIntervals.length === 0) return DEFAULT_PRESENCE_REFRESH_INTERVAL_MS;
    return Math.min(...configuredIntervals);
}

/**
 * Renders the same TSX node into every presence mount.
 *
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {JSX.Element} node - TSX node to render into each mount.
 * @returns {void}
 */
export function renderIntoPresenceMounts(mounts: readonly HTMLElement[], node: JSX.Element): void {
    for (const mount of mounts) {
        mount.replaceChildren(render2Frag(node));
    }
}

/**
 * Fetches a fresh presence snapshot from the API.
 *
 * @returns {Promise<PresenceSnapshot>} Fresh presence payload.
 */
async function fetchPresence(): Promise<PresenceSnapshot> {
    const response = await fetch(PRESENCE_ENDPOINT, {
        headers: {
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`Presence API error: ${response}`);
    }

    const payload: unknown = await (response.json() as Promise<unknown>);
    if (!isPresenceSnapshot(payload)) {
        throw new Error("Presence API payload is invalid");
    }

    return payload;
}

/**
 * Clears the refresh timer if one is running.
 *
 * @returns {void}
 */
export function clearPresenceRefreshTimer(): void {
    if (typeof window.presenceRefreshTimer !== "number") return;

    window.clearTimeout(window.presenceRefreshTimer);
    delete window.presenceRefreshTimer;
}

/**
 * Clears the clock timer if one is running.
 *
 * @returns {void}
 */
export function clearPresenceClockTimer(): void {
    if (typeof window.presenceClockTimer !== "number") return;

    window.clearInterval(window.presenceClockTimer);
    delete window.presenceClockTimer;
}

/**
 * Checks whether at least one mount is visible.
 *
 * @param {PresenceRuntimeState} state - Current runtime state for the presence module.
 * @returns {boolean} True when at least one mount point is visible in the viewport.
 */
function hasVisiblePresenceMount(state: PresenceRuntimeState): boolean {
    return state.visibleMounts.size > 0;
}

/**
 * Repaints only canvas pixels, without changing the canvas attributes,
 * its intrinsic dimensions, or the surrounding presence card.
 */
function paintPresenceClocks(state: PresenceRuntimeState): void {
    if (document.hidden) return;

    const text = formatLocalDateTime(new Date());

    for (const mount of state.visibleMounts) {
        const canvas = mount.querySelector<HTMLCanvasElement>(".presence-panel__clock-canvas");
        if (!canvas) continue;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (width <= 0 || height <= 0) continue;

        const context = canvas.getContext("2d");
        if (!context) continue;

        // The canvas backing dimensions stay fixed at the markup's 640x48.
        // Updating canvas.width to match its CSS width changed its intrinsic
        // size, causing a shrink-to-fit/flex feedback loop each second.
        const style = getComputedStyle(canvas);
        context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
        context.clearRect(0, 0, width, height);
        context.font = style.font;
        context.fillStyle = style.color;
        context.textBaseline = "middle";
        context.textAlign = "left";
        context.letterSpacing = style.letterSpacing;
        context.fillText(text, 0, height / 2, width);
    }
}

/**
 * Keeps the local clock ticking while we have visible mounts and a snapshot to show.
 *
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {void}
 */
export function synchronisePresenceClock(mounts: readonly HTMLElement[], state: PresenceRuntimeState): void {
    clearPresenceClockTimer();

    if (!hasVisiblePresenceMount(state)) return;
    if (!state.latestSnapshot) return;
    if (document.hidden) return;

    paintPresenceClocks(state);
    window.presenceClockTimer = window.setInterval(() => {
        paintPresenceClocks(state);
    }, 1000);
}

/**
 * Fetches and renders the latest presence state.
 *
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {Promise<void>} Resolves after the refresh finishes.
 */
async function refreshPresence(mounts: readonly HTMLElement[], state: PresenceRuntimeState): Promise<void> {
    if (state.isRefreshing) return;
    if (!hasVisiblePresenceMount(state)) return;

    state.isRefreshing = true;

    try {
        const snapshot = await fetchPresence();
        const previous = state.latestSnapshot;
        state.latestSnapshot = snapshot;

        // Backend heartbeat timestamps do not change what the card shows.
        const changed = previous === null
            || previous.status !== snapshot.status
            || previous.isAfk !== snapshot.isAfk
            || previous.activity !== snapshot.activity
            || previous.lastActivityAt !== snapshot.lastActivityAt;

        if (changed) renderIntoPresenceMounts(mounts, <PresenceCard {...snapshot} />);
        state.hasLoadedOnce = true;
        state.lastRenderedAt = Date.now();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        state.latestSnapshot = null;
        renderIntoPresenceMounts(mounts, <PresenceErrorCard message={message} />);
        state.hasLoadedOnce = true;
        state.lastRenderedAt = Date.now();
    } finally {
        state.isRefreshing = false;
        synchronisePresenceClock(mounts, state);
    }
}

/**
 * Sets up or reschedules the refresh timer.
 *
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {number} refreshIntervalMs - Effective refresh interval in milliseconds.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {void}
 */
function synchronisePresenceRefresh(
    mounts: readonly HTMLElement[],
    refreshIntervalMs: number,
    state: PresenceRuntimeState
): void {
    clearPresenceRefreshTimer();

    if (!hasVisiblePresenceMount(state)) return;
    if (state.isRefreshing) return;

    const elapsedSinceRender = state.hasLoadedOnce
        ? Date.now() - state.lastRenderedAt
        : refreshIntervalMs;

    const nextRefreshDelay = state.hasLoadedOnce
        ? Math.max(refreshIntervalMs - elapsedSinceRender, 0)
        : 0;

    window.presenceRefreshTimer = window.setTimeout(async () => {
        await refreshPresence(mounts, state);
        synchronisePresenceRefresh(mounts, refreshIntervalMs, state);
    }, nextRefreshDelay);
}

/**
 * Watches mount visibility so we only refresh while something is on screen.
 *
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {number} refreshIntervalMs - Effective refresh interval in milliseconds.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {void}
 */
export function observePresenceVisibility(
    mounts: readonly HTMLElement[],
    refreshIntervalMs: number,
    state: PresenceRuntimeState
): void {
    if (typeof window.presenceViewportObserver !== "undefined") {
        window.presenceViewportObserver.disconnect();
        delete window.presenceViewportObserver;
    }

    if (!("IntersectionObserver" in window)) {
        for (const mount of mounts) {
            state.visibleMounts.add(mount);
        }

        synchronisePresenceRefresh(mounts, refreshIntervalMs, state);
        synchronisePresenceClock(mounts, state);
        return;
    }

    window.presenceViewportObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            const mount = entry.target;
            if (!(mount instanceof HTMLElement)) continue;

            if (entry.isIntersecting && entry.intersectionRatio >= PRESENCE_VISIBILITY_THRESHOLD) {
                state.visibleMounts.add(mount);
                continue;
            }

            state.visibleMounts.delete(mount);
        }

        synchronisePresenceRefresh(mounts, refreshIntervalMs, state);
        synchronisePresenceClock(mounts, state);
    }, {
        threshold: [0, PRESENCE_VISIBILITY_THRESHOLD, 0.25]
    });

    for (const mount of mounts) {
        window.presenceViewportObserver.observe(mount);
    }
}
