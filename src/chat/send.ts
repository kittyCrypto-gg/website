import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import type { MsgLocal } from "./types.ts";

const CHAT_URL = `${config.chatURL}`;

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

/** Sends messages and handles the optimistic pending UI. */
export function createChatSender(options: {
    nickEl: HTMLInputElement;
    msgEl: HTMLInputElement;
    getSessionToken: () => string | null;
    showChat: (messages: readonly MsgLocal[], isLocalUpdate?: boolean) => Promise<void>;
    rmPending: (tempId: string) => void;
    syncCluster: () => void;
    saveNickname: (nick: string) => void;
}) {
    const { nickEl, msgEl, getSessionToken, showChat, rmPending, syncCluster, saveNickname } = options;

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

    if (!getSessionToken()) {
        alert("Session token is missing. Please refresh the page.");
        return;
    }

    saveNickname(nick);

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
            sessionToken: getSessionToken()
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

    return sendMsg;
}
