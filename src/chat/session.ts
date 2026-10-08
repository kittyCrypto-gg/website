import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import { createDisconnectionGuard } from "../disconnectionGuard.ts";
import { assertMsgArr } from "./types.ts";
import type { ChatMessage } from "./types.ts";

const STREAM_URL = `${config.chatStreamURL}`;
const TOKEN_URL = `${config.sessionTokenURL}`;
const REREG_URL = `${config.sessionReregisterURL}`;

/** Owns the chat session token, SSE connection and retry lifecycle. */
export function createChatSession(onMessages: (messages: readonly ChatMessage[]) => void) {
    let sessTok: string | null = null;
    let evtSrc: EventSource | null = null;
    let isReconn = false;

    const discGuard = createDisconnectionGuard({
        gracePeriodMS: 4000,
        fetch: { retries: 2, retryDelayMS: 750 }
    });
    const guardedFetch = discGuard.decorateFetch();

    /**
     * Closes the active event source if there is one.
     * @returns {void}
     */
    function closeSrc(): void {
        if (!evtSrc) return;
        evtSrc.close();
        evtSrc = null;
    }

    /**
     * Keeps trying to re-register and reconnect. A bit stubborn on purpose.
     * @param {number} retryMS
     * @returns {Promise<void>}
     */
    async function reconn(retryMS: number = 3000): Promise<void> {
        if (isReconn) return;
        isReconn = true;

        /**
         * Queues another reconnect attempt later.
         * @returns {void}
         */
        const retry = (): void => {
            isReconn = false;
            setTimeout(() => {
                void reconn(retryMS);
            }, retryMS);
        };

        const token = typeof sessTok === "string" ? sessTok : "";

        if (!token) {
            isReconn = false;
            void fetchTok();
            return;
        }

        try {
            const response = await guardedFetch(REREG_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionToken: token })
            });

            console.log("🔁 reregister status:", response.status);

            if (response.status === 200) {
                isReconn = false;
                connectStream();
                return;
            }

            if (response.status === 403) {
                isReconn = false;
                void fetchTok();
                return;
            }

            retry();
        } catch {
            retry();
        }
    }

    /**
     * Fetches a fresh session token and then opens the stream.
     * @returns {Promise<void>}
     */
    async function fetchTok(): Promise<void> {
        try {
            const response = await fetch(TOKEN_URL);
            if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

            const data: unknown = await (response.json() as Promise<unknown>);
            helpers.assertSessionTokenResponse(data);

            sessTok = data.sessionToken;
            window.sessionToken = sessTok;
            console.log("🔑 Session Token received:", sessTok);

            connectStream();
        } catch (error) {
            console.error("❌ Error fetching session token:", error);
        }
    }

    /**
     * Old seeded rng helper. Not crypto-safe, just deterministic visual fluff.
     * still parked here for compat reasons.
     * @param {number} seed
     * @returns {number}
     */
    function randSeed(seed: number): number {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    void randSeed;

    /**
     * Opens the sse stream using the current token.
     * @returns {void}
     */
    function connectStream(): void {
        if (!sessTok) return;

        if (evtSrc) {
            console.log("⚠️ SSE connection already exists, closing old connection...");
            closeSrc();
        }

        console.log("🔄 Attempting to connect to chat stream...");
        evtSrc = new EventSource(`${STREAM_URL}?token=${sessTok}`);

        /**
         * Stream opened ok.
         * @returns {void}
         */
        const onOpen = (): void => {
            console.log("✅ Successfully connected to chat stream.");
        };

        /**
         * Handles incoming sse chat payloads.
         * @param {MessageEvent<string>} event
         * @returns {void}
         */
        const onMsg = (event: MessageEvent<string>): void => {
            try {
                const messagesUnknown: unknown = JSON.parse(event.data) as unknown;
                console.log("📩 Raw SSE Data:", messagesUnknown);

                assertMsgArr(messagesUnknown);
                onMessages(messagesUnknown);
            } catch (error) {
                console.error("❌ Error parsing chat update:", error, "\n📩 Raw data received:", event.data);
            }
        };

        /**
         * Handles stream errors and starts reconnect flow.
         * @returns {void}
         */
        const onErr = (): void => {
            console.log("❌ Connection to chat stream lost. Retrying...");
            closeSrc();
            void reconn();
        };

        evtSrc.onopen = onOpen;
        evtSrc.onmessage = onMsg;
        evtSrc.onerror = onErr;
    }

    return {
        start: (): void => { void fetchTok(); },
        getSessionToken: (): string | null => sessTok
    };
}
