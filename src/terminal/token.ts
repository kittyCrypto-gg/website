import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import {
    bindInteractionToSession,
    readTerminalSessionToken,
    writeTerminalSessionToken
} from "./sessionState.ts";
import type { SessionTokenResult } from "./types.ts";

export async function getOrCreateSessionToken(): Promise<SessionTokenResult> {
    const existing = readTerminalSessionToken();

    if (existing && existing.length > 0) {
        bindInteractionToSession(existing);
        return { token: existing, isNew: false };
    }

    const response = await fetch(config.sessionTokenURL, {
        method: "GET",
        cache: "no-store",
        credentials: "omit"
    });

    if (!response.ok) {
        throw new Error(
            "Failed to obtain session token (status=" +
            String(response.status) +
            ")"
        );
    }

    const body: unknown = await response.json();
    const token =
        helpers.isRecord(body) &&
        typeof body.sessionToken === "string" &&
        body.sessionToken.length > 0
            ? body.sessionToken
            : "";

    if (!token) {
        throw new Error("Session endpoint returned no sessionToken");
    }

    writeTerminalSessionToken(token);
    bindInteractionToSession(token);

    return { token, isNew: true };
}
