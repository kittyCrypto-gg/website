import { Clusteriser } from "./clusterise";

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

type SessionTokenResponse = Readonly<{
    sessionToken: string;
}>;

type GetIpResponse = Readonly<{
    ip: string;
}>;

type ClusteriserLike = Readonly<{
    init: () => Promise<unknown>;
    update: (rows: readonly string[]) => void;
}>;

type ClusteriserConstructor = new (target: Element) => ClusteriserLike;

const CHAT_SERVER = "https://srv.kittycrypto.gg/chat";
const CHAT_STREAM_URL = "https://srv.kittycrypto.gg/chat/stream";
const SESSION_TOKEN_URL = "https://srv.kittycrypto.gg/session-token";
const SESSION_REREGISTER_URL = "https://srv.kittycrypto.gg/session-token/reregister";

const chatroom = document.getElementById("chatroom") as HTMLElement;
const nicknameInput = document.getElementById("nickname") as HTMLInputElement;
const messageInput = document.getElementById("message") as HTMLInputElement;
const sendButton = document.getElementById("send-button") as HTMLElement;

let sessionToken: string | null = null;
let eventSource: EventSource | null = null; // Track SSE connection
let reconnecting = false;

nicknameInput.addEventListener("input", () => {
    setChatCookie("nickname", nicknameInput.value.trim());
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} value - Unknown JSON payload to validate.
 * @returns {void} Asserts that the value is a valid SessionTokenResponse, otherwise throws an error.
 */
function assertSessionTokenResponse(value: unknown): asserts value is SessionTokenResponse {
    if (!isRecord(value)) throw new Error("Invalid session-token payload: not an object");
    if (typeof value.sessionToken !== "string") throw new Error("Invalid session-token payload: sessionToken is not a string");
}

/**
 * @param {unknown} value - Unknown JSON payload to validate.
 * @returns {void} Asserts that the value is a valid GetIpResponse, otherwise throws an error.
 */
function assertGetIpResponse(value: unknown): asserts value is GetIpResponse {
    if (!isRecord(value)) throw new Error("Invalid get-ip payload: not an object");
    if (typeof value.ip !== "string") throw new Error("Invalid get-ip payload: ip is not a string");
}

/**
 * @param {unknown} value - Unknown JSON value to validate.
 * @returns {boolean} True if the value conforms to the ChatMessage structure, false otherwise.
 */
function isChatMessage(value: unknown): value is ChatMessage {
    if (!isRecord(value)) return false;

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
        if (!isChatMessage(item)) throw new Error("Invalid SSE payload: array contained non-ChatMessage items");
    }
}

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
        setTimeout(attemptReconnect, retryMS);
    };

    try {
        const token = typeof sessionToken === "string" ? sessionToken : "";

        if (!token) {
            reconnecting = false;
            fetchSessionToken();
            return;
        }

        let res: Response;
        try {
            res = await fetch(SESSION_REREGISTER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionToken: token })
            });
        } catch {
            retry(); // server offline
            return;
        }

        console.log("🔁 reregister status:", res.status);

        if (res.status === 200) {
            reconnecting = false;
            connectToChatStream();
            return;
        }

        if (res.status === 403) {
            reconnecting = false;
            fetchSessionToken(); // expired, get a new one
            return;
        }

        // 503 or anything else: retry forever
        retry();
    } catch {
        retry();
    }
}

