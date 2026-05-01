import { drawSpiralIdenticon } from "./avatar.ts";
import * as config from "./config.ts";
import { createLocationApi, type locApi as LocationApi } from "./locations.ts";
import * as helpers from "./helpers.ts";

declare global {
    interface Window {
        ipAddress?: string | null;
    }
}

export const COMMENT_NICK_KEY = "nickname";
export const COMMENT_LOCATION_KEY = "comment-location";

const POST_URL = `${config.commentPostURL}`;
const LOAD_URL = `${config.commentLoadURL}`;
const TOKEN_URL = `${config.sessionTokenURL}`;
const IP_URL = `${config.getIpURL}`;

const LOC_DATA_URL = "../data/locations.json";
const LOC_FLAGS_URL = "../images/flags";

export type CommentScope = Readonly<
    | {
        page: string;
        slug?: never;
    }
    | {
        slug: string;
        page?: never;
    }
>;

export type CommentRecord = Readonly<{
    nick: string;
    ip: string;
    msg: string;
    timestamp: string;
    website?: string;
    location?: string;
}>;

export type CommentSession = Readonly<{
    sessionToken: string | null;
    userIp: string | null;
}>;

export type CommentFormValues = Readonly<{
    nick: string;
    msg: string;
    rawWebsite: string;
    website?: string;
    location: string;
}>;

export type CommentPostOk = Readonly<{
    success: true;
    id: string;
}>;

export type CommentPostFail = Readonly<{
    success: false;
    error: string | undefined;
}>;

export type CommentPostRes = CommentPostOk | CommentPostFail;

export type CommentPostInput = Readonly<{
    url: string;
    scope: CommentScope;
    nick: string;
    msg: string;
    ip: string | null;
    sessionToken: string | null;
    website?: string;
    location: string;
    emptyCredentialsAsString?: boolean;
}>;

export type CommentFormControls = Readonly<{
    nickInput: HTMLInputElement;
    textarea: HTMLTextAreaElement;
    websiteInput?: HTMLInputElement | null;
    locationSelect?: HTMLSelectElement | null;
}>;

export type LoadCommentRecordsInput = Readonly<{
    url: string;
    scopeParam: "page" | "slug";
    scopeValue: string;
}>;

export type RenderCommentRecordsInput = Readonly<{
    comments: readonly unknown[];
    box: HTMLElement;
    locationApi?: LocationApi | null;
}>;

export type CommentLocationPickerInput = Readonly<{
    selectElement: HTMLSelectElement;
    flagElement: HTMLElement;
    storageKey?: string;
    placeholderLabel?: string;
    emptyFlagLabel?: string;
}>;

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

type CmtPayload = CmtPayloadBase & Readonly<{
    website?: string;
}>;

let sessionToken: string | null = null;
let userIp: string | null = null;
let sessionPromise: Promise<CommentSession> | null = null;
let locApi: LocationApi | null = null;

/**
 * url check, just lets URL do it
 * @param {string} value
 * @returns {boolean}
 */
export function isUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * makes site value less raw
 * @param {string} rawValue
 * @returns {string | undefined}
 */
export function normSite(rawValue: string): string | undefined {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) return undefined;

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
    const candidate = hasScheme ? trimmed : `https://${trimmed}`;

    if (!isUrl(candidate)) return undefined;
    return candidate;
}

/**
 * throws if comment looks wrong
 * @param {unknown} value
 * @returns {void}
 */
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

/**
 * empty loc becomes world
 * @param {string | null | undefined} rawValue
 * @returns {string}
 */
export function normLoc(rawValue: string | null | undefined): string {
    const trimmed = rawValue?.trim() ?? "";
    return trimmed.length === 0 ? "world" : trimmed;
}

/**
 * puts saved loc back in the select
 * @param {HTMLSelectElement} locationSelect
 * @param {string} storageKey
 * @returns {void}
 */
export function restoreLoc(locationSelect: HTMLSelectElement, storageKey = COMMENT_LOCATION_KEY): void {
    const storedLocation = normLoc(localStorage.getItem(storageKey));
    const hasStoredOption = Array.from(locationSelect.options).some((option) => option.value === storedLocation);

    locationSelect.value = hasStoredOption ? storedLocation : "world";
    locationSelect.dispatchEvent(new Event("change"));
}

/**
 * makes the loc picker and saves changes
 * @param {CommentLocationPickerInput} input
 * @returns {Promise<LocationApi>}
 */
