import { drawSpiralIdenticon } from "./avatar.ts";
import * as config from "./config.ts";
import { createLocationApi, type locApi as LocationApi } from "./locations.ts";
import * as helpers from "./helpers.ts";

declare global {
    interface Window {
        ipAddress?: string | null;
    }
}

const POST_URL = `${config.commentPostURL}`;
const LOAD_URL = `${config.commentLoadURL}`;
const TOKEN_URL = `${config.sessionTokenURL}`;
const IP_URL = `${config.getIpURL}`;

const LOC_DATA_URL = "../data/locations.json";
const LOC_FLAGS_URL = "../images/flags";

const NICK_KEY = "nickname";
const LOC_KEY = "comment-location";

type PostInp = Readonly<{
    nick: string;
    msg: string;
    ip: string | null;
    sessionToken: string | null;
    website?: string;
    location: string;
}>;

type PostOk = Readonly<{
    success: true;
    id: string;
}>;

type PostFail = Readonly<{
    success: false;
    error: string | undefined;
}>;

type PostRes = PostOk | PostFail;

type LoadCmt = Readonly<{
    nick: string;
    ip: string;
    msg: string;
    timestamp: string;
    website?: string;
    location?: string;
}>;

let sTok: string | null = null;
let userIp: string | null = null;
let locApi: LocationApi | null = null;

/**
 * Tiny url check.
 * @param {string} value
 * @returns {boolean}
 */
function isUrl(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

/**
 * Normalises the website field and adds https if needed.
 * blank becomes undefined, bad rubbish stays rejected.
 * @param {string} rawValue
 * @returns {string | undefined}
 */
function normSite(rawValue: string): string | undefined {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) return undefined;

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
    const candidate = hasScheme ? trimmed : `https://${trimmed}`;

    if (!isUrl(candidate)) return undefined;
    return candidate;
}

/**
 * Checks one loaded comment payload.
 * throws if the shape is off.
 * @param {unknown} value
 * @returns {void}
 */
function assertCmt(value: unknown): asserts value is LoadCmt {
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
 * Makes sure empty location vals become "world".
 * @param {string | null | undefined} rawValue
 * @returns {string}
 */
function normLoc(rawValue: string | null | undefined): string {
    const trimmed = rawValue?.trim() ?? "";
    return trimmed.length === 0 ? "world" : trimmed;
}

/**
 * Restores the saved location selection if possible.
 * otherwise just falls back to world and moves on.
 * @param {HTMLSelectElement} locationSelect
 * @returns {void}
 */
function restoreLoc(locationSelect: HTMLSelectElement): void {
    const storedLocation = normLoc(localStorage.getItem(LOC_KEY));
    const hasStoredOption = Array.from(locationSelect.options).some((option) => option.value === storedLocation);

    locationSelect.value = hasStoredOption ? storedLocation : "world";
    locationSelect.dispatchEvent(new Event("change"));
}

/**
 * Inits the location picker bits if the dom nodes exist.
 * @returns {Promise<void>}
 */
async function initLocPicker(): Promise<void> {
    const locationSelect = document.getElementById("comment-location") as HTMLSelectElement | null;
    const locationFlag = document.getElementById("comment-location-flag") as HTMLElement | null;

    if (!locationSelect || !locationFlag) return;

    locApi = createLocationApi({
        selectElement: locationSelect,
        flagElement: locationFlag,
        locationsUrl: LOC_DATA_URL,
        flagsBaseUrl: LOC_FLAGS_URL,
        emptyFlagLabel: "🌎"
    });

    await locApi.init();
    restoreLoc(locationSelect);

    /**
     * Persists the selected location locally.
     * @returns {void}
     */
    const onLocChange = (): void => {
        localStorage.setItem(LOC_KEY, normLoc(locationSelect.value));
    };

    locationSelect.addEventListener("change", onLocChange);
}

/**
 * Makes the boring world badge.
 * @returns {HTMLElement}
 */
function mkWorldBadge(): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "chat-location-badge";
    badge.dataset.location = "world";
    badge.textContent = "🌎";
    badge.setAttribute("aria-label", "World");
    badge.title = "World";
    return badge;
}

