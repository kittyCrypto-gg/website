import { COMMENT_LOCATION_KEY, normLoc } from "./location.ts";
import type { CommentFormControls, CommentFormValues } from "./types.ts";
import { normSite } from "./validation.ts";

export const COMMENT_NICK_KEY = "nickname";

export function readCommentForm(
    controls: CommentFormControls
): CommentFormValues | null {
    const nick = controls.nickInput.value.trim();
    const msg = controls.textarea.value.trim();

    if (!nick || nick.length > 32) {
        alert("Nickname must be 1–32 characters.");
        return null;
    }

    if (!msg || msg.length > 256) {
        alert("Comment must be 1–256 characters.");
        return null;
    }

    const rawWebsite = controls.websiteInput?.value ?? "";
    const website = normSite(rawWebsite);

    if (rawWebsite.trim().length > 0 && website === undefined) {
        alert("Website must be a valid URL, for example https://example.com.");
        return null;
    }

    return {
        nick,
        msg,
        rawWebsite,
        website,
        location: normLoc(controls.locationSelect?.value)
    };
}

export function restoreNick(nickInput: HTMLInputElement): void {
    const storedNick = localStorage.getItem(COMMENT_NICK_KEY);
    if (storedNick) nickInput.value = storedNick;
}

export function persistCommentFormValues(
    controls: CommentFormControls,
    values: CommentFormValues
): void {
    localStorage.setItem(COMMENT_NICK_KEY, values.nick);
    localStorage.setItem(COMMENT_LOCATION_KEY, values.location);
    controls.textarea.value = "";

    if (!controls.websiteInput) return;

    controls.websiteInput.value = values.rawWebsite.trim().length > 0
        ? values.rawWebsite.trim()
        : "";
}

export function stopCommentEventPropagation(root: HTMLElement): void {
    if (root.dataset.commentStopPropagationWired === "1") return;
    root.dataset.commentStopPropagationWired = "1";

    const stop = (event: Event): void => event.stopPropagation();
    root.addEventListener("click", stop);
    root.addEventListener("mousedown", stop);
    root.addEventListener("pointerdown", stop);
    root.addEventListener("touchstart", stop);
    root.addEventListener("keydown", stop);
}
