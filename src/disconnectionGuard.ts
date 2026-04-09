import * as helpers from "./helpers.js";

type GuardedFetchFactoryOptions = Readonly<{
    retries?: number;
    retryDelayMS?: number;
    retryableStatuses?: readonly number[];
}>;

type DisconnectionGuardOptions = Readonly<{
    gracePeriodMS?: number;
    fetch?: GuardedFetchFactoryOptions;
}>;

export type DisconnectionGuard = Readonly<{
    decorateFetch: (fetchImpl?: typeof fetch) => typeof fetch;
    noteStreamInterrupted: (message?: string) => void;
    noteStreamConnected: (message?: string) => void;
}>;

const DEFAULT_RETRYABLE_STATUSES = [408, 425, 429, 500, 502, 503, 504, 522, 524] as const;

/**
 * @param {unknown} error - Unknown fetch error.
 * @returns {boolean} True when the error looks transient and worth retrying.
 */
function isTransientFetchError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    if (message.includes("failed to fetch")) return true;
    if (message.includes("networkerror")) return true;
    if (message.includes("network error")) return true;
    if (message.includes("load failed")) return true;
    if (message.includes("network connection was lost")) return true;
    if (message.includes("fetch")) return true;

    return false;
}

/**
 * @param {Response} response - Fetch response.
 * @param {readonly number[]} retryableStatuses - Statuses that should be retried.
 * @returns {boolean} True when the response should be retried.
 */
function isRetryableResponse(response: Response, retryableStatuses: readonly number[]): boolean {
    return retryableStatuses.includes(response.status);
}

/**
 * @param {DisconnectionGuardOptions} options - Guard configuration.
 * @returns {DisconnectionGuard} A guard for quieting short disconnects and decorating fetch.
 */
export function createDisconnectionGuard(options: DisconnectionGuardOptions = {}): DisconnectionGuard {
    const gracePeriodMS = options.gracePeriodMS ?? 4000;
    const fetchRetries = options.fetch?.retries ?? 2;
    const fetchRetryDelayMS = options.fetch?.retryDelayMS ?? 750;
    const retryableStatuses = options.fetch?.retryableStatuses ?? DEFAULT_RETRYABLE_STATUSES;

    let disconnectTimerId: number | null = null;
    let disconnectedSince: number | null = null;
    let outageWasLogged = false;

    function clearDisconnectTimer(): void {
        if (disconnectTimerId === null) return;
        window.clearTimeout(disconnectTimerId);
        disconnectTimerId = null;
    }

    function noteStreamInterrupted(message: string = "⚠️ Chat stream interrupted. Reconnecting quietly..."): void {
        if (disconnectedSince !== null) return;

        disconnectedSince = Date.now();

        clearDisconnectTimer();
        disconnectTimerId = window.setTimeout(() => {
            disconnectTimerId = null;
            if (disconnectedSince === null) return;
            if (outageWasLogged) return;

            outageWasLogged = true;
            console.warn(message);
        }, gracePeriodMS);
    }

    function noteStreamConnected(message: string = "✅ Chat stream reconnected."): void {
        const hadDisconnect = disconnectedSince !== null;
        const shouldLogRecovery = hadDisconnect && outageWasLogged;

        clearDisconnectTimer();
        disconnectedSince = null;
        outageWasLogged = false;

        if (!shouldLogRecovery) return;
        console.info(message);
    }

    function decorateFetch(fetchImpl: typeof fetch = window.fetch.bind(window)): typeof fetch {
        const guardedFetch: typeof fetch = async (
            input: RequestInfo | URL,
            init?: RequestInit
        ): Promise<Response> => {
            let attempt = 0;

            while (attempt <= fetchRetries) {
                try {
                    const response = await fetchImpl(input, init);

                    if (!isRetryableResponse(response, retryableStatuses)) {
                        return response;
                    }

                    if (attempt === fetchRetries) {
                        return response;
                    }
                } catch (error) {
                    if (!isTransientFetchError(error)) {
                        throw error;
                    }

                    if (attempt === fetchRetries) {
                        throw error;
                    }
                }

                attempt += 1;
                await helpers.wait(fetchRetryDelayMS * attempt);
            }

            throw new Error("Guarded fetch exhausted retries without returning a response");
        };

        return guardedFetch;
    }

    return {
        decorateFetch,
        noteStreamInterrupted,
        noteStreamConnected
    };
}