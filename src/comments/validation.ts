import * as helpers from "../helpers.ts";
import type { CommentRecord } from "./types.ts";

export function isUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

export function normSite(rawValue: string): string | undefined {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) return undefined;

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
    const candidate = hasScheme ? trimmed : "https://" + trimmed;

    if (!isUrl(candidate)) return undefined;
    return candidate;
}

export function assertCmt(value: unknown): asserts value is CommentRecord {
    if (!helpers.isRecord(value)) throw new Error("Invalid data format in comment data");
    if (typeof value.nick !== "string") throw new Error("Invalid nickname format in comment data");
    if (typeof value.ip !== "string") throw new Error("Invalid comment metadata format in comment data");
    if (typeof value.msg !== "string") throw new Error("Invalid comment format in comment data");
    if (typeof value.timestamp !== "string") throw new Error("Invalid comment metadata format");

    const website = value.website;
    if (website !== undefined && typeof website !== "string") {
        throw new Error("Invalid website format in comment data");
    }

    const location = value.location;
    if (location !== undefined && location !== null && typeof location !== "string") {
        throw new Error("Invalid location format in comment data");
    }
}
