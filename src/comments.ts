import { drawSpiralIdenticon } from "./avatar.ts";
import * as config from "./config.ts";
import { createLocationApi, type locApi } from "./locations.ts";

declare global {
    interface Window {
        ipAddress?: string | null;
    }
}

const COMMENT_POST_URL = `${config.commentPostURL}`;
const COMMENT_LOAD_URL = `${config.commentLoadURL}`;
const SESSION_TOKEN_URL = `${config.sessionTokenURL}`;
const USER_IP_URL = `${config.getIpURL}`;

const LOCATION_DATA_URL = "../data/locations.json";
const LOCATION_FLAGS_URL = "../images/flags";

type SessionTokenResponse = Readonly<{
    sessionToken: string;
}>;

type GetIpResponse = Readonly<{
    ip: string;
}>;

type PostCommentInput = Readonly<{
    nick: string;
    msg: string;
    ip: string | null;
    sessionToken: string | null;
    website?: string;
    location: string
}>;

type PostCommentSuccess = Readonly<{
    success: true;
    id: string;
}>;

type PostCommentFailure = Readonly<{
    success: false;
    error: string | undefined;
}>;

type PostCommentResult = PostCommentSuccess | PostCommentFailure;

type LoadedComment = Readonly<{
    nick: string;
    ip: string;
    msg: string;
    timestamp: string;
    website?: string;
    location?: string;
}>;

let sessionToken: string | null = null;
let userIP: string | null = null;
let locAPI: locApi | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isValidURL(value: string): boolean {
    try {
        new URL(value);
        return true;
    } catch {
        return false;
    }
}

function normaliseWebsite(rawValue: string): string | undefined {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) return undefined;

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed);
    const candidate = hasScheme ? trimmed : `https://${trimmed}`;

    if (!isValidURL(candidate)) return undefined;
    return candidate;
}

/**
 * @param {unknown} value - Unknown JSON payload to validate.
 * @returns {void} This function does not return a value; it either completes successfully if the validation passes or throws an error if it fails. The use of "asserts value is SessionTokenResponse" in the function signature allows TypeScript to narrow the type of the value to SessionTokenResponse after this function is called, enabling safer access to the sessionToken property in subsequent code.
 */
function assertSessionTokenResponse(value: unknown): asserts value is SessionTokenResponse {
    if (!isRecord(value)) throw new Error("Invalid session token payload");
    if (typeof value.sessionToken !== "string") throw new Error("Invalid session token payload");
}

/**
 * @param {unknown} value - Unknown JSON payload to validate.
 * @returns {void} This function does not return a value; it either completes successfully if the validation passes or throws an error if it fails. The use of "asserts value is GetIpResponse" in the function signature allows TypeScript to narrow the type of the value to GetIpResponse after this function is called, enabling safer access to the ip property in subsequent code.
 */
function assertGetIpResponse(value: unknown): asserts value is GetIpResponse {
    if (!isRecord(value)) throw new Error("Invalid IP payload");
    if (typeof value.ip !== "string") throw new Error("Invalid IP payload");
}

/**
 * @param {unknown} value - Unknown JSON payload to validate.
 * @returns {void} This function does not return a value; it either completes successfully if the validation passes or throws an error if it fails. The use of "asserts value is LoadedComment" in the function signature allows TypeScript to narrow the type of the value to LoadedComment after this function is called, enabling safer access to the properties of the comment in subsequent code.
 */
function assertLoadedComment(value: unknown): asserts value is LoadedComment {
    if (!isRecord(value)) throw new Error("Invalid data format in comment data");
    if (typeof value.nick !== "string") throw new Error("Invalid nickname format in comment data");
    if (typeof value.ip !== "string") throw new Error("Invalid comment metadata format in comment data");
    if (typeof value.msg !== "string") throw new Error("Invalid comment format in comment data");
    if (typeof value.timestamp !== "string") throw new Error("Invalid comment metadata format");

    const website = value.website;
    if (website !== undefined && typeof website !== "string") throw new Error("Invalid website format in comment data");

    const location = value.location;
    if (location !== undefined && location !== null && typeof location !== "string") {
        throw new Error("Invalid location format in comment data");
    }
}

/**
 * @param {string | null | undefined} rawValue - Location key from the form or loaded comment.
 * @returns {string} The original location key when present, otherwise "world".
 */
