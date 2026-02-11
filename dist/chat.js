import { Clusteriser } from "./clusterise.js";

const CHAT_SERVER = "https://srv.kittycrypto.gg/chat";
const CHAT_STREAM_URL = "https://srv.kittycrypto.gg/chat/stream";
const SESSION_TOKEN_URL = "https://srv.kittycrypto.gg/session-token";
const SESSION_REREGISTER_URL = "https://srv.kittycrypto.gg/session-token/reregister";

const chatroom = document.getElementById("chatroom");
const nicknameInput = document.getElementById("nickname");
const messageInput = document.getElementById("message");
const sendButton = document.getElementById("send-button");

let sessionToken = null;
let eventSource = null; // Track SSE connection
let reconnecting = false;

nicknameInput.addEventListener("input", () => {
  setChatCookie("nickname", nicknameInput.value.trim());
});

function closeEventSource() {
  if (!eventSource) return;
  eventSource.close();
  eventSource = null;
}

async function attemptReconnect(retryMS = 3000) {
  if (reconnecting) return;
  reconnecting = true;

  const retry = () => {
    reconnecting = false;
    setTimeout(attemptReconnect, retryMS);
  };

  try {
    const token = typeof sessionToken === "string" ? sessionToken : "";

    if (!token) {
      reconnecting = false;
      fetchSessionToken();
      return;
    }

    let res;
    try {
      res = await fetch(SESSION_REREGISTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: token })
      });
    } catch {
      retry(); // server offline
      return;
    }

    console.log("🔁 reregister status:", res.status);

    if (res.status === 200) {
      reconnecting = false;
      connectToChatStream();
      return;
    }

    if (res.status === 403) {
      reconnecting = false;
      fetchSessionToken(); // expired, get a new one
      return;
    }

    // 503 or anything else: retry forever
    retry();
  } catch {
    retry();
  }
}

function updateClusterisedChat() {
  if (!chatClusteriser) return;
  const rows = Array.from(chatroom.querySelectorAll('.chat-message')).map(el => el.outerHTML);
  chatClusteriser.update(rows);
}

// Utility: Get Cookie
function getChatCookie(name) {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

// Utility: Set Cookie (expires in 1 year) 
function setChatCookie(name, value, days = 365) {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/; SameSite=Lax`;
}

// Load Nickname from Cookie 
function loadNickname() {
  const savedNick = getChatCookie("nickname");
  if (savedNick) {
    nicknameInput.value = savedNick;
  }
}

// Fetch Session Token 
async function fetchSessionToken() {
  try {
    const response = await fetch(SESSION_TOKEN_URL);
    if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);

    const data = await response.json();
    sessionToken = data.sessionToken;
    window.sessionToken = sessionToken;
    console.log("🔑 Session Token received:", sessionToken);

    // Connect to SSE once session token is received
    connectToChatStream();
  } catch (error) {
    console.error("❌ Error fetching session token:", error);
  }
}

// Seeded PRNG (Mulberry32) 
function seededRandom(seed) {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // Scales to [0, 1)
}

// Connect to SSE for Real-Time Chat Updates
function connectToChatStream() {
  if (!sessionToken) return;

  if (eventSource) {
    console.log("⚠️ SSE connection already exists, closing old connection...");
    closeEventSource();
  }

  console.log("🔄 Attempting to connect to chat stream...");

  // Use query parameter for token since EventSource does not support headers
  eventSource = new EventSource(`${CHAT_STREAM_URL}?token=${sessionToken}`);

  eventSource.onopen = () => {
    console.log("✅ Successfully connected to chat stream.");
  };

  eventSource.onmessage = (event) => {
    try {
      const parsedData = JSON.parse(event.data);
      console.log("📩 Raw SSE Data:", parsedData); // Logs as an object (collapsible)
    } catch (error) {
      console.error("❌ Error parsing chat update:", error, "\n📩 Raw data received:", event.data);
    }


    try {
      const messages = JSON.parse(event.data);
      displayChat(messages);
    } catch (error) {
      console.error("❌ Error parsing chat update:", error, "\n📩 Raw data received:", event.data);
    }
  };

  eventSource.onerror = () => {
    console.error("❌ Connection to chat stream lost. Retrying...");
    closeEventSource();
    attemptReconnect(); // Start reconnection attempts every 3 seconds
  };
}

export async function fetchUserIP() {
  try {
    const response = await fetch("https://srv.kittycrypto.gg/get-ip");
    if (!response.ok) throw new Error(`Failed to fetch IP: ${response.status}`);

    const data = await response.json();
    console.log(`🌍 User IP: ${data.ip}`);
    window.ipAddress = data.ip;
    return data.ip;
  } catch (error) {
    console.error("❌ Error fetching IP:", error);
    return null;
  }
};

// Sends a chat message
async function sendMessage() {
  const nick = nicknameInput.value.trim();
  const msg = messageInput.value.trim();

  if (!nick || !msg) {
    alert("Please enter a nickname and a message.");
    return;
  }

  if (!sessionToken) {
    alert("Session token is missing. Please refresh the page.");
    return;
  }

  setChatCookie("nickname", nick);

  console.log("📡 Fetching IP address...");
  const userIp = await fetchUserIP();
  if (!userIp) {
    alert("❌ Unable to retrieve IP. Please try again.");
    return;
  }

  // Create a unique temporary ID for the pending message
  const tempId = `pending-${Date.now()}`;

  // Inject the pending message into the chatroom
  const pendingMessage = {
    nick,
    id: tempId,
    msg,
    timestamp: new Date().toISOString(),
    msgId: "0",
    pending: true,
  };

  displayChat([pendingMessage], true); // Display it as pending

  const chatRequest = {
    chatRequest: {
      nick,
      msg,
      ip: userIp,
      sessionToken
    }
  };

  console.log("📡 Sending chat message:", chatRequest);

  try {
    const response = await fetch(CHAT_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatRequest)
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status} ${response.statusText}`);
    }

    console.log("✅ Message sent successfully.");
    messageInput.value = "";

  } catch (error) {
    console.error("❌ Error sending message:", error);
    alert(`Failed to send message: ${error.message}`);

    // Remove the pending message on failure
    removePendingMessage(tempId);
  }
}