/**
 * Makes a location badge for a comment header.
 * falls back to the world icon if anything is missing or weird.
 * @param {string | null | undefined} locationKeyRaw
 * @returns {HTMLElement}
 */
function mkLocBadge(locationKeyRaw: string | null | undefined): HTMLElement {
    const locationKey = normLoc(locationKeyRaw);
    if (locationKey === "world") return mkWorldBadge();
    if (!locApi) return mkWorldBadge();

    try {
        const badge = document.createElement("span");
        badge.className = "chat-location-badge";
        badge.dataset.location = locationKey;

        const image = document.createElement("img");
        image.className = "chat-location-flag";
        image.src = locApi.getFlagUrl(locationKey);
        image.alt = `${locApi.getLabel(locationKey)} flag`;
        image.loading = "lazy";

        badge.appendChild(image);
        badge.title = locApi.getLabel(locationKey);
        return badge;
    } catch {
        return mkWorldBadge();
    }
}

/**
 * Full page id used by the comments api.
 * @returns {string}
 */
function getPageId(): string {
    const path = window.location.pathname;
    const query = window.location.search;
    return `${path}${query}`;
}

/**
 * Fetches a session token for comment posting.
 * @returns {Promise<void>}
 */
async function fetchTok(): Promise<void> {
    try {
        const response = await fetch(TOKEN_URL);
        if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        helpers.assertSessionTokenResponse(data);

        sTok = data.sessionToken;
        console.log("🔑 Session Token received:", sTok);
    } catch (error) {
        console.error("❌ Error fetching session token:", error);
    }
}

/**
 * Fetches the current user ip.
 * @returns {Promise<string | null>}
 */
