import { Clusteriser } from "./clusterise.ts";
import * as config from "./config.ts";
import * as helpers from "./helpers.ts";
import { createDisconnectionGuard } from "./disconnectionGuard.ts";

declare global {
    interface Window {
        sessionToken?: string | undefined;
        ipAddress?: string | null;
    }
}

export interface ChatMessage {
    nick: string;
    id: string;
    msg: string;
    timestamp: string;
    msgId: string;
    edited?: boolean;
}

type MsgLocal = ChatMessage & Readonly<{
    pending?: boolean;
}>;

const CHAT_URL = `${config.chatURL}`;
const STREAM_URL = `${config.chatStreamURL}`;
const TOKEN_URL = `${config.sessionTokenURL}`;
const REREG_URL = `${config.sessionReregisterURL}`;

const roomEl = document.getElementById("chatroom") as HTMLElement;
const nickEl = document.getElementById("nickname") as HTMLInputElement;
const msgEl = document.getElementById("message") as HTMLInputElement;
const sendBtn = document.getElementById("send-button") as HTMLElement;

let sessTok: string | null = null;
let evtSrc: EventSource | null = null;
let isReconn = false;
let cluster: Clusteriser | null = null;

/**
 * Saves nickname as the user types. tiny but handy.
 * @returns {void}
 */
const onNickInput = (): void => {
    setCookie("nickname", nickEl.value.trim());
};

nickEl.addEventListener("input", onNickInput);

const discGuard = createDisconnectionGuard({
    gracePeriodMS: 4000,
    fetch: {
        retries: 2,
        retryDelayMS: 750
    }
});

const guardedFetch = discGuard.decorateFetch();

/**
 * Checks if a json-ish thing looks like a chat msg.
 * @param {unknown} value
 * @returns {boolean}
 */
function isMsg(value: unknown): value is ChatMessage {
    if (!helpers.isRecord(value)) return false;

    const nickOk = typeof value.nick === "string";
    const idOk = typeof value.id === "string";
    const msgOk = typeof value.msg === "string";
    const timestampOk = typeof value.timestamp === "string";
    const msgIdOk = typeof value.msgId === "string";
    const editedOk = typeof value.edited === "undefined" || typeof value.edited === "boolean";

    return nickOk && idOk && msgOk && timestampOk && msgIdOk && editedOk;
}

/**
 * Asserts an sse payload is an array of chat msgs.
 * throws if its not, obviously.
 * @param {unknown} value
 * @returns {void}
 */
function assertMsgArr(value: unknown): asserts value is ChatMessage[] {
    if (!Array.isArray(value)) throw new Error("Invalid SSE payload: expected an array");

    for (const item of value) {
        if (!isMsg(item)) {
            throw new Error("Invalid SSE payload: array contained non-ChatMessage items");
        }
    }
}

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
 * Current content root for the chat rows.
 * @returns {HTMLElement}
 */
function getCntRoot(): HTMLElement {
    if (!cluster) return roomEl;

    const contentElement = document.getElementById(cluster.contentId);
    return contentElement instanceof HTMLElement ? contentElement : roomEl;
}

/**
 * Current scroll root for the chat area.
 * @returns {HTMLElement}
 */
function getScrRoot(): HTMLElement {
    if (!cluster) return roomEl;

    const scrollElement = document.getElementById(cluster.scrollId);
    return scrollElement instanceof HTMLElement ? scrollElement : roomEl;
}

/**
 * Pushes current dom rows into Clusterize when its live.
 * @returns {void}
 */
function syncCluster(): void {
    if (!cluster?.isInitialised) return;

    const contentRoot = getCntRoot();
    const rows = Array.from(contentRoot.querySelectorAll(".chat-message"))
        .map((element) => element.outerHTML);

    cluster.update(rows);
}

/**
 * Reads a cookie by name.
 * @param {string} name
 * @returns {string | null}
 */
function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Sets a cookie for the chat ui bits.
 * @param {string} name
 * @param {string} value
 * @param {number} days
 * @returns {void}
 */