// Displays Chat Messages
async function displayChat(messages, isLocalUpdate = false) {
  if (!isLocalUpdate) {
    document.querySelectorAll('.chat-message.pending').forEach(el => el.remove());
    chatroom.innerHTML = '';
  }

  messages.forEach(msgObj => {
    const {
      nick, id, msg, timestamp,
      msgId, pending = false, edited = false
    } = msgObj;

    const colour = `hsl(${parseInt(id, 16) % 360}, 61%, 51%)`;
    const formattedDate = timestamp.replace('T', ' ').slice(0, 19).replace(/-/g, '.');

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('chat-message');
    if (pending) messageDiv.classList.add('pending');

    const headerDiv = document.createElement('div');
    headerDiv.classList.add('chat-header');

    const nickSpan = document.createElement('span');
    nickSpan.classList.add('chat-nick');
    nickSpan.style.color = colour;
    nickSpan.textContent = `${nick} - (${id}):`;
    headerDiv.appendChild(nickSpan);

    const timeRow = document.createElement('div');
    timeRow.classList.add('chat-timestamp');
    timeRow.style.display = 'flex';
    timeRow.style.alignItems = 'center';

    if (edited) {
      const editIcon = document.createElement('span');
      editIcon.textContent = '📝';
      editIcon.classList.add('edited-flag');
      timeRow.appendChild(editIcon);
    }

    const dateSpan = document.createElement('span');
    dateSpan.textContent = formattedDate;
    timeRow.appendChild(dateSpan);

    const msgIdSpan = document.createElement('span');
    msgIdSpan.classList.add('chat-msg-id');
    msgIdSpan.textContent = `ID: ${msgId}`;

    const textDiv = document.createElement('div');
    textDiv.classList.add('chat-text');
    textDiv.textContent = msg;

    messageDiv.appendChild(headerDiv);
    messageDiv.appendChild(timeRow);
    messageDiv.appendChild(msgIdSpan);
    messageDiv.appendChild(textDiv);
    chatroom.appendChild(messageDiv);
  });

  requestAnimationFrame(() => {
    chatroom.scrollTop = chatroom.scrollHeight;
  });

  document.dispatchEvent(new Event('chatUpdated'));
  console.log(`Chat updated with ${messages.length} new messages.`);
  updateClusterisedChat();
}

// Remove pending message on failure
function removePendingMessage(tempId) {
  const pendingMessage = document.querySelector(`.chat-message[data-id="${tempId}"]`);
  if (pendingMessage) pendingMessage.remove();
}

// Attach Event Listeners 
sendButton.addEventListener("click", sendMessage);
messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage();
});

let chatClusteriser = null;
(async () => {
  chatClusteriser = new Clusteriser(chatroom);
  await chatClusteriser.init();
  updateClusterisedChat(); // Optionally, call after init to set initial rows
})();

document.addEventListener("DOMContentLoaded", function () {
  window.scrollTo(0, document.body.scrollHeight);
});

loadNickname();
fetchSessionToken();

