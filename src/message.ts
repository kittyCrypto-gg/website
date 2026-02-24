import * as config from "./config.ts";
import { modals, onModalEvent, closeOnClick } from "./modals.ts";

interface Window {
    CHAT_SERVER?: string;
    MAIN_SERVER?: string;
    GET_IP_HASH_URL?: string;
    nicknameInput?: HTMLElement | null;
    sessionToken?: string;
    editMessage?: () => Promise<void>;
    closeEditModal?: () => void;
}

declare const CHAT_SERVER: string;
declare const GET_IP_HASH_URL: string;

window.CHAT_SERVER = `${config.chatURL}`;
window.MAIN_SERVER = `${config.BACKEND_URL}`;
window.GET_IP_HASH_URL = window.GET_IP_HASH_URL || `${window.MAIN_SERVER}/get-ip/sha256`;
window.nicknameInput = window.nicknameInput || document.getElementById("nickname");

let userHashedIp: string | null = null; // Store the user's hashed IP

const EDIT_MESSAGE_MODAL_ID = "edit-message-modal";

const EDIT_MESSAGE_MODAL_HTML = `
    <div id="edit-message-container">
        <input type="hidden" id="edit-message-id-hidden" />

        <label for="edit-user-info">Editing message from:</label>
        <input type="text" id="edit-user-info" disabled>

        <label for="edit-message-input">Message:</label>
        <textarea id="edit-message-input"></textarea>

        <div id="edit-message-buttons">
        <button id="edit-message-btn" type="button">Edit</button>
        <button id="cancel-edit-btn" type="button">Cancel</button>
        </div>
    </div>
`;

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

