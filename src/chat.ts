import { createChatView } from "./chat/view.ts";
import { createChatSession } from "./chat/session.ts";
import { createChatSender } from "./chat/send.ts";
import { loadNick, setCookie } from "./chat/nickname.ts";

export type { ChatMessage } from "./chat/types.ts";
export { fetchUserIP } from "./chat/send.ts";

const roomEl = document.getElementById("chatroom") as HTMLElement;
const nickEl = document.getElementById("nickname") as HTMLInputElement;
const msgEl = document.getElementById("message") as HTMLInputElement;
const sendBtn = document.getElementById("send-button") as HTMLElement;

const view = createChatView(roomEl);
const session = createChatSession((messages) => {
    void view.showChat(messages);
});
const sendMsg = createChatSender({
    nickEl,
    msgEl,
    getSessionToken: session.getSessionToken,
    showChat: view.showChat,
    rmPending: view.rmPending,
    syncCluster: view.syncCluster,
    saveNickname: (nick) => setCookie("nickname", nick)
});

nickEl.addEventListener("input", () => {
    setCookie("nickname", nickEl.value.trim());
});
sendBtn.addEventListener("click", () => {
    void sendMsg();
});
msgEl.addEventListener("keypress", (event: KeyboardEvent) => {
    if (event.key !== "Enter") return;
    void sendMsg();
});
document.addEventListener("DOMContentLoaded", () => {
    window.scrollTo(0, document.body.scrollHeight);
});

loadNick(nickEl);
void view.initCluster();
session.start();
