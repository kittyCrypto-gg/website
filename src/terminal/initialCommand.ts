interface InitialSession {
    execute(command: string): Promise<boolean>;
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

function markerKey(username: string): string {
    // v2 distinguishes successful direct execution from the previous
    // approach, which marked the guest before the command had run.
    return "kc:mikuos:initial-command:v2:" + username;
}

function previouslyStarted(options: InitialOptions): boolean {
    if (!options.persistent || !options.store) return false;
    try {
        return options.store.getItem(markerKey(options.username)) === "1";
    } catch {
        return false;
    }
}

function markStarted(options: InitialOptions): void {
    if (!options.persistent || !options.store) return;
    try {
        options.store.setItem(markerKey(options.username), "1");
    } catch {
        // Browser privacy restrictions must not break the shell.
    }
}

/**
 * Execute the greeting through the guest OS, not the interactive line editor.
 * Sending the full command through session.key() previously caused wrapped
 * partial command lines on narrow mobile terminals.
 *
 * Record the first-launch marker only after a successful guest execution.
 * The marker is outside the guest root and never creates a home directory.
 */
export async function runInitialCommand(
    session: InitialSession,
    options: InitialOptions
): Promise<boolean> {
    const command = options.command.trim();
    if (!command || previouslyStarted(options)) return false;
    const succeeded = await session.execute(command);
    if (succeeded) markStarted(options);
    return succeeded;
}
