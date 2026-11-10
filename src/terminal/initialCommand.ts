interface InitialSession {
    key(input: string): void;
    os: {
        s: {
            read(path: string): string;
            mkfile(path: string, value: string, mode?: number): void;
        };
        flush(): Promise<void>;
    };
}

interface InitialOptions {
    command: string;
    home: string;
    persistent: boolean;
}

const MARKER = ".kittycrypto-web-banner-started";

function firstBootMarker(home: string): string {
    if (!home.startsWith("/") || home.includes("..")) {
        throw new Error("The guest home is not an absolute safe path");
    }
    return home.replace(/\/$/, "") + "/" + MARKER;
}

/**
 * Start the optional greeting only once for a persistent guest filesystem.
 * The marker is itself a user-owned guest file, so it lives in the browser's
 * OPFS overlay, not the repository's immutable .thistle.base.
 *
 * A browser without OPFS runs the greeting every fresh boot, because it
 * has no persistent guest filesystem to carry the marker across visits.
 */
async function claimFirstBoot(session: InitialSession, home: string): Promise<boolean> {
    const marker = firstBootMarker(home);
    try {
        session.os.s.read(marker);
        return false;
    } catch (error: unknown) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code !== "ENOENT") {
            console.warn("[mikuOS] Unable to check first-launch marker:", error);
            return false;
        }
    }

    try {
        session.os.s.mkfile(marker, "Website banner initialised.\n", 0o600);
        await session.os.flush();
    } catch (error: unknown) {
        console.warn("[mikuOS] Could not persist first-launch marker:", error);
    }
    return true;
}

export async function runInitialCommand(
    session: InitialSession,
    options: InitialOptions
): Promise<boolean> {
    const command = options.command.trim();
    if (!command) return false;

    const shouldRun = !options.persistent ||
        await claimFirstBoot(session, options.home);
    if (!shouldRun) return false;

    session.key(command + "\r");
    return true;
}
