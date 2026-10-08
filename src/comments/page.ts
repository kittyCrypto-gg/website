import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import { loadCommentRecords, postComment } from "./api.ts";
import { persistCommentFormValues, readCommentForm, restoreNick } from "./form.ts";
import { getCommentLocationApi, initCommentLocationPicker } from "./location.ts";
import { renderCommentRecords } from "./render.ts";
import { getCommentSessionSnapshot, initCommentSession } from "./session.ts";

const POST_URL = config.commentPostURL;
const LOAD_URL = config.commentLoadURL;

export function getPageId(): string {
    return window.location.pathname + window.location.search;
}

async function loadPageComments(): Promise<unknown[]> {
    return loadCommentRecords({
        url: LOAD_URL,
        scopeParam: "page",
        scopeValue: getPageId()
    });
}

async function renderPageComments(): Promise<void> {
    await helpers.waitForDomReady();
    const box = document.getElementById("comments-box");
    if (!box) return;

    await renderCommentRecords({
        comments: await loadPageComments(),
        box,
        locationApi: getCommentLocationApi()
    });
}

async function initPageLocation(): Promise<void> {
    const select = document.getElementById("comment-location");
    const flag = document.getElementById("comment-location-flag");

    if (!(select instanceof HTMLSelectElement)) return;
    if (!(flag instanceof HTMLElement)) return;

    await initCommentLocationPicker({
        selectElement: select,
        flagElement: flag,
        emptyFlagLabel: "🌎"
    });
}

function initPagePost(): void {
    const nickInput = document.getElementById("comment-nick");
    const locationSelect = document.getElementById("comment-location");
    const textarea = document.getElementById("new-comment");
    const websiteInput = document.getElementById("comment-website");
    const button = document.getElementById("post-comment-button");

    if (!(nickInput instanceof HTMLInputElement)) return;
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    if (!(button instanceof HTMLElement)) return;

    const location = locationSelect instanceof HTMLSelectElement
        ? locationSelect
        : null;
    const website = websiteInput instanceof HTMLInputElement
        ? websiteInput
        : null;

    restoreNick(nickInput);

    const onPost = async (): Promise<void> => {
        const controls = {
            nickInput,
            textarea,
            websiteInput: website,
            locationSelect: location
        };
        const values = readCommentForm(controls);
        if (!values) return;

        persistCommentFormValues(controls, values);
        const session = getCommentSessionSnapshot();
        const result = await postComment({
            url: POST_URL,
            scope: { page: getPageId() },
            nick: values.nick,
            msg: values.msg,
            ip: session.userIp,
            sessionToken: session.sessionToken,
            website: values.website,
            location: values.location
        });

        if (!result.success) {
            alert("Error posting comment: " + result.error);
            return;
        }

        await renderPageComments();
    };

    button.addEventListener("click", () => void onPost());
}

async function bootPageComments(): Promise<void> {
    const hasComments =
        document.getElementById("comments") !== null ||
        document.getElementById("comments-box") !== null;

    if (!hasComments) return;

    await initCommentSession();
    await initPageLocation();
    await renderPageComments();
    initPagePost();
}

void helpers.waitForDomReady().then(bootPageComments);
