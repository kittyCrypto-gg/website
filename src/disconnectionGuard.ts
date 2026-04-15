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

const DEF_RETRYABLE = [408, 425, 429, 500, 502, 503, 504, 522, 524] as const;

/**
 * Checks if a thrown fetch error smells temporary.
 * Bit hand-wavey, but good enough for browser fetch weirdness.
 * @param {unknown} error
 * @returns {boolean}
 */
function isTransientErr(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const message = error.message.toLowerCase();

    return [
        "failed to fetch",
        "networkerror",
        "network error",
        "load failed",
        "network connection was lost",
        "fetch"
    ].some((part) => message.includes(part));
}

/**
 * Says whether this response should be retried.
 * @param {Response} response
 * @param {readonly number[]} retryableStatuses
 * @returns {boolean}
 */
function isRetryableRes(response: Response, retryableStatuses: readonly number[]): boolean {
    return retryableStatuses.includes(response.status);
}

/**
 * Makes the disconnect/fetch retry guard thing.
 * Main point is to hush short blips and retry flaky fetches a couple times.
 * @param {DisconnectionGuardOptions} options
 * @returns {DisconnectionGuard}
 */
export function createDisconnectionGuard(options: DisconnectionGuardOptions = {}): DisconnectionGuard {
    const gracePeriodMS = options.gracePeriodMS ?? 4000;
    const fetchRetries = options.fetch?.retries ?? 2;
    const fetchRetryDelayMS = options.fetch?.retryDelayMS ?? 750;
    const retryableStatuses = options.fetch?.retryableStatuses ?? DEF_RETRYABLE;

    let tmrId: number | null = null;
    let downSince: number | null = null;
    let outageLogged = false;

    /**
     * Clears the pending grace timer, if one exists.
     * @returns {void}
     */
    function clrTmr(): void {
        if (tmrId === null) return;
        window.clearTimeout(tmrId);
        tmrId = null;
    }

    /**
     * Notes that the stream dropped.
     * It waits a bit before logging so tiny blips dont spam the console.
     * @param {string} message
     * @returns {void}
     */
    function noteDrop(message: string = "⚠️ Chat stream interrupted. Reconnecting quietly..."): void {
        if (downSince !== null) return;

        downSince = Date.now();

        clrTmr();
        tmrId = window.setTimeout(() => {
            tmrId = null;
            if (downSince === null || outageLogged) return;

            outageLogged = true;
            console.warn(message);
        }, gracePeriodMS);
    }

    /**
     * Notes that the stream came back.
     * Only logs recovery if we already logged the outage.
     * @param {string} message
     * @returns {void}
     */
    function noteBack(message: string = "✅ Chat stream reconnected."): void {
        const hadDisconnect = downSince !== null;
        const shouldLogRecovery = hadDisconnect && outageLogged;

        clrTmr();
        downSince = null;
        outageLogged = false;

        if (!shouldLogRecovery) return;
        console.info(message);
    }

    /**
     * Wraps fetch with a few retries for transient failures/statuses.
     * @param {typeof fetch} fetchImpl
     * @returns {typeof fetch}
     */
    function decoFetch(fetchImpl: typeof fetch = window.fetch.bind(window)): typeof fetch {
        /**
         * Guarded fetch with retry logic.
         * @param {RequestInfo | URL} input
         * @param {RequestInit | undefined} init
         * @returns {Promise<Response>}
         */
        const guardedFetch: typeof fetch = async (
            input: RequestInfo | URL,
            init?: RequestInit
        ): Promise<Response> => {
            let attempt = 0;

            while (attempt <= fetchRetries) {
                try {
                    const response = await fetchImpl(input, init);

                    if (!isRetryableRes(response, retryableStatuses)) {
                        return response;
                    }

                    if (attempt === fetchRetries) {
                        return response;
                    }
                } catch (error) {
                    if (!isTransientErr(error)) {
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
        decorateFetch: decoFetch,
        noteStreamInterrupted: noteDrop,
        noteStreamConnected: noteBack
    };
}