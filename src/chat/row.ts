import type { MsgLocal } from "./types.ts";

/** Creates the DOM structure for a single chat message. */
export function createChatRow(message: MsgLocal): HTMLElement {
    const {
        nick,
        id,
        msg,
        timestamp,
        msgId,
        pending = false,
        edited = false
    } = message;

    const parsedId = Number.parseInt(id, 16);
    const hue = Number.isNaN(parsedId) ? 0 : parsedId % 360;
    const colour = `hsl(${hue}, 61%, 51%)`;
    const formattedDate = timestamp.replace("T", " ").slice(0, 19).replace(/-/g, ".");

    const messageDiv = document.createElement("div");
    messageDiv.classList.add("chat-message");
    messageDiv.dataset.id = id;

    if (pending) {
        messageDiv.classList.add("pending");
    }

    const headerDiv = document.createElement("div");
    headerDiv.classList.add("chat-header");

    const nickSpan = document.createElement("span");
    nickSpan.classList.add("chat-nick");
    nickSpan.style.color = colour;
    nickSpan.textContent = `${nick} - (${id}):`;
    headerDiv.appendChild(nickSpan);

    const timeRow = document.createElement("div");
    timeRow.classList.add("chat-timestamp");
    timeRow.style.display = "flex";
    timeRow.style.alignItems = "center";

    if (edited) {
        const editIcon = document.createElement("span");
        editIcon.textContent = "📝";
        editIcon.classList.add("edited-flag");
        timeRow.appendChild(editIcon);
    }

    const dateSpan = document.createElement("span");
    dateSpan.textContent = formattedDate;
    timeRow.appendChild(dateSpan);

    const msgIdSpan = document.createElement("span");
    msgIdSpan.classList.add("chat-msg-id");
    msgIdSpan.textContent = `ID: ${msgId}`;

    const textDiv = document.createElement("div");
    textDiv.classList.add("chat-text");
    textDiv.textContent = msg;

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(timeRow);
    messageDiv.appendChild(msgIdSpan);
    messageDiv.appendChild(textDiv);
    return messageDiv;
}