function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Fetch user's hashed IP on load
const fetchUserHashedIp = async (): Promise<void> => {
    try {
        const response = await fetch(GET_IP_HASH_URL);
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
};

// Enhance chat messages with edit/delete buttons
const enhanceMessages = (): void => {
    const sessionToken = window.sessionToken;
    if (!sessionToken) return;
    // Convert session token to an integer
    const sessionTokenInt = BigInt(`0x${sessionToken}`);

    document.querySelectorAll(".chat-message").forEach((messageDiv) => {
        // Extract msgId from the hidden msgId span inside the messageDiv
        const msgIdSpan = messageDiv.querySelector(".chat-msg-id");
        if (!msgIdSpan) return;

        let rawMsgId = msgIdSpan.textContent!.replace("ID: ", "").trim();
        if (!rawMsgId) return;

        // Convert msgId to a BigInt for calculations
        const msgId = BigInt(rawMsgId);
        const residue = msgId % sessionTokenInt;
        // Ensure the msgId is a multiple of the session token
        if (residue !== BigInt(0)) return;
        console.log("✨ Enhancing message:", msgId.toString());

        // Avoid duplicating buttons if they already exist
        if (messageDiv.querySelector(".chat-actions")) return;

        const actionSpan = document.createElement("span");
        actionSpan.classList.add("chat-actions");

        const editButton = document.createElement("span");
        editButton.innerHTML = " ✏️";
        editButton.classList.add("chat-action");
        editButton.title = "Edit Message";
        editButton.style.cursor = "pointer";
        editButton.onclick = () => openEditModal(messageDiv);

        const deleteButton = document.createElement("span");
        deleteButton.innerHTML = " ❌";
        deleteButton.classList.add("chat-action");
        deleteButton.title = "Delete Message";
        deleteButton.style.cursor = "pointer";
        deleteButton.onclick = () => deleteMessage(rawMsgId);

        actionSpan.appendChild(editButton);
        actionSpan.appendChild(deleteButton);

        // Append action buttons to the chat-header div instead of the main message div
        const chatHeaderDiv = messageDiv.querySelector(".chat-header");
        if (chatHeaderDiv) {
            chatHeaderDiv.appendChild(actionSpan);
        }
    });
};

// Fetch user IP on script load and enhance messages after chat updates
async function initialiseChat(): Promise<void> {
    await fetchUserHashedIp();
    document.addEventListener("chatUpdated", enhanceMessages);
}

initialiseChat().then(() => console.log("🚀 Chat enhancements initialised."));

/**
 * @param {Element} messageDiv - The chat message element to edit.
 * @returns {Promise<void>} This function opens a modal dialog for editing a chat message. It first checks if the modal already exists to prevent duplicates. If not, it creates an overlay and a modal container, fetches the modal content from "editMessage.html", and populates the modal fields with the current message data (text, message ID, user info). The function also sets up event listeners to close the modal when clicking outside of it or pressing the Escape key. This allows users to edit their messages in a user-friendly interface while ensuring that only one modal can be open at a time.
 */
async function openEditModal(messageDiv: Element): Promise<void> {
    editMessageModal.open();
    populateModalFields(messageDiv);
}

function closeEditModal(): void {
    editMessageModal.close();
}

async function editMessage(): Promise<void> {
    const sessionToken = window.sessionToken;
    // { msgId, sessionToken, ip, newMessage }
    const msgId = (document.getElementById("edit-message-id-hidden") as HTMLInputElement | null)?.value || "";
    const newMessage = (document.getElementById("edit-message-input") as HTMLInputElement | HTMLTextAreaElement | null)
        ?.value || "";

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

    const request = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    };
    void request;

    const response = await fetch(`${CHAT_SERVER}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error(`❌ Server error: ${response.status} ${response.statusText}`);
    console.log("✅ Message edited successfully.");
    closeEditModal();
}

/**
 * @param {Element} messageDiv - The chat message element being edited.
 * @returns {void} This function populates the fields of the edit message modal with the current data from the specified chat message element. It extracts the message text, message ID, and user information (nickname and user ID) from the messageDiv and fills the corresponding input fields in the modal. Additionally, it ensures that the modal uses the same CSS stylesheet as the main page for consistent styling. This allows users to see the existing message content and their information when they open the edit modal, providing a seamless editing experience.
 */
function populateModalFields(messageDiv: Element): void {
    const modal = document.getElementById("edit-message-modal");
    if (!modal) return;

    // Extract message data
    const messageText = messageDiv.querySelector(".chat-text")?.textContent || "";
    const msgId = messageDiv.querySelector(".chat-msg-id")?.textContent!.replace("ID: ", "").trim() || "";
    const userNick = messageDiv.querySelector(".chat-nick")?.textContent!.split(" - ")[0] || "";
    const userId = messageDiv.querySelector(".chat-nick")?.textContent!.match(/\((0x[a-f0-9]+)\)/)?.[1] || "";

    // Populate modal fields
    const messageInput = modal.querySelector<HTMLInputElement | HTMLTextAreaElement>("#edit-message-input");
    const messageIdField = modal.querySelector<HTMLElement>("#edit-message-id");
    const userInfoField = modal.querySelector<HTMLInputElement | HTMLTextAreaElement>("#edit-user-info");

    if (messageInput) messageInput.value = messageText;
    if (messageIdField) messageIdField.textContent = `Editing Message ID: ${msgId}`;
    const msgIdHidden = modal.querySelector<HTMLInputElement>("#edit-message-id-hidden");
    if (msgIdHidden) msgIdHidden.value = msgId;
    if (userInfoField) userInfoField.value = `${userNick} (${userId})`;
}

/**
 * @param {string} msgId - Message ID to delete.
 * @returns {Promise<void>} This function deletes a chat message by sending a request to the server with the message ID, session token, and user's hashed IP. It first finds the message element in the DOM based on the provided message ID and removes it from the chat. Then, it creates a temporary "pending deletion" message to inform the user that the deletion is in progress. The function sends a POST request to the server to delete the message, and if successful, it removes the pending message. If an error occurs during deletion, it restores the original message and displays an error message within the pending message div. This provides feedback to the user about the status of their delete action while ensuring that any issues are clearly communicated.
 */
async function deleteMessage(msgId: string): Promise<void> {
    const sessionToken = window.sessionToken;
    console.log("🗑️ Deleting message:", msgId);

    // Find the message div based on msgId
    const messageDiv = [...document.querySelectorAll(".chat-message")].find((div) =>
        div.querySelector(".chat-msg-id")?.textContent!.includes(msgId)
    );

    let messageContent = "Message is being deleted...";
    let userNick = "Unknown";

    if (messageDiv) {
        const messageTextDiv = messageDiv.querySelector(".chat-text");
        const messageNickDiv = messageDiv.querySelector(".chat-nick");

        messageContent = messageTextDiv?.textContent || messageContent;
        userNick = messageNickDiv?.textContent || userNick;

        messageDiv.remove();
    }

    // Create and append "pending deletion" message
    const pendingMessageDiv = document.createElement("div");
    pendingMessageDiv.classList.add("chat-message", "pending");
    pendingMessageDiv.innerHTML = `
        <span class="chat-header">
        <span class="chat-nick">${userNick} (Deleting...)</span>
        </span>
        <div class="chat-text">${messageContent}</div>
    `;

    document.getElementById("chatroom")!.appendChild(pendingMessageDiv);

    const body = {
        msgId,
        sessionToken,
        ip: userHashedIp
    };

    try {
        const response = await fetch(`${CHAT_SERVER}/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(`❌ Server error: ${response.status} ${response.statusText}`);

        const responseData: unknown = await response.json();
        console.log("✅ Message deleted successfully:", responseData);

        // Remove the pending deletion message after confirmation
        pendingMessageDiv.remove();
    } catch (error: unknown) {
        console.error("❌ Error deleting message:", error);

        // Restore original message if deletion fails
        if (messageDiv) {
            document.getElementById("chatroom")!.appendChild(messageDiv);
        }

        // Show error message inside the pending message div
        pendingMessageDiv.innerHTML = `
            <span class="chat-header">
                <span class="chat-nick">${userNick} (Failed to delete)</span>
            </span>
            <div class="chat-text">${messageContent}</div>
            <div class="chat-error">An error occurred while deleting the message.</div>
        `;

        // Optionally, remove the error message after a delay
        setTimeout(() => pendingMessageDiv.remove(), 5000);
    }
}

window.editMessage = editMessage;
window.closeEditModal = closeEditModal;