export async function initCommentLocationPicker(input: CommentLocationPickerInput): Promise<LocationApi> {
    const storageKey = input.storageKey ?? COMMENT_LOCATION_KEY;

    const api = createLocationApi({
        selectElement: input.selectElement,
        flagElement: input.flagElement,
        locationsUrl: LOC_DATA_URL,
        flagsBaseUrl: LOC_FLAGS_URL,
        placeholderLabel: input.placeholderLabel,
        emptyFlagLabel: input.emptyFlagLabel ?? "🌎"
    });

    await api.init();
    wireLocPkClse(input.selectElement);
    restoreLoc(input.selectElement, storageKey);

    const onLocChange = (): void => {
        localStorage.setItem(storageKey, normLoc(input.selectElement.value));
    };

    input.selectElement.addEventListener("change", onLocChange);
    locApi = api;

    return api;
}

/**
 * folds the fake loc menu after a pick, I think
 * @param {HTMLSelectElement} locationSelect
 * @returns {void}
 */
function wireLocPkClse(locationSelect: HTMLSelectElement): void {
    const picker = locationSelect.parentElement
        ?.querySelector<HTMLElement>(".comment-location-dropdown");

    if (!picker) return;
    if (picker.dataset.wired === "1") return;

    picker.dataset.wired = "1";

    picker.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const item = target.closest(".comment-location-dropdown__item");
        if (!(item instanceof HTMLElement)) return;

        picker.classList.add("is-picked");

        picker.addEventListener(
            "pointerleave",
            () => {
                picker.classList.remove("is-picked");
            },
            { once: true }
        );
    });
}

/**
 * plain world badge
 * @returns {HTMLElement}
 */
export function mkWorldBadge(): HTMLElement {
    const badge = document.createElement("span");

    badge.className = "chat-location-badge";
    badge.dataset.location = "world";
    badge.textContent = "🌎";
    badge.setAttribute("aria-label", "World");
    badge.title = "World";

    return badge;
}

/**
 * flag badge, falls back to world
 * @param {string | null | undefined} locationKeyRaw
 * @param {LocationApi | null} api
 * @returns {HTMLElement}
 */
export function mkLocBadge(locationKeyRaw: string | null | undefined, api: LocationApi | null = locApi): HTMLElement {
    const locationKey = normLoc(locationKeyRaw);
    if (locationKey === "world") return mkWorldBadge();
    if (!api) return mkWorldBadge();

    try {
        const badge = document.createElement("span");
        badge.className = "chat-location-badge";
        badge.dataset.location = locationKey;

        const image = document.createElement("img");
        image.className = "chat-location-flag";
        image.src = api.getFlagUrl(locationKey);
        image.alt = `${api.getLabel(locationKey)} flag`;
        image.loading = "lazy";

        badge.appendChild(image);
        badge.title = api.getLabel(locationKey);

        return badge;
    } catch {
        return mkWorldBadge();
    }
}

/**
 * page-ish id
 * @returns {string}
 */
export function getPageId(): string {
    const path = window.location.pathname;
    const query = window.location.search;

    return `${path}${query}`;
}

/**
 * shared session init
 * @returns {Promise<CommentSession>}
 */
export async function initCommentSession(): Promise<CommentSession> {
    if (sessionPromise) return sessionPromise;

    sessionPromise = bootSess();
    return sessionPromise;
}

/**
 * gets token and ip
 * @returns {Promise<CommentSession>}
 */
async function bootSess(): Promise<CommentSession> {
    sessionToken = await fetchTok();
    userIp = await fetchIp();

    return {
        sessionToken,
        userIp
    };
}

/**
 * token fetch, may fail quietly
 * @returns {Promise<string | null>}
 */
async function fetchTok(): Promise<string | null> {
    try {
        const response = await fetch(TOKEN_URL);
        if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        helpers.assertSessionTokenResponse(data);

        return data.sessionToken;
    } catch (error) {
        console.error("❌ Error fetching session token:", error);
        return null;
    }
}

/**
 * ip fetch, also stashes it on window
 * @returns {Promise<string | null>}
 */
