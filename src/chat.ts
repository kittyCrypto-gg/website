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

type ChatMessageLocal = ChatMessage & Readonly<{
    pending?: boolean;
}>;

const CHAT_SERVER = `${config.chatURL}`;
const CHAT_STREAM_URL = `${config.chatStreamURL}`;
const SESSION_TOKEN_URL = `${config.sessionTokenURL}`;
const SESSION_REREGISTER_URL = `${config.sessionReregisterURL}`;

const chatroom = document.getElementById("chatroom") as HTMLElement;
const nicknameInput = document.getElementById("nickname") as HTMLInputElement;
const messageInput = document.getElementById("message") as HTMLInputElement;
const sendButton = document.getElementById("send-button") as HTMLElement;

let sessionToken: string | null = null;
let eventSource: EventSource | null = null;
let reconnecting = false;
let chatClusteriser: Clusteriser | null = null;

nicknameInput.addEventListener("input", () => {
    setChatCookie("nickname", nicknameInput.value.trim());
});

const disconnectionGuard = createDisconnectionGuard({
  gracePeriodMS: 4000,
  fetch: {
    retries: 2,
    retryDelayMS: 750
  }
});

const guardedFetch = disconnectionGuard.decorateFetch();

/**
 * @param {unknown} value - Unknown JSON value to validate.
 * @returns {boolean} True if the value conforms to the ChatMessage structure, false otherwise.
 */
function isChatMessage(value: unknown): value is ChatMessage {
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
 * @param {unknown} value - Unknown JSON value to validate.
 * @returns {void} Asserts that the value is an array of ChatMessage objects, otherwise throws an error.
 */
function assertChatMessageArray(value: unknown): asserts value is ChatMessage[] {
    if (!Array.isArray(value)) throw new Error("Invalid SSE payload: expected an array");

    for (const item of value) {
        if (!isChatMessage(item)) {
            throw new Error("Invalid SSE payload: array contained non-ChatMessage items");
        }
    }
}

/**
 * @returns {void} Closes the active SSE connection if one exists.
 */
function closeEventSource(): void {
    if (!eventSource) return;
    eventSource.close();
    eventSource = null;
}

/**
 * @param {number} retryMS - Milliseconds between reconnect attempts.
 * @returns {Promise<void>} Attempts to reconnect to the chat stream by fetching a new session token if necessary, and re-establishing the SSE connection. Retries indefinitely on failure with a delay of retryMS.
 */
async function attemptReconnect(retryMS: number = 3000): Promise<void> {
    if (reconnecting) return;
    reconnecting = true;

    const retry = (): void => {
        reconnecting = false;
        setTimeout(() => {
            void attemptReconnect(retryMS);
        }, retryMS);
    };

    try {
        const token = typeof sessionToken === "string" ? sessionToken : "";

        if (!token) {
            reconnecting = false;
            void fetchSessionToken();
            return;
        }

        let response: Response;
        try {
            response = await guardedFetch(SESSION_REREGISTER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionToken: token })
            });
        } catch {
            retry();
            return;
        }

        console.log("🔁 reregister status:", response.status);

        if (response.status === 200) {
            reconnecting = false;
            connectToChatStream();
            return;
        }

        if (response.status === 403) {
            reconnecting = false;
            void fetchSessionToken();
            return;
        }

        retry();
    } catch {
        retry();
    }
}

/**
 * @returns {HTMLElement} The current content root used for chat messages.
 */
function getChatContentRoot(): HTMLElement {
    if (!chatClusteriser) return chatroom;

    const contentElement = document.getElementById(chatClusteriser.contentId);
    return contentElement instanceof HTMLElement ? contentElement : chatroom;
}

/**
 * @returns {HTMLElement} The current scroll root used for chat scrolling.
 */
function getChatScrollRoot(): HTMLElement {
    if (!chatClusteriser) return chatroom;

    const scrollElement = document.getElementById(chatClusteriser.scrollId);
    return scrollElement instanceof HTMLElement ? scrollElement : chatroom;
}

/**
 * @returns {void} Pushes current DOM rows into Clusterize when initialised.
 */
function updateClusterisedChat(): void {
    if (!chatClusteriser?.isInitialised) return;

    const contentRoot = getChatContentRoot();
    const rows = Array.from(contentRoot.querySelectorAll(".chat-message"))
        .map((element) => element.outerHTML);

    chatClusteriser.update(rows);
}

/**
 * @param {string} name - Cookie name.
 * @returns {string | null} The cookie value if found, or null if not found.
 */
function getChatCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return match ? decodeURIComponent(match[2]) : null;
}

/**
 * @param {string} name - Cookie name.
 * @param {string} value - Cookie value.
 * @param {number} days - Expiry in days.
 * @returns {void} Sets a cookie with the given name and value, expiring in the specified number of days, with path=/ and SameSite=Lax.
 */
