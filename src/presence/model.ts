import * as config from "../config.ts";
import * as helpers from "../helpers.ts";

declare global {
    interface Window {
        presenceRefreshTimer?: number;
        presenceClockTimer?: number;
        presenceViewportObserver?: IntersectionObserver;
    }
}

export const PRESENCE_ENDPOINT = config.presenceEndpoint;
export const DEFAULT_PRESENCE_REFRESH_INTERVAL_MS = 30000;
export const MINIMUM_PRESENCE_REFRESH_INTERVAL_MS = 5000;
export const PRESENCE_VISIBILITY_THRESHOLD = 0.05;

export interface PresenceSnapshot {
    status: string;
    isAfk: boolean;
    activity: string;
    lastSshSeenAt: string;
    lastActivityAt: string | null;
    updatedAt: string;
}

export type PresenceTone = "online" | "afk" | "terminal-afk" | "writing" | "active" | "offline";

export interface PresencePresentation {
    tone: PresenceTone;
    emoji: string;
    badge: string;
    statusText: string;
    subline: string;
}

export interface PresenceMetricProps {
    label: string;
    value: string;
    dateTime?: string;
}

export interface PresenceRuntimeState {
    hasLoadedOnce: boolean;
    isRefreshing: boolean;
    lastRenderedAt: number;
    visibleMounts: Set<HTMLElement>;
    latestSnapshot: PresenceSnapshot | null;
}

/**
 * Checks whether the API payload looks like a presence snapshot.
 *
 * @param {unknown} value - JSON payload returned by the presence endpoint.
 * @returns {value is PresenceSnapshot} True when the payload matches the expected shape.
 */
export function isPresenceSnapshot(value: unknown): value is PresenceSnapshot {
    if (!helpers.isRecord(value)) return false;

    return typeof value.status === "string"
        && typeof value.isAfk === "boolean"
        && typeof value.activity === "string"
        && typeof value.lastSshSeenAt === "string"
        && (typeof value.lastActivityAt === "string" || value.lastActivityAt === null)
        && typeof value.updatedAt === "string";
}

/**
 * Normalises an API token so comparisons are predictable.
 *
 * @param {string} value - Raw token from the API.
 * @returns {string} Lower-cased, trimmed token.
 */
export function normaliseToken(value: string): string {
    return value.trim().toLowerCase();
}

/**
 * Turns a machine-ish token into something nicer to read.
 *
 * @param {string} value - Raw token from the API.
 * @returns {string} Human-readable label with spacing and title casing.
 */
export function humaniseToken(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "Unknown";

    return trimmed
        .split(/[\s_-]+/)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(" ");
}

/**
 * Pads a date part to two digits.
 *
 * @param {number} value - Numeric date part.
 * @returns {string} Two-digit string.
 */
export function padDatePart(value: number): string {
    return String(value).padStart(2, "0");
}

/**
 * Parses a presence timestamp from the API.
 * The API sends "YYYY-MM-DD HH:mm:ss" and we treat it as UTC.
 *
 * @param {string} value - API timestamp.
 * @returns {Date | null} Parsed Date instance, or null when invalid.
 */
export function parsePresenceDate(value: string): Date | null {
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
 * Formats a Date in the browser's local timezone.
 *
 * @param {Date} value - Date instance to format.
 * @returns {string} Local display value in "YYYY.MM.DD HH:MM:SS" format.
 */
export function formatLocalDateTime(value: Date): string {
    const year = value.getFullYear();
    const month = padDatePart(value.getMonth() + 1);
    const day = padDatePart(value.getDate());
    const hours = padDatePart(value.getHours());
    const minutes = padDatePart(value.getMinutes());
    const seconds = padDatePart(value.getSeconds());

    return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats the current local UTC offset for display.
 *
 * @param {Date} value - Date instance in the browser's local timezone.
 * @returns {string} UTC offset in "UTC+HH:MM" or "UTC-HH:MM" format.
 */
export function formatUtcOffset(value: Date): string {
    const totalMinutes = -value.getTimezoneOffset();
    const sign = totalMinutes >= 0 ? "+" : "-";
    const absoluteMinutes = Math.abs(totalMinutes);
    const hours = padDatePart(Math.floor(absoluteMinutes / 60));
    const minutes = padDatePart(absoluteMinutes % 60);

    return `UTC${sign}${hours}:${minutes}`;
}

/**
 * Converts a timestamp into an ISO string for a <time> element.
 *
 * @param {string | null} value - API timestamp in "YYYY-MM-DD HH:mm:ss" form.
 * @returns {string} ISO datetime when parsing works, otherwise an empty string.
 */
export function toDateTimeAttribute(value: string | null): string {
    if (!value) return "";

    const parsed = parsePresenceDate(value);
    return parsed ? parsed.toISOString() : "";
}

/**
 * Formats a presence timestamp for display.
 *
 * @param {string | null} value - API timestamp in "YYYY-MM-DD HH:mm:ss" form.
 * @returns {string} Local display value, or a fallback when unavailable.
 */
export function formatPresenceTimestamp(value: string | null): string {
    const trimmed = value?.trim() ?? "";
    if (!trimmed) return "Not available";

    const parsed = parsePresenceDate(trimmed);
    if (!parsed) return trimmed;

    return formatLocalDateTime(parsed);
}

/**
 * Builds the current local clock details for the card.
 *
 * @returns {{ currentDateTime: string; utcOffset: string; isoDateTime: string }} Current local clock details.
 */
export function getCurrentLocalClock(): {
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
 * Converts a raw snapshot into the badge, tone, and text we want to show.
 *
 * @param {PresenceSnapshot} snapshot - Validated presence payload.
 * @returns {PresencePresentation} Presentation details derived from the current state.
 */
export function resolvePresencePresentation(snapshot: PresenceSnapshot): PresencePresentation {
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
            subline: "Terminal session is still visible, but Kitty seems away."
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
            subline: "Locked in VS Code."
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
