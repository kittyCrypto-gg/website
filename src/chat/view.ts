import { Clusteriser } from "../clusterise.ts";
import type { MsgLocal } from "./types.ts";
import { createChatRow } from "./row.ts";

/** Owns the chat's DOM, scrolling and virtualised message rows. */
export function createChatView(roomEl: HTMLElement) {
    let cluster: Clusteriser | null = null;

    /**
     * Current content root for the chat rows.
     * @returns {HTMLElement}
     */
    function getCntRoot(): HTMLElement {
        if (!cluster) return roomEl;

        const contentElement = document.getElementById(cluster.contentId);
        return contentElement instanceof HTMLElement ? contentElement : roomEl;
    }

    /**
     * Current scroll root for the chat area.
     * @returns {HTMLElement}
     */
    function getScrRoot(): HTMLElement {
        if (!cluster) return roomEl;

        const scrollElement = document.getElementById(cluster.scrollId);
        return scrollElement instanceof HTMLElement ? scrollElement : roomEl;
    }

    /**
     * Pushes current dom rows into Clusterize when its live.
     * @returns {void}
     */
    function syncCluster(): void {
        if (!cluster?.isInitialised) return;

        const contentRoot = getCntRoot();
        const rows = Array.from(contentRoot.querySelectorAll(".chat-message"))
            .map((element) => element.outerHTML);

        cluster.update(rows);
    }

    /**
     * Renders chat rows into the room.
     * local mode appends, non-local mode clears and redraws.
     * @param {readonly MsgLocal[]} messages
     * @param {boolean} isLocalUpdate
     * @returns {Promise<void>}
     */
    async function showChat(messages: readonly MsgLocal[], isLocalUpdate: boolean = false): Promise<void> {
        const contentRoot = getCntRoot();

        if (!isLocalUpdate) {
            contentRoot.querySelectorAll(".chat-message.pending").forEach((element) => element.remove());
            contentRoot.innerHTML = "";
        }

        messages.forEach((message) => {
            contentRoot.appendChild(createChatRow(message));
        });

        /**
         * Scrolls the chat to the newest row on the next frame.
         * @returns {void}
         */
        const syncScroll = (): void => {
            const scrollRoot = getScrRoot();
            scrollRoot.scrollTop = scrollRoot.scrollHeight;
        };

        requestAnimationFrame(syncScroll);

        document.dispatchEvent(new Event("chatUpdated"));
        console.log(`Chat updated with ${messages.length} new messages.`);
        syncCluster();
    }

    /**
     * Removes one optimistic pending row by temp id.
     * @param {string} tempId
     * @returns {void}
     */
    function rmPending(tempId: string): void {
        const contentRoot = getCntRoot();
        const pendingMessage = contentRoot.querySelector(`.chat-message[data-id="${tempId}"]`);
        if (!pendingMessage) return;
        pendingMessage.remove();
    }

    /**
     * Boots the clusteriser if available.
     * @returns {Promise<void>}
     */
    async function initCluster(): Promise<void> {
        try {
            cluster = new Clusteriser(roomEl);
            await cluster.init();
            syncCluster();
        } catch (error) {
            console.error("❌ Failed to initialise Clusterize:", error);
            cluster = null;
        }
    }

    return { showChat, rmPending, syncCluster, initCluster };
}