async function fetchIp(): Promise<string | null> {
    try {
        const response = await fetch(IP_URL);
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

/**
 * Makes a short-ish deterministic comment id.
 * not magic, just hash a few bits and take the front slice.
 * @param {string | null} ip
 * @param {string | null} sessionToken
 * @param {string} timestamp
 * @returns {Promise<string>}
 */
async function mkCmtId(ip: string | null, sessionToken: string | null, timestamp: string): Promise<string> {
    const randomValue = Math.floor(Math.random() * 255) + 1;
    const raw = `${ip}-${sessionToken}-${timestamp}-${randomValue}`;
    const msgUint8 = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex.substring(0, 8);
}

/**
 * Formats a timestamp for display.
 * @param {string} isoString
 * @returns {string}
 */
function fmtTs(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString();
}

/**
 * Loads comments for the current page.
 * @returns {Promise<unknown[]>}
 */
async function loadCmts(): Promise<unknown[]> {
    const currentPage = getPageId();

    try {
        const encodedPage = encodeURIComponent(currentPage);
        const response = await fetch(`${LOAD_URL}?page=${encodedPage}`);
        if (!response.ok) throw new Error(`Failed to load comments: ${response.status}`);

        const comments: unknown = await (response.json() as Promise<unknown>);
        if (!Array.isArray(comments)) throw new Error("Invalid comment data format");

        console.log(`💬 Loaded ${comments.length} comment(s) for page "${currentPage}"`);
        return comments;
    } catch (error) {
        console.error("❌ Error loading comments:", error);
        return [];
    }
}

/**
 * Builds either a plain nick span or a website link.
 * @param {LoadCmt} comment
 * @returns {HTMLElement}
 */
function mkNick(comment: LoadCmt): HTMLElement {
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
 * Renders all comments into the comments box.
 * @returns {Promise<void>}
 */
async function rndCmts(): Promise<void> {
    await helpers.waitForDomReady();
    const comments = await loadCmts();
    const box = document.getElementById("comments-box");
    if (!box) return;

    box.innerHTML = "";

    for (const commentUnknown of comments) {
        assertCmt(commentUnknown);
        const comment = commentUnknown;

        const wrapper = document.createElement("div");
        wrapper.className = "comment-message";

        const header = document.createElement("div");
        header.className = "chat-header";

        const avatarWrapper = document.createElement("div");
        avatarWrapper.className = "avatar-container";

        const identicon = await drawSpiralIdenticon(`${comment.nick}@${comment.ip}`, 48);
        avatarWrapper.appendChild(identicon);
        avatarWrapper.appendChild(mkLocBadge(comment.location));

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
        box.appendChild(wrapper);
    }
}

/**
 * Posts one comment to the api.
 * @param {PostInp} input
 * @returns {Promise<PostRes>}
 */
async function postCmt({
    nick,
    msg,
    ip,
    sessionToken,
    website,
    location
}: PostInp): Promise<PostRes> {
    const page = getPageId();
    const timestamp = new Date().toISOString();
    const id = await mkCmtId(ip, sessionToken, timestamp);

    const payload: Readonly<{
        page: string;
        nick: string;
        msg: string;
        ip: string | null;
        sessionToken: string | null;
        timestamp: string;
        id: string;
        website?: string;
        location: string;
    }> = {
        page,
        nick,
        msg,
        ip,
        sessionToken,
        timestamp,
        id,
        website,
        location
    };

    try {
        const response = await fetch(POST_URL, {
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

        console.log("✅ Comment posted:", payload);
        return { success: true, id };
    } catch (error) {
        console.error("❌ Error sending comment:", error);
        const message = (error as { message?: unknown }).message;
        return { success: false, error: message as string | undefined };
    }
}

/**
 * Wires the comment posting form.
 * @returns {void}
 */
function initPosting(): void {
    const nickInput = document.getElementById("comment-nick") as HTMLInputElement | null;
    const locationSelect = document.getElementById("comment-location") as HTMLSelectElement | null;
    const textarea = document.getElementById("new-comment") as HTMLTextAreaElement | null;
    const websiteInput = document.getElementById("comment-website") as HTMLInputElement | null;
    const button = document.getElementById("post-comment-button") as HTMLElement | null;

    if (!nickInput || !textarea || !button) return;

    const storedNick = localStorage.getItem(NICK_KEY);
    if (storedNick) nickInput.value = storedNick;

    /**
     * Handles posting from the comment form.
     * @returns {Promise<void>}
     */
    const onPost = async (): Promise<void> => {
        const nick = nickInput.value.trim();
        const msg = textarea.value.trim();

        if (!nick || nick.length > 32) {
            alert("Nickname must be 1–32 characters.");
            return;
        }

        if (!msg || msg.length > 256) {
            alert("Comment must be 1–256 characters.");
            return;
        }

        const rawWebsite = websiteInput?.value ?? "";
        const website = normSite(rawWebsite);

        if (rawWebsite.trim().length > 0 && website === undefined) {
            alert("Website must be a valid URL (for example https://example.com).");
            return;
        }

        const location = normLoc(locationSelect?.value);

        localStorage.setItem(NICK_KEY, nick);
        localStorage.setItem(LOC_KEY, location);

        const result = await postCmt({
            nick,
            msg,
            ip: userIp,
            sessionToken: sTok,
            website,
            location
        });

        if (!result.success) {
            alert("Error posting comment: " + result.error);
            return;
        }

        textarea.value = "";

        if (websiteInput) {
            websiteInput.value = rawWebsite.trim().length > 0 ? rawWebsite.trim() : "";
        }

        await rndCmts();
    };

    button.addEventListener("click", () => {
        void onPost();
    });
}

/**
 * Boots the comment page bits once dom is ready.
 * @returns {Promise<void>}
 */
const boot = async (): Promise<void> => {
    await fetchTok();
    userIp = await fetchIp();
    await initLocPicker();
    await rndCmts();
    initPosting();
};

document.addEventListener("DOMContentLoaded", () => {
    void boot();
});