function updateClusterisedChat(): void {
    if (!chatClusteriser) return;
    const rows = Array.from(chatroom.querySelectorAll(".chat-message")).map((el) => el.outerHTML);
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

function loadNickname(): void {
    const savedNick = getChatCookie("nickname");
    if (savedNick) {
        nicknameInput.value = savedNick;
    }
}

async function fetchSessionToken(): Promise<void> {
    try {
        const response = await fetch(SESSION_TOKEN_URL);
        if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        assertSessionTokenResponse(data);

        sessionToken = data.sessionToken;
        window.sessionToken = sessionToken;
        console.log("🔑 Session Token received:", sessionToken);

        // Connect to SSE once session token is received
        connectToChatStream();
    } catch (error) {
        console.error("❌ Error fetching session token:", error);
    }
}

/**
 * @param {number} seed - Seed value.
 * @param {ReadonlyArray<number>} hash - SHA-256 hash bytes.
 * @returns {number} A pseudo-random number in the range [0, 1) derived from the seed and hash, using a simple seeded RNG algorithm.
 * @remarks This function is used to generate consistent random values based on the input seed and hash, ensuring that the same input will always produce the same output. The implementation is a simple linear congruential generator (LCG) variant, which is not cryptographically secure but sufficient for visual variations in avatars.
 */
function seededRandom(seed: number): number {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // Scales to [0, 1)
}
void seededRandom;

function connectToChatStream(): void {
    if (!sessionToken) return;

    if (eventSource) {
        console.log("⚠️ SSE connection already exists, closing old connection...");
        closeEventSource();
    }

    console.log("🔄 Attempting to connect to chat stream...");

    // Use query parameter for token since EventSource does not support headers
    eventSource = new EventSource(`${CHAT_STREAM_URL}?token=${sessionToken}`);

    eventSource.onopen = () => {
        console.log("✅ Successfully connected to chat stream.");
    };

    eventSource.onmessage = (event: MessageEvent<string>) => {
        try {
            const parsedData: unknown = JSON.parse(event.data) as unknown;
            console.log("📩 Raw SSE Data:", parsedData); // Logs as an object (collapsible)
        } catch (error) {
            console.error("❌ Error parsing chat update:", error, "\n📩 Raw data received:", event.data);
        }

        try {
            const messagesUnknown: unknown = JSON.parse(event.data) as unknown;
            assertChatMessageArray(messagesUnknown);
            const messages = messagesUnknown;
            displayChat(messages);
        } catch (error) {
            console.error("❌ Error parsing chat update:", error, "\n📩 Raw data received:", event.data);
        }
    };

    eventSource.onerror = () => {
        console.error("❌ Connection to chat stream lost. Retrying...");
        closeEventSource();
        attemptReconnect(); // Start reconnection attempts every 3 seconds
    };
}

export async function fetchUserIP(): Promise<string | null> {
    try {
        const response = await fetch("https://srv.kittycrypto.gg/get-ip");
        if (!response.ok) throw new Error(`Failed to fetch IP: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        assertGetIpResponse(data);

        console.log(`🌍 User IP: ${data.ip}`);
        window.ipAddress = data.ip;
        return data.ip;
    } catch (error) {
        console.error("❌ Error fetching IP:", error);
        return null;
    }
}

// Sends a chat message
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

    // Create a unique temporary ID for the pending message
    const tempId = `pending-${Date.now()}`;

    // Inject the pending message into the chatroom
    const pendingMessage: ChatMessageLocal = {
        nick,
        id: tempId,
        msg,
        timestamp: new Date().toISOString(),
        msgId: "0",
        pending: true,
    };

    displayChat([pendingMessage], true); // Display it as pending

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

        const message =
            error instanceof Error
                ? error.message
                : String(error);

        alert(`Failed to send message: ${message}`);

        // Remove the pending message on failure
        removePendingMessage(tempId);
    }
}

/**
 * @param {readonly ChatMessageLocal[]} messages - Chat messages to render.
 * @param {boolean} isLocalUpdate - Whether this render is a local append (does not clear chat first).
 * @returns {Promise<void>} Renders the provided chat messages into the chatroom. If isLocalUpdate is false, it clears existing messages first (used for full updates from SSE). If true, it appends to existing messages (used for local pending messages). After rendering, it scrolls to the bottom and dispatches a "chatUpdated" event.
 */
async function displayChat(messages: readonly ChatMessageLocal[], isLocalUpdate: boolean = false): Promise<void> {
    if (!isLocalUpdate) {
        document.querySelectorAll(".chat-message.pending").forEach((el) => el.remove());
        chatroom.innerHTML = "";
    }

    messages.forEach((msgObj) => {
        const {
            nick, id, msg, timestamp,
            msgId, pending = false, edited = false
        } = msgObj;

        const colour = `hsl(${parseInt(id, 16) % 360}, 61%, 51%)`;
        const formattedDate = timestamp.replace("T", " ").slice(0, 19).replace(/-/g, ".");

        const messageDiv = document.createElement("div");
        messageDiv.classList.add("chat-message");
        if (pending) messageDiv.classList.add("pending");

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
        chatroom.appendChild(messageDiv);
    });

    requestAnimationFrame(() => {
        chatroom.scrollTop = chatroom.scrollHeight;
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
    const pendingMessage = document.querySelector(`.chat-message[data-id="${tempId}"]`);
    if (pendingMessage) pendingMessage.remove();
}

// Attach Event Listeners
sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e: KeyboardEvent) => {
    if (e.key === "Enter") sendMessage();
});

let chatClusteriser: ClusteriserLike | null = null;
(async () => {
    chatClusteriser = new (Clusteriser as unknown as ClusteriserConstructor)(chatroom);
    await chatClusteriser.init();
    updateClusterisedChat(); // Optionally, call after init to set initial rows
})();

document.addEventListener("DOMContentLoaded", function () {
    window.scrollTo(0, document.body.scrollHeight);
});

loadNickname();
fetchSessionToken();