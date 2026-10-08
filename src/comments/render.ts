import { drawSpiralIdenticon } from "../avatar.ts";
import type { locApi as LocationApi } from "../locations.ts";
import { getCommentLocationApi, mkLocBadge } from "./location.ts";
import type { CommentRecord, RenderCommentRecordsInput } from "./types.ts";
import { assertCmt } from "./validation.ts";

export function fmtTs(isoString: string): string {
    return new Date(isoString).toLocaleString();
}

export function mkNick(comment: CommentRecord): HTMLElement {
    if (!comment.website) {
        const nick = document.createElement("span");
        nick.className = "chat-nick";
        nick.textContent = comment.nick;
        return nick;
    }

    const link = document.createElement("a");
    link.className = "chat-nick";
    link.textContent = comment.nick;
    link.href = comment.website;
    link.target = "_blank";
    link.rel = "nofollow noopener noreferrer";
    return link;
}

export async function mkCommentElement(
    comment: CommentRecord,
    api: LocationApi | null = getCommentLocationApi()
): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-message";

    const header = document.createElement("div");
    header.className = "chat-header";

    const avatarWrapper = document.createElement("div");
    avatarWrapper.className = "avatar-container";

    const identicon = await drawSpiralIdenticon(
        comment.nick + "@" + comment.ip,
        48
    );

    avatarWrapper.appendChild(identicon);
    avatarWrapper.appendChild(mkLocBadge(comment.location, api));

    const timestamp = document.createElement("span");
    timestamp.className = "chat-timestamp";
    timestamp.textContent = fmtTs(comment.timestamp);

    const message = document.createElement("span");
    message.className = "chat-text";
    message.textContent = comment.msg;

    header.append(avatarWrapper, mkNick(comment), timestamp);
    wrapper.append(header, message);
    return wrapper;
}

export async function renderCommentRecords(
    input: RenderCommentRecordsInput
): Promise<void> {
    input.box.replaceChildren();

    for (const unknownComment of input.comments) {
        assertCmt(unknownComment);
        input.box.appendChild(
            await mkCommentElement(
                unknownComment,
                input.locationApi ?? getCommentLocationApi()
            )
        );
    }
}
