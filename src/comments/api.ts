import * as helpers from "../helpers.ts";
import { mkCmtId } from "./session.ts";
import type {
    CommentPostInput,
    CommentPostRes,
    LoadCommentRecordsInput
} from "./types.ts";

type CmtPayloadBase = Readonly<{
    page?: string;
    slug?: string;
    nick: string;
    msg: string;
    ip: string | null;
    sessionToken: string | null;
    timestamp: string;
    id: string;
    location: string;
}>;

type CmtPayload = CmtPayloadBase & Readonly<{ website?: string }>;

export async function loadCommentRecords(
    input: LoadCommentRecordsInput
): Promise<unknown[]> {
    try {
        const encodedValue = encodeURIComponent(input.scopeValue);
        const response = await fetch(
            input.url + "?" + input.scopeParam + "=" + encodedValue
        );

        if (!response.ok) {
            throw new Error("Failed to load comments: " + String(response.status));
        }

        const comments: unknown = await response.json();
        if (!Array.isArray(comments)) {
            throw new Error("Invalid comment data format");
        }

        return comments;
    } catch (error) {
        console.error("❌ Error loading comments:", error);
        return [];
    }
}

export async function postComment(
    input: CommentPostInput
): Promise<CommentPostRes> {
    const timestamp = new Date().toISOString();
    const id = await mkCmtId(input.ip, input.sessionToken, timestamp);
    const scopePayload = "page" in input.scope
        ? { page: input.scope.page }
        : { slug: input.scope.slug };

    const basePayload: CmtPayloadBase = {
        ...scopePayload,
        nick: input.nick,
        msg: input.msg,
        ip: input.emptyCredentialsAsString ? input.ip ?? "" : input.ip,
        sessionToken: input.emptyCredentialsAsString
            ? input.sessionToken ?? ""
            : input.sessionToken,
        timestamp,
        id,
        location: input.location
    };

    const payload: CmtPayload = input.website === undefined
        ? basePayload
        : { ...basePayload, website: input.website };

    try {
        const response = await fetch(input.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (response.ok) return { success: true, id };

        const errorData: unknown = await response.json();
        const serverError =
            helpers.isRecord(errorData) && typeof errorData.error === "string"
                ? errorData.error
                : undefined;

        return { success: false, error: serverError || "Unknown error" };
    } catch (error) {
        console.error("❌ Error sending comment:", error);
        const message = (error as { message?: unknown }).message;
        return { success: false, error: message as string | undefined };
    }
}