function setCookie(name: string, value: string, days: number = 365): void {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Restores saved nickname into the input.
 * @returns {void}
 */
function loadNick(): void {
    const savedNick = getCookie("nickname");
    if (!savedNick) return;
    nickEl.value = savedNick;
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
            void showChat(messagesUnknown);
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

/**
 * Fetches the user's IP, or null if it all goes sideways.
 * @returns {Promise<string | null>}
 */
export async function fetchUserIP(): Promise<string | null> {
    try {
        const response = await fetch(`${config.getIpURL}`);
        if (!response.ok) throw new Error(`Failed to fetch IP: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        helpers.assertGetIpResponse(data);

        console.log(`🌍 User IP: ${data.ip}`);
        window.ipAddress = data.ip;
        return data.ip;
    } catch (error) {
        console.error("❌ Error fetching IP:", error);
        return null;
    }
}

/**
 * Sends the current message to the server.
 * includes the optimistic pending row and all that jazz.
 * @returns {Promise<void>}
 */
async function sendMsg(): Promise<void> {
    const nick = nickEl.value.trim();
    const msg = msgEl.value.trim();

    if (!nick || !msg) {
        alert("Please enter a nickname and a message.");
        return;
    }

    if (!sessTok) {
        alert("Session token is missing. Please refresh the page.");
        return;
    }

    setCookie("nickname", nick);

    console.log("📡 Fetching IP address...");
    const userIp = await fetchUserIP();

    if (!userIp) {
        alert("❌ Unable to retrieve IP. Please try again.");
        return;
    }

    const tempId = `pending-${Date.now()}`;

    const pendingMessage: MsgLocal = {
        nick,
        id: tempId,
        msg,
        timestamp: new Date().toISOString(),
        msgId: "0",
        pending: true
    };

    await showChat([pendingMessage], true);

    const chatRequest = {
        chatRequest: {
            nick,
            msg,
            ip: userIp,
            sessionToken: sessTok
        }
    };

    console.log("📡 Sending chat message:", chatRequest);

    try {
        const response = await fetch(CHAT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatRequest)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        console.log("✅ Message sent successfully.");
        msgEl.value = "";
    } catch (error) {
        console.error("❌ Error sending message:", error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to send message: ${errorMessage}`);

        rmPending(tempId);
        syncCluster();
    }
}

/**
 * Renders chat rows into the room.
 * local mode appends, non-local mode clears and redraws.
 * @param {readonly MsgLocal[]} messages
 * @param {boolean} isLocalUpdate
 * @returns {Promise<void>}
 */
async function showChat(messages: readonly MsgLocal[], isLocalUpdate: boolean = false): Promise<void> {
    const contentRoot = getCntRoot();

    if (!isLocalUpdate) {
        contentRoot.querySelectorAll(".chat-message.pending").forEach((element) => element.remove());
        contentRoot.innerHTML = "";
    }

    messages.forEach((message) => {
        const {
            nick,
            id,
            msg,
            timestamp,
            msgId,
            pending = false,
            edited = false
        } = message;

        const parsedId = Number.parseInt(id, 16);
        const hue = Number.isNaN(parsedId) ? 0 : parsedId % 360;
        const colour = `hsl(${hue}, 61%, 51%)`;
        const formattedDate = timestamp.replace("T", " ").slice(0, 19).replace(/-/g, ".");

        const messageDiv = document.createElement("div");
        messageDiv.classList.add("chat-message");
        messageDiv.dataset.id = id;

        if (pending) {
            messageDiv.classList.add("pending");
        }

        const headerDiv = document.createElement("div");
        headerDiv.classList.add("chat-header");

        const nickSpan = document.createElement("span");
        nickSpan.classList.add("chat-nick");
        nickSpan.style.color = colour;
        nickSpan.textContent = `${nick} - (${id}):`;
        headerDiv.appendChild(nickSpan);

        const timeRow = document.createElement("div");
        timeRow.classList.add("chat-timestamp");
        timeRow.style.display = "flex";
        timeRow.style.alignItems = "center";

        if (edited) {
            const editIcon = document.createElement("span");
            editIcon.textContent = "📝";
            editIcon.classList.add("edited-flag");
            timeRow.appendChild(editIcon);
        }

        const dateSpan = document.createElement("span");
        dateSpan.textContent = formattedDate;
        timeRow.appendChild(dateSpan);

        const msgIdSpan = document.createElement("span");
        msgIdSpan.classList.add("chat-msg-id");
        msgIdSpan.textContent = `ID: ${msgId}`;

        const textDiv = document.createElement("div");
        textDiv.classList.add("chat-text");
        textDiv.textContent = msg;

        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(timeRow);
        messageDiv.appendChild(msgIdSpan);
        messageDiv.appendChild(textDiv);
        contentRoot.appendChild(messageDiv);
    });

    /**
     * Scrolls the chat to the newest row on the next frame.
     * @returns {void}
     */
    const syncScroll = (): void => {
        const scrollRoot = getScrRoot();
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
    };

    requestAnimationFrame(syncScroll);

    document.dispatchEvent(new Event("chatUpdated"));
    console.log(`Chat updated with ${messages.length} new messages.`);
    syncCluster();
}

/**
 * Removes one optimistic pending row by temp id.
 * @param {string} tempId
 * @returns {void}
 */
function rmPending(tempId: string): void {
    const contentRoot = getCntRoot();
    const pendingMessage = contentRoot.querySelector(`.chat-message[data-id="${tempId}"]`);
    if (!pendingMessage) return;
    pendingMessage.remove();
}

/**
 * Boots the clusteriser if available.
 * @returns {Promise<void>}
 */
async function initCluster(): Promise<void> {
    try {
        cluster = new Clusteriser(roomEl);
        await cluster.init();
        syncCluster();
    } catch (error) {
        console.error("❌ Failed to initialise Clusterize:", error);
        cluster = null;
    }
}

/**
 * Send button click handler.
 * @returns {void}
 */
const onSendClick = (): void => {
    void sendMsg();
};

sendBtn.addEventListener("click", onSendClick);

/**
 * Enter key sends the msg too.
 * @param {KeyboardEvent} event
 * @returns {void}
 */
const onMsgKey = (event: KeyboardEvent): void => {
    if (event.key !== "Enter") return;
    void sendMsg();
};

msgEl.addEventListener("keypress", onMsgKey);

/**
 * Scroll page to the bottom after dom is ready.
 * @returns {void}
 */
const onDomReady = (): void => {
    window.scrollTo(0, document.body.scrollHeight);
};

document.addEventListener("DOMContentLoaded", onDomReady);

loadNick();
void initCluster();
void fetchTok();