function normaliseLocationKey(rawValue: string | null | undefined): string {
    const trimmed = rawValue?.trim() ?? "";
    return trimmed.length === 0 ? "world" : trimmed;
}

/**
 * @returns {Promise<void>} Resolves when the location dropdown has been initialised, or immediately if the required DOM elements are not present.
 */
async function setupLocationPicker(): Promise<void> {
    const locationSelect = document.getElementById("comment-location") as HTMLSelectElement | null;
    const locationFlag = document.getElementById("comment-location-flag") as HTMLElement | null;

    if (!locationSelect || !locationFlag) return;

    locAPI = createLocationApi({
        selectElement: locationSelect,
        flagElement: locationFlag,
        locationsUrl: LOCATION_DATA_URL,
        flagsBaseUrl: LOCATION_FLAGS_URL,
        emptyFlagLabel: "🌎"
    });

    await locAPI.init();
}

/**
 * @param {string | null | undefined} locationKeyRaw - Location key from the loaded comment payload.
 * @returns {HTMLElement} A badge element containing either the location flag image or the world fallback icon.
 */
function buildCommentLocationBadge(locationKeyRaw: string | null | undefined): HTMLElement {
    const locationKey = normaliseLocationKey(locationKeyRaw);
    const badge = document.createElement("span");
    badge.className = "chat-location-badge";
    badge.dataset.location = locationKey;

    if (locationKey === "world") {
        badge.textContent = "🌎";
        badge.setAttribute("aria-label", "World");
        badge.title = "World";
        return badge;
    }

    if (!locAPI) {
        badge.textContent = "🌎";
        badge.setAttribute("aria-label", "World");
        badge.title = "World";
        return badge;
    }

    try {
        const image = document.createElement("img");
        image.className = "chat-location-flag";
        image.src = locAPI.getFlagUrl(locationKey);
        image.alt = `${locAPI.getLabel(locationKey)} flag`;
        image.loading = "lazy";

        badge.appendChild(image);
        badge.title = locAPI.getLabel(locationKey);
        return badge;
    } catch {
        badge.textContent = "🌎";
        badge.setAttribute("aria-label", "World");
        badge.title = "World";
        return badge;
    }
}

// Get full page identifier
function getPageIdentifier(): string {
    const path = window.location.pathname;
    const query = window.location.search;
    return `${path}${query}`;
}

// Fetch Session Token
async function fetchSessionToken(): Promise<void> {
    try {
        const response = await fetch(SESSION_TOKEN_URL);
        if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        assertSessionTokenResponse(data);

        sessionToken = data.sessionToken;
        console.log("🔑 Session Token received:", sessionToken);
    } catch (error) {
        console.error("❌ Error fetching session token:", error);
    }
}

// Fetch User IP
async function fetchUserIP(): Promise<string | null> {
    try {
        const response = await fetch(USER_IP_URL);
        if (!response.ok) throw new Error(`Failed to fetch IP: ${response.status}`);

        const data: unknown = await (response.json() as Promise<unknown>);
        assertGetIpResponse(data);

        console.log(`🌍 User IP: ${data.ip}`);
        window.ipAddress = data.ip;
        return data.ip;
    } catch (error) {
        console.error("❌ Error fetching IP:", error);
        return null;
    }
}

/**
 * @param {string | null} ip - User IP address (may be null).
 * @param {string | null} sessionToken - Session token (may be null).
 * @param {string} timestamp - ISO timestamp string.
 * @returns {Promise<string>} A promise that resolves to an 8-character hexadecimal string that serves as a unique identifier for a comment. The ID is generated by hashing a combination of the user's IP address, session token, timestamp, and a random value using SHA-256, and then taking the first 8 characters of the resulting hash. This approach ensures a high likelihood of uniqueness while keeping the ID concise.
 */
