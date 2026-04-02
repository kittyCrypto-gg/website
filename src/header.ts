import type { MainJson } from "./uiFetch.ts";

/**
 * @param {MainJson} data UI data.
 * @param {Document} [root=document] Document to operate on.
 * @returns {Promise<void>} Resolves after header creation.
 */
export async function createHeader(data: MainJson, root: Document = document): Promise<void> {
    const header = root.getElementById("main-header");
    if (!header) throw new Error("Element #main-header not found!");

    if (!header.textContent?.trim()) {
        header.textContent = data.header;
    }
}