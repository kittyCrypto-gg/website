interface InitialSession {
    key(input: string): void;
}

interface FirstBootStore {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
}

interface InitialOptions {
    command: string;
    username: string;
    persistent: boolean;
    store: FirstBootStore | null;
}

/**
 * Save the first-run flag outside the guest root. This works for a homeless,
 * unprivileged account and does not write anything to .thistle.base or the
 * writable OPFS filesystem overlay.
 */
function firstLaunch(options: InitialOptions): boolean {
    if (!options.persistent) return true;
    const storage = options.store;
    if (!storage) return true;
    const key = "kc:mikuos:initial-command:" + options.username;
    try {
        if (storage.getItem(key) === "1") return false;
        storage.setItem(key, "1");
        return true;
    } catch {
        return true;
    }
}

export async function runInitialCommand(
    session: InitialSession,
    options: InitialOptions
): Promise<boolean> {
    const command = options.command.trim();
    if (!command || !firstLaunch(options)) return false;
    session.key(command + "\r");
    return true;
}
