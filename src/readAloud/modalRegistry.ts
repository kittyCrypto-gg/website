import type { ReadAloudModule } from "./controller.tsx";
import { factory } from "../modals.ts";


/**
   * @param {string} html - Modal HTML.
   * @param {string} modalId - Modal id.
   * @returns {void} Nothing.
   */
export function __openCustomModal(self: ReadAloudModule, html: string, modalId: string): void {
    const existing = self.__customModalsById.get(modalId);
    if (existing) {
      existing.setContent(html).open();
      return;
    }

    const modal = factory.create({
      id: modalId,
      mode: "blocking",
      content: html
    });

    self.__customModalsById.set(modalId, modal);
    modal.open();
}

/**
   * @param {string} modalId - Modal id.
   * @returns {void} Nothing.
   */
export function __closeCustomModal(self: ReadAloudModule, modalId: string): void {
    const cached = self.__customModalsById.get(modalId);
    if (cached) {
      cached.close();
      return;
    }

    factory.getOpenSession(modalId)?.close();
}
