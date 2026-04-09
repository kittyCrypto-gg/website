import { render2Frag } from "./reactHelpers.tsx";
import * as config from "./config.ts";
import * as helpers from "./helpers.ts";
import type { JSX } from "react";

declare global {
    interface Window {
        presenceRefreshTimer?: number;
        presenceClockTimer?: number;
        presenceViewportObserver?: IntersectionObserver;
    }
}

const PRESENCE_ENDPOINT = config.presenceEndpoint;
const DEFAULT_PRESENCE_REFRESH_INTERVAL_MS = 30000;
const MINIMUM_PRESENCE_REFRESH_INTERVAL_MS = 5000;
const PRESENCE_VISIBILITY_THRESHOLD = 0.05;

interface PresenceSnapshot {
    status: string;
    isAfk: boolean;
    activity: string;
    lastSshSeenAt: string;
    lastActivityAt: string;
    updatedAt: string;
}

type PresenceTone = "online" | "afk" | "terminal-afk" | "writing" | "active" | "offline";

interface PresencePresentation {
    tone: PresenceTone;
    emoji: string;
    badge: string;
    statusText: string;
    subline: string;
}

interface PresenceMetricProps {
    label: string;
    value: string;
    dateTime?: string;
}

interface PresenceRuntimeState {
    hasLoadedOnce: boolean;
    isRefreshing: boolean;
    lastRenderedAt: number;
    visibleMounts: Set<HTMLElement>;
    latestSnapshot: PresenceSnapshot | null;
}

/**
 * @param {unknown} value - JSON payload returned by the presence endpoint.
 * @returns {value is PresenceSnapshot} True when the payload matches the expected presence shape.
 */
function isPresenceSnapshot(value: unknown): value is PresenceSnapshot {
    if (!helpers.isRecord(value)) return false;

    return typeof value.status === "string"
        && typeof value.isAfk === "boolean"
        && typeof value.activity === "string"
        && typeof value.lastSshSeenAt === "string"
        && typeof value.lastActivityAt === "string"
        && typeof value.updatedAt === "string";
}

/**
 * @param {string} value - Raw token from the API.
 * @returns {string} Lower-cased, trimmed token for comparisons.
 */
function normaliseToken(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * @param {string} value - Raw token from the API.
 * @returns {string} Human-readable label with spacing and title casing.
 */
function humaniseToken(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "Unknown";

    return trimmed
        .split(/[\s_-]+/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

/**
 * @param {number} value - Numeric date part.
 * @returns {string} Two-digit string.
 */
function padDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * @param {string} value - API timestamp in "YYYY-MM-DD HH:mm:ss" form, interpreted as GMT/UTC.
 * @returns {Date | null} Parsed Date instance, or null when invalid.
 */
function parsePresenceDate(value: string): Date | null {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const match = trimmed.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
    );

    if (!match) return null;

    const [, year, month, day, hours, minutes, seconds] = match;

    const parsed = new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hours),
        Number(minutes),
        Number(seconds)
    ));

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * @param {Date} value - Date instance to format in the browser's local timezone.
 * @returns {string} Local display value in "YYYY.MM.DD HH:MM:SS" format.
 */
