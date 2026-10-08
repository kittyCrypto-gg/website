import * as helpers from "../helpers.ts";
import type {
    MutableWindowState,
    WindowApiOptions
} from "./types.ts";

export type RestoredWindowState = Readonly<{
    state: MutableWindowState;
    hadStoredState: boolean;
}>;

function nextId(): string {
    if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
    ) {
        return crypto.randomUUID();
    }

    return (
        String(Date.now()) +
        "-" +
        Math.random().toString(36).slice(2, 10)
    );
}

export function sanitiseWindowId(windowId: string): string {
    return windowId
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

export function resolveWindowId(id: string | undefined): string {
    if (!id || id.trim().length === 0) {
        return "window-" + nextId();
    }

    const sanitised = sanitiseWindowId(id);
    return sanitised.length > 0
        ? sanitised
        : "window-" + nextId();
}

function createInitialState(
    options: WindowApiOptions
): MutableWindowState {
    const x = options.initFloatPos?.x ?? "10px";
    const y = options.initFloatPos?.y ?? "10px";
    const floating = typeof options.initFloat === "boolean"
        ? options.initFloat
        : options.initFloatPos !== undefined;

    return {
        float: floating,
        mini: options.initMini ?? false,
        closed: options.initClosed ?? false,
        maxi: false,
        x,
        y,
        width: "50%",
        height: "",
        launcherX: x,
        launcherY: y,
        restoreX: "",
        restoreY: "",
        restrWidth: "",
        restrHeight: "",
        restrFloat: false
    };
}

function readBoolean(
    value: unknown,
    fallback: boolean
): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function readString(
    value: unknown,
    fallback: string
): string {
    return typeof value === "string" ? value : fallback;
}

export function readWindowState(
    storageKey: string,
    options: WindowApiOptions
): RestoredWindowState {
    const fallback = createInitialState(options);
    let parsedUnknown: unknown = null;

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
            return {
                state: fallback,
                hadStoredState: false
            };
        }

        parsedUnknown = JSON.parse(raw);
    } catch {
        return {
            state: fallback,
            hadStoredState: false
        };
    }

    if (!helpers.isRecord(parsedUnknown)) {
        return {
            state: fallback,
            hadStoredState: false
        };
    }

    return {
        hadStoredState: true,
        state: {
            float: readBoolean(
                parsedUnknown.floating,
                fallback.float
            ),
            mini: readBoolean(
                parsedUnknown.minimised,
                fallback.mini
            ),
            closed: readBoolean(
                parsedUnknown.closed,
                fallback.closed
            ),
            maxi: readBoolean(
                parsedUnknown.maximised,
                fallback.maxi
            ),
            x: readString(parsedUnknown.x, fallback.x),
            y: readString(parsedUnknown.y, fallback.y),
            width: readString(
                parsedUnknown.width,
                fallback.width
            ),
            height: readString(
                parsedUnknown.height,
                fallback.height
            ),
            launcherX: readString(
                parsedUnknown.launcherX,
                fallback.launcherX
            ),
            launcherY: readString(
                parsedUnknown.launcherY,
                fallback.launcherY
            ),
            restoreX: readString(
                parsedUnknown.restoreX,
                fallback.restoreX
            ),
            restoreY: readString(
                parsedUnknown.restoreY,
                fallback.restoreY
            ),
            restrWidth: readString(
                parsedUnknown.restoreWidth,
                fallback.restrWidth
            ),
            restrHeight: readString(
                parsedUnknown.restoreHeight,
                fallback.restrHeight
            ),
            restrFloat: readBoolean(
                parsedUnknown.restoreFloating,
                fallback.restrFloat
            )
        }
    };
}

export function persistWindowState(
    storageKey: string,
    state: MutableWindowState
): boolean {
    try {
        window.localStorage.setItem(
            storageKey,
            JSON.stringify(state)
        );
        return true;
    } catch {
        return false;
    }
}