async function generateCommentId(ip: string | null, sessionToken: string | null, timestamp: string): Promise<string> {
    const randomValue = Math.floor(Math.random() * 255) + 1;
    const raw = `${ip}-${sessionToken}-${timestamp}-${randomValue}`;
    const msgUint8 = new TextEncoder().encode(raw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex.substring(0, 8);
}

/**
 * @param isoString - ISO timestamp string.
 * @returns {string}
 */
function formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Load comments for current page
async function loadCommentsForPage(): Promise<unknown[]> {
    const currentPage = getPageIdentifier();
    try {
        const encodedPage = encodeURIComponent(currentPage);
        const response = await fetch(`${COMMENT_LOAD_URL}?page=${encodedPage}`);

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

function domReady(): Promise<void> {
    if (document.readyState !== "loading") return Promise.resolve();

    return new Promise<void>((resolve) => {
        document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
}

async function renderComments(): Promise<void> {
    await domReady();
    const comments = await loadCommentsForPage();
    const box = document.getElementById("comments-box");
    if (!box) return;

    box.innerHTML = "";

    for (const commentUnknown of comments) {
        assertLoadedComment(commentUnknown);
        const comment = commentUnknown;

        const wrapper = document.createElement("div");
        wrapper.className = "comment-message";

        const header = document.createElement("div");
        header.className = "chat-header";

        const avatarWrapper = document.createElement("div");
        avatarWrapper.className = "avatar-container";

        const identicon = await drawSpiralIdenticon(`${comment.nick}@${comment.ip}`, 48);
        avatarWrapper.appendChild(identicon);

        const timestampSpan = document.createElement("span");
        timestampSpan.className = "chat-timestamp";
        timestampSpan.textContent = formatTimestamp(comment.timestamp);

        const nickNode: HTMLElement = (() => {
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
        })();

        const locationBadge = buildCommentLocationBadge(comment.location);

        header.appendChild(avatarWrapper);
        header.appendChild(nickNode);
        header.appendChild(timestampSpan);
        avatarWrapper.appendChild(locationBadge);

        const message = document.createElement("span");
        message.className = "chat-text";
        message.textContent = comment.msg;

        wrapper.appendChild(header);
        wrapper.appendChild(message);
        box.appendChild(wrapper);
    }
}

/**
 * @param {string} nick - Comment nickname.
 * @param {string} msg - Comment text.
 * @param {string | null} ip - User IP address (may be null).
 * @param {string | null} sessionToken - Session token (may be null).
 * @param {string | undefined} website - Optional website URL for the nickname link.
 * @returns {Promise<PostCommentResult>} Result of the comment posting operation, indicating success or failure and any associated error message.
 */
async function postComment({ nick, msg, ip, sessionToken, website, location }: PostCommentInput): Promise<PostCommentResult> {
    const page = getPageIdentifier();
    const timestamp = new Date().toISOString();
    const id = await generateCommentId(ip, sessionToken, timestamp);

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
        const response = await fetch(COMMENT_POST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData: unknown = await (response.json() as Promise<unknown>);
            const serverError =
                isRecord(errorData) && typeof errorData.error === "string"
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

function setupCommentPosting(): void {
    const nickInput = document.getElementById("comment-nick") as HTMLInputElement | null;
    const locationSelect = document.getElementById("comment-location") as HTMLSelectElement | null;
    const textarea = document.getElementById("new-comment") as HTMLTextAreaElement | null;
    const websiteInput = document.getElementById("comment-website") as HTMLInputElement | null;
    const button = document.getElementById("post-comment-button") as HTMLElement | null;

    if (!nickInput || !textarea || !button) return;

    const storedNick = localStorage.getItem("nickname");
    if (storedNick) nickInput.value = storedNick;

    button.addEventListener("click", async () => {
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
        const website = normaliseWebsite(rawWebsite);

        if (rawWebsite.trim().length > 0 && website === undefined) {
            alert("Website must be a valid URL (for example https://example.com).");
            return;
        }

        const location = normaliseLocationKey(locationSelect?.value);

        localStorage.setItem("nickname", nick);

        const result = await postComment({
            nick,
            msg,
            ip: userIP,
            sessionToken,
            website,
            location
        });

        if (!result.success) {
            alert("Error posting comment: " + result.error);
            return;
        }

        textarea.value = "";
        if (websiteInput) websiteInput.value = rawWebsite.trim().length > 0 ? rawWebsite.trim() : "";
        if (locationSelect) locationSelect.value = locationSelect.value;
        await renderComments();
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    await fetchSessionToken();
    userIP = await fetchUserIP();
    await setupLocationPicker();
    await renderComments();
    setupCommentPosting();
});