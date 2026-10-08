import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import type { CommentSession } from "./types.ts";

declare global {
    interface Window { ipAddress?: string | null; }
}

let sessionToken: string | null = null;
let userIp: string | null = null;
let sessionPromise: Promise<CommentSession> | null = null;

export function getCommentSessionSnapshot(): CommentSession {
    return { sessionToken, userIp };
}

async function fetchToken(): Promise<string | null> {
    try {
        const response = await fetch(config.sessionTokenURL);
        if (!response.ok) {
            throw new Error("Failed to fetch session token: " + String(response.status));
        }

        const data: unknown = await response.json();
        helpers.assertSessionTokenResponse(data);
        return data.sessionToken;
    } catch (error) {
        console.error("❌ Error fetching session token:", error);
        return null;
    }
}

async function fetchIp(): Promise<string | null> {
    try {
        const response = await fetch(config.getIpURL);
        if (!response.ok) {
            throw new Error("Failed to fetch IP: " + String(response.status));
        }

        const data: unknown = await response.json();
        helpers.assertGetIpResponse(data);
        window.ipAddress = data.ip;
        return data.ip;
    } catch (error) {
        console.error("❌ Error fetching IP:", error);
        return null;
    }
}

async function bootSession(): Promise<CommentSession> {
    sessionToken = await fetchToken();
    userIp = await fetchIp();
    return { sessionToken, userIp };
}

export async function initCommentSession(): Promise<CommentSession> {
    if (sessionPromise) return sessionPromise;
    sessionPromise = bootSession();
    return sessionPromise;
}

export async function mkCmtId(
    ip: string | null,
    token: string | null,
    timestamp: string
): Promise<string> {
    const randomValue = Math.floor(Math.random() * 255) + 1;
    const raw = [ip, token, timestamp, String(randomValue)].join("-");
    const bytes = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    return hashHex.substring(0, 8);
}
