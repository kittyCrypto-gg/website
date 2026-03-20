import type { ReactElement } from "react";
import * as config from "./config.ts";
import { modals, onModalEvent, closeOnClick } from "./modals.ts";
import { render2Frag, render2Mkup } from "./reactHelpers.tsx";

declare global {
    interface Window {
        CHAT_SERVER?: string;
        MAIN_SERVER?: string;
        GET_IP_HASH_URL?: string;
        nicknameInput?: HTMLElement | null;
        sessionToken?: string;
        editMessage?: () => Promise<void>;
        closeEditModal?: () => void;
    }
}

window.CHAT_SERVER = `${config.chatURL}`;
window.MAIN_SERVER = `${config.BACKEND_URL}`;
window.GET_IP_HASH_URL = window.GET_IP_HASH_URL || `${window.MAIN_SERVER}/get-ip/sha256`;
window.nicknameInput = window.nicknameInput || document.getElementById("nickname");

const chatServer = window.CHAT_SERVER;
const getIpHashUrl = window.GET_IP_HASH_URL;

let userHashedIp: string | null = null;

const EDIT_MESSAGE_MODAL_ID = "edit-message-modal";

/**
 * @returns {ReactElement}
 */
function EditMsgModal(): ReactElement {
    return (
        <div id="edit-message-container">
            <input type="hidden" id="edit-message-id-hidden" />

            <div id="edit-message-id" />

            <label htmlFor="edit-user-info">Editing message from:</label>
            <input type="text" id="edit-user-info" disabled />

            <label htmlFor="edit-message-input">Message:</label>
            <textarea id="edit-message-input" />

            <div id="edit-message-buttons">
                <button id="edit-message-btn" type="button">Edit</button>
                <button id="cancel-edit-btn" type="button">Cancel</button>
            </div>
        </div>
    );
}

/**
 * @returns {ReactElement}
 */
function ChatActs(): ReactElement {
    return (
        <span className="chat-actions">
            <span
                className="chat-action"
                data-chat-action="edit"
                title="Edit Message"
                style={{ cursor: "pointer" }}
            >
                {" ✏️"}
            </span>

            <span
                className="chat-action"
                data-chat-action="delete"
                title="Delete Message"
                style={{ cursor: "pointer" }}
            >
                {" ❌"}
            </span>
        </span>
    );
}

/**
 * @param {{ userNick: string; messageContent: string }} props
 * @returns {ReactElement}
 */
function PendingMsg(props: { userNick: string; messageContent: string }): ReactElement {
    return (
        <>
            <span className="chat-header">
                <span className="chat-nick">{props.userNick} (Deleting...)</span>
            </span>
            <div className="chat-text">{props.messageContent}</div>
        </>
    );
}

/**
 * @param {{ userNick: string; messageContent: string }} props
 * @returns {ReactElement}
 */
function FailedMsg(props: { userNick: string; messageContent: string }): ReactElement {
    return (
        <>
            <span className="chat-header">
                <span className="chat-nick">{props.userNick} (Failed to delete)</span>
            </span>
            <div className="chat-text">{props.messageContent}</div>
            <div className="chat-error">An error occurred while deleting the message.</div>
        </>
    );
}

const EDIT_MESSAGE_MODAL_HTML = render2Mkup(<EditMsgModal />);

const editMessageModal = modals.create({
    id: EDIT_MESSAGE_MODAL_ID,
    mode: "blocking",
    content: EDIT_MESSAGE_MODAL_HTML,
    decorators: [
        onModalEvent("#edit-message-btn", "click", () => {
            void editMessage();
        }),
        closeOnClick("#cancel-edit-btn")
    ]
});

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @returns {Promise<void>}
 */
async function fetchUserHashedIp(): Promise<void> {
    try {
        const response = await fetch(String(getIpHashUrl));
        if (!response.ok) throw new Error("Failed to fetch hashed IP");

        const data: unknown = await response.json();

        if (!isRecord(data) || typeof data.hashedIp !== "string") {
            throw new Error("Invalid hashed IP response");
        }

        userHashedIp = data.hashedIp;
        console.log("🔑 User Hashed IP:", userHashedIp);
    } catch (error: unknown) {
        console.error("❌ Error fetching hashed IP:", error);
    }
}

/**
 * @param {Element} messageDiv
 * @returns {string}
 */
function getMsgId(messageDiv: Element): string {
    const msgIdSpan = messageDiv.querySelector(".chat-msg-id");
    return msgIdSpan?.textContent?.replace("ID: ", "").trim() || "";
}

/**
 * @param {Element} messageDiv
 * @returns {void}
 */
function addActs(messageDiv: Element): void {
    if (messageDiv.querySelector(".chat-actions")) return;

    const chatHeaderDiv = messageDiv.querySelector(".chat-header");
    if (!(chatHeaderDiv instanceof HTMLElement)) return;

    const msgId = getMsgId(messageDiv);
    if (!msgId) return;

    const frag = render2Frag(<ChatActs />);
    const actionSpan = frag.firstElementChild;
    if (!(actionSpan instanceof HTMLSpanElement)) return;

    const editButton = actionSpan.querySelector("[data-chat-action='edit']");
    const deleteButton = actionSpan.querySelector("[data-chat-action='delete']");

    if (editButton instanceof HTMLElement) {
        editButton.onclick = () => {
            void openEditModal(messageDiv);
        };
    }

    if (deleteButton instanceof HTMLElement) {
        deleteButton.onclick = () => {
            void deleteMessage(msgId);
        };
    }

    chatHeaderDiv.appendChild(actionSpan);
}

/**
 * @returns {void}
 */