function setChatCookie(name: string, value: string, days: number = 365): void {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * @returns {void} Loads the saved nickname from cookies into the input field.
 */
function loadNickname(): void {
    const savedNick = getChatCookie("nickname");
    if (!savedNick) return;
    nicknameInput.value = savedNick;
}

/**
 * @returns {Promise<void>} Fetches a session token and connects to the chat stream.
 */
async function fetchSessionToken(): Promise<void> {
    try {
        const response = await fetch(SESSION_TOKEN_URL);
        if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        helpers.assertSessionTokenResponse(data);

        sessionToken = data.sessionToken;
        window.sessionToken = sessionToken;
        console.log("🔑 Session Token received:", sessionToken);

        connectToChatStream();
    } catch (error) {
        console.error("❌ Error fetching session token:", error);
    }
}

/**
 * @param {number} seed - Seed value.
 * @returns {number} A pseudo-random number in the range [0, 1) derived from the seed, using a simple seeded RNG algorithm.
 * @remarks This function is not cryptographically secure and is retained only for deterministic visual variation.
 */
function seededRandom(seed: number): number {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
void seededRandom;

/**
 * @returns {void} Connects to the SSE chat stream using the current session token.
 */
function connectToChatStream(): void {
    if (!sessionToken) return;

    if (eventSource) {
        console.log("⚠️ SSE connection already exists, closing old connection...");
        closeEventSource();
    }

    console.log("🔄 Attempting to connect to chat stream...");
    eventSource = new EventSource(`${CHAT_STREAM_URL}?token=${sessionToken}`);

    eventSource.onopen = () => {
        console.log("✅ Successfully connected to chat stream.");
    };

    eventSource.onmessage = (event: MessageEvent<string>) => {
        try {
            const messagesUnknown: unknown = JSON.parse(event.data) as unknown;
            console.log("📩 Raw SSE Data:", messagesUnknown);

            assertChatMessageArray(messagesUnknown);
            void displayChat(messagesUnknown);
        } catch (error) {
            console.error("❌ Error parsing chat update:", error, "\n📩 Raw data received:", event.data);
        }
    };

    eventSource.onerror = () => {
        console.log("❌ Connection to chat stream lost. Retrying...");
        closeEventSource();
        void attemptReconnect();
    };
}

/**
 * @returns {Promise<string | null>} Fetches the user's IP address, or null on failure.
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
 * @returns {Promise<void>} Sends the current chat message to the server.
 */
async function sendMessage(): Promise<void> {
    const nick = nicknameInput.value.trim();
    const msg = messageInput.value.trim();

    if (!nick || !msg) {
        alert("Please enter a nickname and a message.");
        return;
    }

    if (!sessionToken) {
        alert("Session token is missing. Please refresh the page.");
        return;
    }

    setChatCookie("nickname", nick);

    console.log("📡 Fetching IP address...");
    const userIp = await fetchUserIP();

    if (!userIp) {
        alert("❌ Unable to retrieve IP. Please try again.");
        return;
    }

    const tempId = `pending-${Date.now()}`;

    const pendingMessage: ChatMessageLocal = {
        nick,
        id: tempId,
        msg,
        timestamp: new Date().toISOString(),
        msgId: "0",
        pending: true
    };

    await displayChat([pendingMessage], true);

    const chatRequest = {
        chatRequest: {
            nick,
            msg,
            ip: userIp,
            sessionToken
        }
    };

    console.log("📡 Sending chat message:", chatRequest);

    try {
        const response = await fetch(CHAT_SERVER, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(chatRequest)
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }

        console.log("✅ Message sent successfully.");
        messageInput.value = "";
    } catch (error) {
        console.error("❌ Error sending message:", error);

        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to send message: ${errorMessage}`);

        removePendingMessage(tempId);
        updateClusterisedChat();
    }
}

/**
 * @param {readonly ChatMessageLocal[]} messages - Chat messages to render.
 * @param {boolean} isLocalUpdate - Whether this render is a local append (does not clear chat first).
 * @returns {Promise<void>} Renders the provided chat messages into the chatroom. If isLocalUpdate is false, it clears existing messages first. If true, it appends to existing messages. After rendering, it scrolls to the bottom and dispatches a "chatUpdated" event.
 */
async function displayChat(messages: readonly ChatMessageLocal[], isLocalUpdate: boolean = false): Promise<void> {
    const contentRoot = getChatContentRoot();

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

    requestAnimationFrame(() => {
        const scrollRoot = getChatScrollRoot();
        scrollRoot.scrollTop = scrollRoot.scrollHeight;
    });

    document.dispatchEvent(new Event("chatUpdated"));
    console.log(`Chat updated with ${messages.length} new messages.`);
    updateClusterisedChat();
}

/**
 * @param {string} tempId - Temporary ID used for the pending message.
 * @returns {void} Removes the pending message with the specified temporary ID from the chatroom.
 */
function removePendingMessage(tempId: string): void {
    const contentRoot = getChatContentRoot();
    const pendingMessage = contentRoot.querySelector(`.chat-message[data-id="${tempId}"]`);
    if (!pendingMessage) return;
    pendingMessage.remove();
}

/**
 * @returns {Promise<void>} Initialises the chat clusteriser if available.
 */
async function initialiseClusteriser(): Promise<void> {
    try {
        chatClusteriser = new Clusteriser(chatroom);
        await chatClusteriser.init();
        updateClusterisedChat();
    } catch (error) {
        console.error("❌ Failed to initialise Clusterize:", error);
        chatClusteriser = null;
    }
}

sendButton.addEventListener("click", () => {
    void sendMessage();
});

messageInput.addEventListener("keypress", (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    void sendMessage();
});

document.addEventListener("DOMContentLoaded", () => {
    window.scrollTo(0, document.body.scrollHeight);
});

loadNickname();
void initialiseClusteriser();
void fetchSessionToken();