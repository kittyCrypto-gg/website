import type { ReactElement } from "react";
import * as config from "./config.ts";
import { factory, onModalEvent, closeOnClick } from "./modals.ts";
import { render2Frag, render2Mkup } from "./reactHelpers.tsx";
import * as helpers from "./helpers.ts";

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

const MOD_ID = "edit-message-modal";

/**
 * little edit modal body. just the form bits really.
 *
 * @returns modal react bit
 */
function EditMod(): ReactElement {
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
 * tiny action buttons for each chat msg.
 * edit + delete, nothing fancy.
 *
 * @returns action buttons chunk
 */
function Acts(): ReactElement {
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
 * temp message while delete is happening.
 * gives the user something to look at instead of it just vanishing.
 *
 * @param props nick + message text
 * @returns pending msg markup
 */
function Pending(props: { userNick: string; messageContent: string }): ReactElement {
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
 * shown when delete falls over.
 * bit grumpy, but useful.
 *
 * @param props nick + message text
 * @returns failed msg markup
 */
function Failed(props: { userNick: string; messageContent: string }): ReactElement {
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

const MOD_HTML = render2Mkup(<EditMod />);

const editMsg = async (): Promise<void> => {
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
    closeMod();
};

const closeMod = (): void => {
    mod.close();
};

const mod = factory.create({
    id: MOD_ID,
    mode: "blocking",
    content: MOD_HTML,
    decorators: [
        onModalEvent("#edit-message-btn", "click", () => {
            void editMsg();
        }),
        closeOnClick("#cancel-edit-btn")
    ]
});

/**
 * fetches the hashed ip the chat backend wants.
 * if it fails, we just log it and carry on for now.
 *
 * @returns resolves when the fetch attempt is done
 */
async function fetchHash(): Promise<void> {
    try {
        const response = await fetch(String(getIpHashUrl));
        if (!response.ok) throw new Error("Failed to fetch hashed IP");

        const data: unknown = await response.json();

        if (!helpers.isRecord(data) || typeof data.hashedIp !== "string") {
            throw new Error("Invalid hashed IP response");
        }

        userHashedIp = data.hashedIp;
        console.log("🔑 User Hashed IP:", userHashedIp);
    } catch (error: unknown) {
        console.error("❌ Error fetching hashed IP:", error);
    }
}

/**
 * reads the visible msg id from a chat message node.
 *
 * @param msgEl chat message element
 * @returns msg id text or empty string
 */
function getId(msgEl: Element): string {
    const msgIdSpan = msgEl.querySelector(".chat-msg-id");
    return msgIdSpan?.textContent?.replace("ID: ", "").trim() || "";
}

/**
 * adds edit/delete controls to one message, if it qualifies.
 * skips it if actions are already there or if the node is missing key bits.
 *
 * @param msgEl one chat message element
 * @returns nothing
 */
function addActs(msgEl: Element): void {
    if (msgEl.querySelector(".chat-actions")) return;

    const headEl = msgEl.querySelector(".chat-header");
    if (!(headEl instanceof HTMLElement)) return;

    const msgId = getId(msgEl);
    if (!msgId) return;

    const frag = render2Frag(<Acts />);
    const actEl = frag.firstElementChild;
    if (!(actEl instanceof HTMLSpanElement)) return;

    const editBtn = actEl.querySelector("[data-chat-action='edit']");
    const delBtn = actEl.querySelector("[data-chat-action='delete']");

    if (editBtn instanceof HTMLElement) {
        editBtn.onclick = () => {
            void openMod(msgEl);
        };
    }

    if (delBtn instanceof HTMLElement) {
        delBtn.onclick = () => {
            void delMsg(msgId);
        };
    }

    headEl.appendChild(actEl);
}

/**
 * looks through rendered chat messages and adds controls to the ones
 * that belong to the current session token maths-wise.
 *
 * @returns nothing
 */
function enhance(): void {
    const sessionToken = window.sessionToken;
    if (!sessionToken) return;

    const sessionTokenInt = BigInt(`0x${sessionToken}`);

    document.querySelectorAll(".chat-message").forEach((msgEl) => {
        const rawMsgId = getId(msgEl);
        if (!rawMsgId) return;

        const msgId = BigInt(rawMsgId);
        const residue = msgId % sessionTokenInt;

        if (residue !== BigInt(0)) return;

        console.log("✨ Enhancing message:", msgId.toString());
        addActs(msgEl);
    });
}

/**
 * bootstraps the chat extras.
 * right now that means hashed ip + re-enhancing on chat updates.
 *
 * @returns resolves when setup is done
 */
async function init(): Promise<void> {
    await fetchHash();
    document.addEventListener("chatUpdated", enhance);
}

void init().then(() => {
    console.log("🚀 Chat enhancements initialised.");
});

/**
 * opens the edit modal and fills it from the clicked message.
 *
 * @param msgEl source chat message
 * @returns resolves after modal open/fill stuff
 */
async function openMod(msgEl: Element): Promise<void> {
    mod.open();
    fillMod(msgEl);
}

/**
 * fills the modal fields from a chat message node.
 * bit scrappy, but gets the job done.
 *
 * @param msgEl source chat message
 * @returns nothing
 */
function fillMod(msgEl: Element): void {
    const modalEl = document.getElementById(MOD_ID);
    if (!modalEl) return;

    const messageText = msgEl.querySelector(".chat-text")?.textContent || "";
    const msgId = getId(msgEl);
    const userNick = msgEl.querySelector(".chat-nick")?.textContent?.split(" - ")[0] || "";
    const userId =
        msgEl.querySelector(".chat-nick")?.textContent?.match(/\((0x[a-f0-9]+)\)/)?.[1] || "";

    const messageInput =
        modalEl.querySelector<HTMLInputElement | HTMLTextAreaElement>("#edit-message-input");

    const messageIdField = modalEl.querySelector<HTMLElement>("#edit-message-id");

    const userInfoField =
        modalEl.querySelector<HTMLInputElement | HTMLTextAreaElement>("#edit-user-info");

    const msgIdHidden = modalEl.querySelector<HTMLInputElement>("#edit-message-id-hidden");

    if (messageInput) messageInput.value = messageText;
    if (messageIdField) messageIdField.textContent = `Editing Message ID: ${msgId}`;
    if (msgIdHidden) msgIdHidden.value = msgId;
    if (userInfoField) userInfoField.value = `${userNick} (${userId})`;
}

/**
 * swaps the inner markup of a chat message container.
 *
 * @param container target element
 * @param content react content to render
 * @returns nothing
 */
function setMsg(container: HTMLElement, content: ReactElement): void {
    container.innerHTML = render2Mkup(content);
}

/**
 * deletes a message through the backend and shows a temporary pending block.
 * if it fails it puts the original back and shows a failure state for a bit.
 *
 * @param msgId message id to delete
 * @returns resolves when the delete flow finishes
 */
async function delMsg(msgId: string): Promise<void> {
    const sessionToken = window.sessionToken;
    console.log("🗑️ Deleting message:", msgId);

    const msgEl = [...document.querySelectorAll(".chat-message")].find((div) =>
        div.querySelector(".chat-msg-id")?.textContent?.includes(msgId)
    );

    let messageContent = "Message is being deleted...";
    let userNick = "Unknown";

    if (msgEl instanceof HTMLElement) {
        const messageTextDiv = msgEl.querySelector(".chat-text");
        const messageNickDiv = msgEl.querySelector(".chat-nick");

        messageContent = messageTextDiv?.textContent || messageContent;
        userNick = messageNickDiv?.textContent || userNick;

        msgEl.remove();
    }

    const pendingEl = document.createElement("div");
    pendingEl.classList.add("chat-message", "pending");
    setMsg(
        pendingEl,
        <Pending userNick={userNick} messageContent={messageContent} />
    );

    document.getElementById("chatroom")?.appendChild(pendingEl);

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

        pendingEl.remove();
    } catch (error: unknown) {
        console.error("❌ Error deleting message:", error);

        if (msgEl instanceof HTMLElement) {
            document.getElementById("chatroom")?.appendChild(msgEl);
        }

        setMsg(
            pendingEl,
            <Failed userNick={userNick} messageContent={messageContent} />
        );

        setTimeout(() => pendingEl.remove(), 5000);
    }
}

window.editMessage = editMsg;
window.closeEditModal = closeMod;