function formatLocalDateTime(value: Date): string {
    const year = value.getFullYear();
    const month = padDatePart(value.getMonth() + 1);
    const day = padDatePart(value.getDate());
    const hours = padDatePart(value.getHours());
    const minutes = padDatePart(value.getMinutes());
    const seconds = padDatePart(value.getSeconds());

    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * @param {Date} value - Date instance in the browser's local timezone.
 * @returns {string} UTC offset in "UTC+HH:MM" or "UTC-HH:MM" format.
 */
function formatUtcOffset(value: Date): string {
    const totalMinutes = -value.getTimezoneOffset();
    const sign = totalMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(totalMinutes);
    const hours = padDatePart(Math.floor(absoluteMinutes / 60));
    const minutes = padDatePart(absoluteMinutes % 60);

    return `UTC${sign}${hours}:${minutes}`;
}

/**
 * @param {string} value - API timestamp in "YYYY-MM-DD HH:mm:ss" form.
 * @returns {string} ISO datetime for the <time> element when parsing succeeds, otherwise an empty string.
 */
function toDateTimeAttribute(value: string): string {
    const parsed = parsePresenceDate(value);
    return parsed ? parsed.toISOString() : "";
}

/**
 * @param {string} value - API timestamp in "YYYY-MM-DD HH:mm:ss" form.
 * @returns {string} Local display value in "YYYY.MM.DD HH:MM:SS" format, or the raw input when parsing fails.
 */
function formatPresenceTimestamp(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "Not available";

    const parsed = parsePresenceDate(trimmed);
    if (!parsed) return trimmed;

    return formatLocalDateTime(parsed);
}

/**
 * @returns {{ currentDateTime: string; utcOffset: string; isoDateTime: string }} Current local clock details.
 */
function getCurrentLocalClock(): {
    currentDateTime: string;
    utcOffset: string;
    isoDateTime: string;
} {
    const now = new Date();

    return {
        currentDateTime: formatLocalDateTime(now),
        utcOffset: formatUtcOffset(now),
        isoDateTime: now.toISOString()
    };
}

/**
 * @param {PresenceSnapshot} snapshot - Validated presence payload.
 * @returns {PresencePresentation} Visual presentation details derived from the current presence state.
 */
function resolvePresencePresentation(snapshot: PresenceSnapshot): PresencePresentation {
    const status = normaliseToken(snapshot.status);
    const activity = normaliseToken(snapshot.activity);
    const isAway = status === "afk" || snapshot.isAfk;

    if (status === "offline") {
        return {
            tone: "offline",
            emoji: "⬛",
            badge: "Offline",
            statusText: "Offline",
            subline: "No live activity detected right now."
        };
    }

    if (isAway && activity === "programming") {
        return {
            tone: "terminal-afk",
            emoji: "🟥",
            badge: "AFK on terminal",
            statusText: "Away",
            subline: "Terminal session still visible, but Kitty seems away."
        };
    }

    if (isAway) {
        return {
            tone: "afk",
            emoji: "🟨",
            badge: "AFK",
            statusText: "Away",
            subline: "Currently away from the keyboard."
        };
    }

    if (activity === "programming") {
        return {
            tone: "online",
            emoji: "🟩",
            badge: "Online",
            statusText: "Programming",
            subline: "Locked in and actively coding."
        };
    }

    if (activity === "writing") {
        return {
            tone: "writing",
            emoji: "🟪",
            badge: "Writing",
            statusText: "Writing",
            subline: "Deep in the words and flowing."
        };
    }

    return {
        tone: "active",
        emoji: "🟦",
        badge: "Active",
        statusText: humaniseToken(snapshot.activity),
        subline: "Working on something right now."
    };
}

/**
 * @param {PresenceMetricProps} props - Metric label/value pair.
 * @returns {JSX.Element} Structured metric card for the presence details grid.
 */
function PresenceMetric(props: PresenceMetricProps): JSX.Element {
    return (
        <div className="presence-panel__metric">
            <dt className="presence-panel__metric-label">{props.label}</dt>
            <dd className="presence-panel__metric-value">
                <time dateTime={props.dateTime || undefined}>{props.value}</time>
            </dd>
        </div>
    );
}

/**
 * @param {PresencePresentation} presentation - Current visual presentation details.
 * @returns {JSX.Element} Status pill rendered above the hero.
 */
function PresencePill(presentation: PresencePresentation): JSX.Element {
    return (
        <div className="stats-segment presence-panel__pill">
            <span className="presence-panel__pill-emoji" aria-hidden="true">{presentation.emoji}</span>
            <span className="presence-panel__pill-label">{presentation.badge}</span>
        </div>
    );
}

/**
 * @returns {JSX.Element} Secondary hero showing the current local clock and UTC offset.
 */
function PresenceLocalTimeHero(): JSX.Element {
    const localClock = getCurrentLocalClock();

    return (
        <section className="presence-panel__hero presence-panel__hero--clock">
            <div className="presence-panel__hero-copy">
                <div className="presence-panel__hero-label">Kitty&apos;s local time</div>
                <div className="presence-panel__headline presence-panel__headline--clock">
                    <time dateTime={localClock.isoDateTime}>{localClock.currentDateTime}</time>
                </div>
                <p className="presence-panel__subline">{localClock.utcOffset}</p>
            </div>
        </section>
    );
}

/**
 * @param {PresenceSnapshot} snapshot - Current presence payload.
 * @returns {JSX.Element} Rendered presence card.
 */
function PresenceCard(snapshot: PresenceSnapshot): JSX.Element {
    const presentation = resolvePresencePresentation(snapshot);
    const lastActivityDateTime = toDateTimeAttribute(snapshot.lastActivityAt);

    return (
        <article className="presence-panel" data-presence-tone={presentation.tone}>
            <PresencePill {...presentation} />

            <section className="presence-panel__hero">
                <div className="presence-panel__hero-copy">
                    <div className="presence-panel__hero-label">
                        Kitty is: <span>&nbsp;</span>
                        {presentation.statusText}
                    </div>

                    <p className="presence-panel__subline">{presentation.subline}</p>
                </div>
            </section>

            <dl className="presence-panel__grid">
                <PresenceMetric
                    label="Last activity"
                    value={formatPresenceTimestamp(snapshot.lastActivityAt)}
                    dateTime={lastActivityDateTime || undefined}
                />
            </dl>

            <PresenceLocalTimeHero />
        </article>
    );
}

/**
 * @param {{ message: string }} props - Component props.
 * @returns {JSX.Element} Lightweight loading state card.
 */
function PresenceLoadingCard(props: { message: string }): JSX.Element {
    const presentation: PresencePresentation = {
        tone: "active",
        emoji: "🟦",
        badge: "Loading",
        statusText: "Loading",
        subline: props.message
    };

    return (
        <article className="presence-panel presence-panel--loading" data-presence-tone={presentation.tone}>
            <PresencePill {...presentation} />

            <section className="presence-panel__hero">
                <div className="presence-panel__hero-copy">
                    <div className="presence-panel__hero-label">
                        Kitty is: <span>&nbsp;</span>
                        {presentation.statusText}
                    </div>

                    <p className="presence-panel__subline">{presentation.subline}</p>
                </div>
            </section>
        </article>
    );
}

/**
 * @param {{ message: string }} props - Component props.
 * @returns {JSX.Element} Error state card for failed presence requests.
 */
function PresenceErrorCard(props: { message: string }): JSX.Element {
    const presentation: PresencePresentation = {
        tone: "offline",
        emoji: "⬛",
        badge: "Unavailable",
        statusText: "Unavailable",
        subline: props.message
    };

    return (
        <article className="presence-panel presence-panel--error" data-presence-tone={presentation.tone}>
            <PresencePill {...presentation} />

            <section className="presence-panel__hero">
                <div className="presence-panel__hero-copy">
                    <div className="presence-panel__hero-label">
                        Kitty is: <span>&nbsp;</span>
                        {presentation.statusText}
                    </div>

                    <p className="presence-panel__subline">{presentation.subline}</p>
                </div>
            </section>
        </article>
    );
}

/**
 * @returns {HTMLElement[]} All dedicated presence content mount points.
 */
function getPresenceMounts(): HTMLElement[] {
    return Array.from(document.querySelectorAll("[data-presence-mount='true'], .presence-window__mount"))
        .filter((node): node is HTMLElement => node instanceof HTMLElement);
}

/**
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @returns {number} Refresh interval in milliseconds, using the lowest valid configured value across mount points.
 */
function getPresenceRefreshInterval(mounts: readonly HTMLElement[]): number {
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
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {JSX.Element} node - TSX node to render into each mount point.
 * @returns {void}
 */
function renderIntoPresenceMounts(mounts: readonly HTMLElement[], node: JSX.Element): void {
    for (const mount of mounts) {
        mount.replaceChildren(render2Frag(node));
    }
}

/**
 * @returns {Promise<PresenceSnapshot>} Fresh presence payload from the API.
 */
async function fetchPresence(): Promise<PresenceSnapshot> {
    const response = await fetch(PRESENCE_ENDPOINT, {
        headers: {
            Accept: "application/json"
        }
    });

    if (!response.ok) {
        throw new Error(`Presence API error: ${response.status}`);
    }

    const payload: unknown = await (response.json() as Promise<unknown>);
    if (!isPresenceSnapshot(payload)) {
        throw new Error("Presence API payload is invalid");
    }

    return payload;
}

/**
 * @returns {void}
 */
function clearPresenceRefreshTimer(): void {
    if (typeof window.presenceRefreshTimer !== "number") return;

    window.clearTimeout(window.presenceRefreshTimer);
    delete window.presenceRefreshTimer;
}

/**
 * @returns {void}
 */
function clearPresenceClockTimer(): void {
    if (typeof window.presenceClockTimer !== "number") return;

    window.clearInterval(window.presenceClockTimer);
    delete window.presenceClockTimer;
}

/**
 * @param {PresenceRuntimeState} state - Current runtime state for the presence module.
 * @returns {boolean} True when at least one mount point is visible in the viewport.
 */
function hasVisiblePresenceMount(state: PresenceRuntimeState): boolean {
    return state.visibleMounts.size > 0;
}

/**
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {void}
 */
function synchronisePresenceClock(mounts: readonly HTMLElement[], state: PresenceRuntimeState): void {
    clearPresenceClockTimer();

    if (!hasVisiblePresenceMount(state)) return;
    if (!state.latestSnapshot) return;

    window.presenceClockTimer = window.setInterval(() => {
        const latestSnapshot = state.latestSnapshot;
        if (!latestSnapshot) return;

        renderIntoPresenceMounts(mounts, <PresenceCard {...latestSnapshot} />);
    }, 1000);
}

/**
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {Promise<void>} Resolves after fetching and rendering the latest presence.
 */
async function refreshPresence(mounts: readonly HTMLElement[], state: PresenceRuntimeState): Promise<void> {
    if (state.isRefreshing) return;
    if (!hasVisiblePresenceMount(state)) return;

    state.isRefreshing = true;

    try {
        const snapshot = await fetchPresence();
        state.latestSnapshot = snapshot;
        renderIntoPresenceMounts(mounts, <PresenceCard {...snapshot} />);
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
 * @param {readonly HTMLElement[]} mounts - Presence content mount points.
 * @param {number} refreshIntervalMs - Effective refresh interval in milliseconds.
 * @param {PresenceRuntimeState} state - Runtime state for the presence module.
 * @returns {void}
 */
function observePresenceVisibility(
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

(() => {
    const mounts = getPresenceMounts();
    if (mounts.length === 0) return;

    const refreshIntervalMs = getPresenceRefreshInterval(mounts);
    const runtimeState: PresenceRuntimeState = {
        hasLoadedOnce: false,
        isRefreshing: false,
        lastRenderedAt: 0,
        visibleMounts: new Set<HTMLElement>(),
        latestSnapshot: null
    };

    clearPresenceRefreshTimer();
    clearPresenceClockTimer();

    renderIntoPresenceMounts(
        mounts,
        <PresenceLoadingCard message="Contacting the live presence endpoint." />
    );

    observePresenceVisibility(mounts, refreshIntervalMs, runtimeState);
})();