async function fetchIp(): Promise<string | null> {
    try {
        const response = await fetch(IP_URL);
        if (!response.ok) throw new Error(`Failed to fetch IP: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        helpers.assertGetIpResponse(data);

        window.ipAddress = data.ip;
        return data.ip;
    } catch (error) {
        console.error("❌ Error fetching IP:", error);
        return null;
    }
}

/**
 * small hash id for comments
 * @param {string | null} ip
 * @param {string | null} token
 * @param {string} timestamp
 * @returns {Promise<string>}
 */
export async function mkCmtId(ip: string | null, token: string | null, timestamp: string): Promise<string> {
    const randomValue = Math.floor(Math.random() * 255) + 1;
    const raw = `${ip}-${token}-${timestamp}-${randomValue}`;
    const msgUint8 = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    return hashHex.substring(0, 8);
}

/**
 * timestamp for display
 * @param {string} isoString
 * @returns {string}
 */
export function fmtTs(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString();
}

/**
 * fetch comments, returns empty on fail
 * @param {LoadCommentRecordsInput} input
 * @returns {Promise<unknown[]>}
 */
export async function loadCommentRecords(input: LoadCommentRecordsInput): Promise<unknown[]> {
    try {
        const encodedValue = encodeURIComponent(input.scopeValue);
        const response = await fetch(`${input.url}?${input.scopeParam}=${encodedValue}`);

        if (!response.ok) {
            throw new Error(`Failed to load comments: ${response.status}`);
        }

        const comments: unknown = await (response.json() as Promise<unknown>);
        if (!Array.isArray(comments)) throw new Error("Invalid comment data format");

        return comments;
    } catch (error) {
        console.error("❌ Error loading comments:", error);
        return [];
    }
}

/**
 * nick, linked if they left a site
 * @param {CommentRecord} comment
 * @returns {HTMLElement}
 */
export function mkNick(comment: CommentRecord): HTMLElement {
    if (!comment.website) {
        const nickSpan = document.createElement("span");
        nickSpan.className = "chat-nick";
        nickSpan.textContent = comment.nick;
        return nickSpan;
    }

    const nickLink = document.createElement("a");
    nickLink.className = "chat-nick";
    nickLink.textContent = comment.nick;
    nickLink.href = comment.website;
    nickLink.target = "_blank";
    nickLink.rel = "nofollow noopener noreferrer";

    return nickLink;
}

/**
 * make one comment dom node
 * @param {CommentRecord} comment
 * @param {LocationApi | null} api
 * @returns {Promise<HTMLElement>}
 */
export async function mkCommentElement(comment: CommentRecord, api: LocationApi | null = locApi): Promise<HTMLElement> {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-message";

    const header = document.createElement("div");
    header.className = "chat-header";

    const avatarWrapper = document.createElement("div");
    avatarWrapper.className = "avatar-container";

    const identicon = await drawSpiralIdenticon(`${comment.nick}@${comment.ip}`, 48);
    avatarWrapper.appendChild(identicon);
    avatarWrapper.appendChild(mkLocBadge(comment.location, api));

    const timestampSpan = document.createElement("span");
    timestampSpan.className = "chat-timestamp";
    timestampSpan.textContent = fmtTs(comment.timestamp);

    const message = document.createElement("span");
    message.className = "chat-text";
    message.textContent = comment.msg;

    header.appendChild(avatarWrapper);
    header.appendChild(mkNick(comment));
    header.appendChild(timestampSpan);

    wrapper.appendChild(header);
    wrapper.appendChild(message);

    return wrapper;
}

/**
 * clear and render all comments
 * @param {RenderCommentRecordsInput} input
 * @returns {Promise<void>}
 */
export async function renderCommentRecords(input: RenderCommentRecordsInput): Promise<void> {
    input.box.replaceChildren();

    for (const commentUnknown of input.comments) {
        assertCmt(commentUnknown);

        const item = await mkCommentElement(commentUnknown, input.locationApi ?? locApi);
        input.box.appendChild(item);
    }
}

/**
 * send a comment
 * @param {CommentPostInput} input
 * @returns {Promise<CommentPostRes>}
 */
export async function postComment(input: CommentPostInput): Promise<CommentPostRes> {
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
        sessionToken: input.emptyCredentialsAsString ? input.sessionToken ?? "" : input.sessionToken,
        timestamp,
        id,
        location: input.location
    };

    const payload: CmtPayload = input.website === undefined
        ? basePayload
        : {
            ...basePayload,
            website: input.website
        };

    try {
        const response = await fetch(input.url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData: unknown = await (response.json() as Promise<unknown>);
            const serverError =
                helpers.isRecord(errorData) && typeof errorData.error === "string"
                    ? errorData.error
                    : undefined;

            return { success: false, error: serverError || "Unknown error" };
        }

        return { success: true, id };
    } catch (error) {
        console.error("❌ Error sending comment:", error);

        const message = (error as { message?: unknown }).message;
        return { success: false, error: message as string | undefined };
    }
}

/**
 * read and check the form
 * @param {CommentFormControls} controls
 * @returns {CommentFormValues | null}
 */
export function readCommentForm(controls: CommentFormControls): CommentFormValues | null {
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

/**
 * saved nick back in box
 * @param {HTMLInputElement} nickInput
 * @returns {void}
 */
export function restoreNick(nickInput: HTMLInputElement): void {
    const storedNick = localStorage.getItem(COMMENT_NICK_KEY);
    if (storedNick) nickInput.value = storedNick;
}

/**
 * save form bits after posting
 * @param {CommentFormControls} controls
 * @param {CommentFormValues} values
 * @returns {void}
 */
export function persistCommentFormValues(controls: CommentFormControls, values: CommentFormValues): void {
    localStorage.setItem(COMMENT_NICK_KEY, values.nick);
    localStorage.setItem(COMMENT_LOCATION_KEY, values.location);

    controls.textarea.value = "";

    if (controls.websiteInput) {
        controls.websiteInput.value = values.rawWebsite.trim().length > 0
            ? values.rawWebsite.trim()
            : "";
    }
}

/**
 * stop clicks etc leaking out
 * @param {HTMLElement} root
 * @returns {void}
 */
export function stopCommentEventPropagation(root: HTMLElement): void {
    if (root.dataset.commentStopPropagationWired === "1") return;

    root.dataset.commentStopPropagationWired = "1";

    const stop = (event: Event): void => {
        event.stopPropagation();
    };

    root.addEventListener("click", stop);
    root.addEventListener("mousedown", stop);
    root.addEventListener("pointerdown", stop);
    root.addEventListener("touchstart", stop);
    root.addEventListener("keydown", stop);
}

/**
 * page comments load
 * @returns {Promise<unknown[]>}
 */
async function loadPgCmts(): Promise<unknown[]> {
    return loadCommentRecords({
        url: LOAD_URL,
        scopeParam: "page",
        scopeValue: getPageId()
    });
}

/**
 * page comments render
 * @returns {Promise<void>}
 */
async function rndPgCmts(): Promise<void> {
    await helpers.waitForDomReady();

    const comments = await loadPgCmts();
    const box = document.getElementById("comments-box");
    if (!box) return;

    await renderCommentRecords({
        comments,
        box,
        locationApi: locApi
    });
}

/**
 * page location picker, if present
 * @returns {Promise<void>}
 */
async function initPgLoc(): Promise<void> {
    const locationSelect = document.getElementById("comment-location") as HTMLSelectElement | null;
    const locationFlag = document.getElementById("comment-location-flag") as HTMLElement | null;

    if (!locationSelect || !locationFlag) return;

    locApi = await initCommentLocationPicker({
        selectElement: locationSelect,
        flagElement: locationFlag,
        emptyFlagLabel: "🌎"
    });
}

/**
 * page post button wiring
 * @returns {void}
 */
function initPgPost(): void {
    const nickInput = document.getElementById("comment-nick") as HTMLInputElement | null;
    const locationSelect = document.getElementById("comment-location") as HTMLSelectElement | null;
    const textarea = document.getElementById("new-comment") as HTMLTextAreaElement | null;
    const websiteInput = document.getElementById("comment-website") as HTMLInputElement | null;
    const button = document.getElementById("post-comment-button") as HTMLElement | null;

    if (!nickInput || !textarea || !button) return;

    restoreNick(nickInput);

    const onPst = async (): Promise<void> => {
        const values = readCommentForm({
            nickInput,
            textarea,
            websiteInput,
            locationSelect
        });

        if (!values) return;

        persistCommentFormValues(
            {
                nickInput,
                textarea,
                websiteInput,
                locationSelect
            },
            values
        );

        const result = await postComment({
            url: POST_URL,
            scope: { page: getPageId() },
            nick: values.nick,
            msg: values.msg,
            ip: userIp,
            sessionToken,
            website: values.website,
            location: values.location
        });

        if (!result.success) {
            alert("Error posting comment: " + result.error);
            return;
        }

        await rndPgCmts();
    };

    button.addEventListener("click", () => {
        void onPst();
    });
}

/**
 * boot comments on normal pages
 * @returns {Promise<void>}
 */
async function bootPgCmts(): Promise<void> {
    const hasPageComments =
        document.getElementById("comments") !== null ||
        document.getElementById("comments-box") !== null;

    if (!hasPageComments) return;

    await initCommentSession();
    await initPgLoc();
    await rndPgCmts();
    initPgPost();
}

document.addEventListener("DOMContentLoaded", () => {
    void bootPgCmts();
});