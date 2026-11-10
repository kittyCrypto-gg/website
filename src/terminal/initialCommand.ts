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
export async function runInitialCommand(
    session: InitialSession,
    options: InitialOptions
): Promise<boolean> {
    const command = options.command.trim();
    if (!command) return false;

    if (options.persistent) {
        const marker = firstBootMarker(options.home);
        let seen = false;
        try {
            session.os.s.read(marker);
            seen = true;
        } catch (error: unknown) {
            const code = (error as { code?: unknown } | null)?.code;
            if (code !== "ENOENT") {
                console.warn("[mikuOS] Unable to check first-launch marker:", error);
                return false;
            }
        }
        if (seen) return false;

        try {
            session.os.s.mkfile(marker, "Website banner initialised.\n", 0o600);
            await session.os.flush();
        } catch (error: unknown) {
            // Storage may become unavailable after the kernel starts.
            // A transient save error must not prevent an otherwise usable
            // guest session and its first greeting from appearing.
            console.warn("[mikuOS] Could not persist first-launch marker:", error);
        }
    }

    session.key(command + "\r");
    return true;
}
