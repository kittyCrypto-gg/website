window.CHAT_SERVER = window.CHAT_SERVER || "https://srv.kittycrypto.gg/chat";
window.MAIN_SERVER = window.MAIN_SERVER || "https://srv.kittycrypto.gg";
window.GET_IP_HASH_URL = window.GET_IP_HASH_URL || `${window.MAIN_SERVER}/get-ip/sha256`;
window.nicknameInput = window.nicknameInput || document.getElementById("nickname");

let userHashedIp = null; // Store the user's hashed IP

// Fetch user's hashed IP on load
const fetchUserHashedIp = async () => {
  try {
    const response = await fetch(GET_IP_HASH_URL);
    if (!response.ok) throw new Error("Failed to fetch hashed IP");
    const data = await response.json();
    userHashedIp = data.hashedIp;
    console.log("🔑 User Hashed IP:", userHashedIp);
  } catch (error) {
    console.error("❌ Error fetching hashed IP:", error);
  }
};

// Enhance chat messages with edit/delete buttons
// Enhance chat messages with edit/delete buttons
const enhanceMessages = () => {
  let sessionToken = window.sessionToken;
  if (!sessionToken) return;
  // Convert session token to an integer
  const sessionTokenInt = BigInt(`0x${sessionToken}`);

  document.querySelectorAll(".chat-message").forEach((messageDiv) => {
    // Extract msgId from the hidden msgId span inside the messageDiv
    const msgIdSpan = messageDiv.querySelector(".chat-msg-id");
    if (!msgIdSpan) return;

    let rawMsgId = msgIdSpan.textContent.replace("ID: ", "").trim();
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
async function initialiseChat() {
  await fetchUserHashedIp();
  document.addEventListener("chatUpdated", enhanceMessages);
}

initialiseChat().then(() => console.log("🚀 Chat enhancements initialised."));

async function openEditModal(messageDiv) {
  if (document.getElementById("edit-message-modal")) return;

  // Create overlay
  const overlay = document.createElement("div");
  overlay.id = "modal-overlay";

  // Create modal container
  const modal = document.createElement("div");
  modal.id = "edit-message-modal";

  // Disable scrolling on the page while modal is open
  document.body.classList.add("no-scroll");

  // Fetch modal content
  try {
    const response = await fetch("./editMessage.html");
    if (!response.ok) throw new Error("Failed to load modal content.");
    modal.innerHTML = await response.text();
  } catch (error) {
    console.error("❌ Error loading modal:", error);
    modal.innerHTML = "<p>Failed to load content.</p>";
  }

  // Append modal and overlay
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Wait for modal content to load before populating
  setTimeout(() => populateModalFields(messageDiv), 0);

  // Close modal when clicking outside
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeEditModal();
  });

  // Close modal on Escape key
  document.addEventListener("keydown", function handleEscape(event) {
    if (event.key === "Escape") {
      closeEditModal();
      document.removeEventListener("keydown", handleEscape);
    }
  });
}

function closeEditModal() {
  const overlay = document.getElementById("modal-overlay");
  if (overlay) overlay.remove();
  document.body.classList.remove("no-scroll"); // Re-enable scrolling
}

async function editMessage() {
  let sessionToken = window.sessionToken;
  // { msgId, sessionToken, ip, newMessage }
  const msgId = document.getElementById("edit-message-id-hidden")?.value || "";
  const newMessage = document.getElementById("edit-message-input")?.value || "";

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
    newMessage,
  };

  const request = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };

  const response = await fetch(`${CHAT_SERVER}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(`❌ Server error: ${response.status} ${response.statusText}`);
  console.log("✅ Message edited successfully.");
  closeEditModal();
}

function populateModalFields(messageDiv) {
  const modal = document.getElementById("edit-message-modal");
  if (!modal) return;

  // Extract message data
  const messageText = messageDiv.querySelector(".chat-text")?.textContent || "";
  const msgId = messageDiv.querySelector(".chat-msg-id")?.textContent.replace("ID: ", "").trim() || "";
  const userNick = messageDiv.querySelector(".chat-nick")?.textContent.split(" - ")[0] || "";
  const userId = messageDiv.querySelector(".chat-nick")?.textContent.match(/\((0x[a-f0-9]+)\)/)?.[1] || "";

  // Populate modal fields
  const messageInput = modal.querySelector("#edit-message-input");
  const messageIdField = modal.querySelector("#edit-message-id");
  const userInfoField = modal.querySelector("#edit-user-info");

  if (messageInput) messageInput.value = messageText;
  if (messageIdField) messageIdField.textContent = `Editing Message ID: ${msgId}`;
  const msgIdHidden = modal.querySelector("#edit-message-id-hidden");
  if (msgIdHidden) msgIdHidden.value = msgId;
  if (userInfoField) userInfoField.value = `${userNick} (${userId})`;

  // Ensure the modal uses the same CSS file as the main page
  const mainCss = document.querySelector("link[rel='stylesheet']")?.href || "";
  const modalCss = modal.querySelector("#theme-stylesheet");
  if (modalCss) modalCss.href = mainCss;
}

async function deleteMessage(msgId) {
  let sessionToken = window.sessionToken;
  console.log("🗑️ Deleting message:", msgId);

  // Find the message div based on msgId
  const messageDiv = [...document.querySelectorAll(".chat-message")].find(
    (div) => div.querySelector(".chat-msg-id")?.textContent.includes(msgId)
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

  document.getElementById("chatroom").appendChild(pendingMessageDiv);

  const body = {
    msgId,
    sessionToken,
    ip: userHashedIp,
  };

  try {
    const response = await fetch(`${CHAT_SERVER}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`❌ Server error: ${response.status} ${response.statusText}`);

    const responseData = await response.json();
    console.log("✅ Message deleted successfully:", responseData);

    // Remove the pending deletion message after confirmation
    pendingMessageDiv.remove();
  } catch (error) {
    console.error("❌ Error deleting message:", error);

    // Restore original message if deletion fails
    if (messageDiv) {
      document.getElementById("chatroom").appendChild(messageDiv);
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