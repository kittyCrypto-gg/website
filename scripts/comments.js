import { drawSpiralIdenticon } from './avatar.js';

if (window.location.pathname === '/') window.history.replaceState(null, '', '/index.html');

const COMMENT_POST_URL = "https://srv.kittycrypto.gg/comment";
const COMMENT_LOAD_URL = "https://srv.kittycrypto.gg/comments/load";
const SESSION_TOKEN_URL = "https://srv.kittycrypto.gg/session-token";
const USER_IP_URL = "https://srv.kittycrypto.gg/get-ip";

let sessionToken = null;
let userIP = null;

// Get full page identifier
function getPageIdentifier() {
  const path = window.location.pathname;
  const query = window.location.search;
  return `${path}${query}`;
}

// Fetch Session Token
async function fetchSessionToken() {
  try {
    const response = await fetch(SESSION_TOKEN_URL);
    if (!response.ok) throw new Error(`Failed to fetch session token: ${response.status}`);
    const data = await response.json();
    sessionToken = data.sessionToken;
    console.log("🔑 Session Token received:", sessionToken);
  } catch (error) {
    console.error("❌ Error fetching session token:", error);
  }
}

// Fetch User IP
async function fetchUserIP() {
  try {
    const response = await fetch(USER_IP_URL);
    if (!response.ok) throw new Error(`Failed to fetch IP: ${response.status}`);
    const data = await response.json();
    console.log(`🌍 User IP: ${data.ip}`);
    window.ipAddress = data.ip;
    return data.ip;
  } catch (error) {
    console.error("❌ Error fetching IP:", error);
    return null;
  }
}

// Generate unique 8-digit comment ID
async function generateCommentId(ip, sessionToken, timestamp) {
  const randomValue = Math.floor(Math.random() * 255) + 1;
  const raw = `${ip}-${sessionToken}-${timestamp}-${randomValue}`;
  const msgUint8 = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return hashHex.substring(0, 8); // First 8 hex characters
}

// Format ISO timestamp to human-readable
function formatTimestamp(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

// Load comments for current page
async function loadCommentsForPage() {
  const currentPage = getPageIdentifier();
  try {
    const encodedPage = encodeURIComponent(currentPage);
    const response = await fetch(`${COMMENT_LOAD_URL}?page=${encodedPage}`);
    
    if (!response.ok) throw new Error(`Failed to load comments: ${response.status}`);

    const comments = await response.json();
    if (!Array.isArray(comments)) throw new Error("Invalid comment data format");

    console.log(`💬 Loaded ${comments.length} comment(s) for page "${currentPage}"`);
    return comments;
  } catch (error) {
    console.error("❌ Error loading comments:", error);
    return [];
  }
}

// await helper for dom readiness
function domReady() {
  if (document.readyState !== "loading") return Promise.resolve();

  return new Promise(resolve => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

async function renderComments() {
  await domReady();
  const comments = await loadCommentsForPage();
  const box = document.getElementById("comments-box");
  if (!box) return;

  box.innerHTML = "";
  for (const comment of comments) {
    const wrapper = document.createElement("div");
    wrapper.className = "comment-message";

    const header = document.createElement("div");
    header.className = "chat-header";

    // Avatar container
    const avatarWrapper = document.createElement("div");
    avatarWrapper.className = "avatar-container";

    // Generate SVG identicon using nick@ip
    const identicon = await drawSpiralIdenticon(`${comment.nick}@${comment.ip}`, 48);
    avatarWrapper.appendChild(identicon);

    // Nickname and timestamp
    const nickSpan = document.createElement("span");
    nickSpan.className = "chat-nick";
    nickSpan.textContent = comment.nick;

    const timestampSpan = document.createElement("span");
    timestampSpan.className = "chat-timestamp";
    timestampSpan.textContent = formatTimestamp(comment.timestamp);

    // Assemble header with avatar, nickname, and timestamp
    header.appendChild(avatarWrapper);
    header.appendChild(nickSpan);
    header.appendChild(timestampSpan);

    const message = document.createElement("span");
    message.className = "chat-text";
    message.textContent = comment.msg;

    wrapper.appendChild(header);
    wrapper.appendChild(message);
    box.appendChild(wrapper);
  }
}

// Send comment to server
async function postComment({ nick, msg, ip, sessionToken }) {
  const page = getPageIdentifier();
  const timestamp = new Date().toISOString();
  const id = await generateCommentId(ip, sessionToken, timestamp);

  const payload = { page, nick, msg, ip, sessionToken, timestamp, id };

  try {
    const response = await fetch(COMMENT_POST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData?.error || "Unknown error" };
    }

    console.log("✅ Comment posted:", payload);
    return { success: true, id };
  } catch (error) {
    console.error("❌ Error sending comment:", error);
    return { success: false, error: error.message };
  }
}

// Wire up DOM elements to post comment
function setupCommentPosting() {
  const nickInput = document.getElementById("comment-nick");
  const textarea = document.getElementById("new-comment");
  const button = document.getElementById("post-comment-button");

  if (!nickInput || !textarea || !button) return;

  // Load nickname from localStorage
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

    // Persist nickname
    localStorage.setItem("nickname", nick);

    const result = await postComment({ nick, msg, ip: userIP, sessionToken });
    if (result.success) {
      textarea.value = "";
      await renderComments();
    } else {
      alert("Error posting comment: " + result.error);
    }
  });
}

// Initial load
document.addEventListener("DOMContentLoaded", async () => {
  await fetchSessionToken();
  userIP = await fetchUserIP();
  await renderComments();
  setupCommentPosting();
});