function enhanceMessages(): void {
    const sessionToken = window.sessionToken;
    if (!sessionToken) return;

    const sessionTokenInt = BigInt(`0x${sessionToken}`);

    document.querySelectorAll(".chat-message").forEach((messageDiv) => {
        const rawMsgId = getMsgId(messageDiv);
        if (!rawMsgId) return;

        const msgId = BigInt(rawMsgId);
        const residue = msgId % sessionTokenInt;

        if (residue !== BigInt(0)) return;

        console.log("✨ Enhancing message:", msgId.toString());
        addActs(messageDiv);
    });
}

/**
 * @returns {Promise<void>}
 */
async function initialiseChat(): Promise<void> {
    await fetchUserHashedIp();
    document.addEventListener("chatUpdated", enhanceMessages);
}

void initialiseChat().then(() => {
    console.log("🚀 Chat enhancements initialised.");
});

/**
 * @param {Element} messageDiv
 * @returns {Promise<void>}
 */
async function openEditModal(messageDiv: Element): Promise<void> {
    editMessageModal.open();
    populateModalFields(messageDiv);
}

/**
 * @returns {void}
 */
function closeEditModal(): void {
    editMessageModal.close();
}

/**
 * @returns {Promise<void>}
 */
async function editMessage(): Promise<void> {
    const sessionToken = window.sessionToken;

    const msgId =
        (document.getElementById("edit-message-id-hidden") as HTMLInputElement | null)?.value || "";

    const newMessage =
        (
            document.getElementById("edit-message-input") as
            | HTMLInputElement
            | HTMLTextAreaElement
            | null
        )?.value || "";

    console.log("msgId field:", document.getElementById("edit-message-id")?.textContent);
    console.log("extracted msgId:", msgId, "newMessage:", newMessage);

    if (!msgId || !newMessage) {
        console.log(msgId, newMessage);
        alert("Please provide a message to edit.");
        console.error("❌ Missing message data.");
        return;
    }

    const body = {
        msgId,
        sessionToken,
        ip: userHashedIp,
        newMessage
    };

    const response = await fetch(`${chatServer}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`❌ Server error: ${response.status} ${response.statusText}`);
    }

    console.log("✅ Message edited successfully.");
    closeEditModal();
}

/**
 * @param {Element} messageDiv
 * @returns {void}
 */
function populateModalFields(messageDiv: Element): void {
    const modal = document.getElementById("edit-message-modal");
    if (!modal) return;

    const messageText = messageDiv.querySelector(".chat-text")?.textContent || "";
    const msgId = getMsgId(messageDiv);
    const userNick = messageDiv.querySelector(".chat-nick")?.textContent?.split(" - ")[0] || "";
    const userId =
        messageDiv.querySelector(".chat-nick")?.textContent?.match(/\((0x[a-f0-9]+)\)/)?.[1] || "";

    const messageInput =
        modal.querySelector<HTMLInputElement | HTMLTextAreaElement>("#edit-message-input");

    const messageIdField = modal.querySelector<HTMLElement>("#edit-message-id");

    const userInfoField =
        modal.querySelector<HTMLInputElement | HTMLTextAreaElement>("#edit-user-info");

    const msgIdHidden = modal.querySelector<HTMLInputElement>("#edit-message-id-hidden");

    if (messageInput) messageInput.value = messageText;
    if (messageIdField) messageIdField.textContent = `Editing Message ID: ${msgId}`;
    if (msgIdHidden) msgIdHidden.value = msgId;
    if (userInfoField) userInfoField.value = `${userNick} (${userId})`;
}

/**
 * @param {HTMLElement} container
 * @param {ReactElement} content
 * @returns {void}
 */
function setMsgContent(container: HTMLElement, content: ReactElement): void {
    container.innerHTML = render2Mkup(content);
}

/**
 * @param {string} msgId
 * @returns {Promise<void>}
 */
async function deleteMessage(msgId: string): Promise<void> {
    const sessionToken = window.sessionToken;
    console.log("🗑️ Deleting message:", msgId);

    const messageDiv = [...document.querySelectorAll(".chat-message")].find((div) =>
        div.querySelector(".chat-msg-id")?.textContent?.includes(msgId)
    );

    let messageContent = "Message is being deleted...";
    let userNick = "Unknown";

    if (messageDiv instanceof HTMLElement) {
        const messageTextDiv = messageDiv.querySelector(".chat-text");
        const messageNickDiv = messageDiv.querySelector(".chat-nick");

        messageContent = messageTextDiv?.textContent || messageContent;
        userNick = messageNickDiv?.textContent || userNick;

        messageDiv.remove();
    }

    const pendingMessageDiv = document.createElement("div");
    pendingMessageDiv.classList.add("chat-message", "pending");
    setMsgContent(
        pendingMessageDiv,
        <PendingMsg userNick={userNick} messageContent={messageContent} />
    );

    document.getElementById("chatroom")?.appendChild(pendingMessageDiv);

    const body = {
        msgId,
        sessionToken,
        ip: userHashedIp
    };

    try {
        const response = await fetch(`${chatServer}/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`❌ Server error: ${response.status} ${response.statusText}`);
        }

        const responseData: unknown = await response.json();
        console.log("✅ Message deleted successfully:", responseData);

        pendingMessageDiv.remove();
    } catch (error: unknown) {
        console.error("❌ Error deleting message:", error);

        if (messageDiv instanceof HTMLElement) {
            document.getElementById("chatroom")?.appendChild(messageDiv);
        }

        setMsgContent(
            pendingMessageDiv,
            <FailedMsg userNick={userNick} messageContent={messageContent} />
        );

        setTimeout(() => pendingMessageDiv.remove(), 5000);
    }
}

window.editMessage = editMessage;
window.closeEditModal = closeEditModal;