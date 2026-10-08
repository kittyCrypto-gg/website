import * as helpers from "../helpers.ts";

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

export type MsgLocal = ChatMessage & Readonly<{
    pending?: boolean;
}>;

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
export function assertMsgArr(value: unknown): asserts value is ChatMessage[] {
    if (!Array.isArray(value)) throw new Error("Invalid SSE payload: expected an array");

    for (const item of value) {
        if (!isMsg(item)) {
            throw new Error("Invalid SSE payload: array contained non-ChatMessage items");
        }
    }
}
