import type { MainJson } from "./uiFetch.ts";

/**
 * Sticks the header text into #main-header if its still empty.
 * Doesnt overwrite stuff thats already there.
 * @param {MainJson} data
 * @param {Document} root
 * @returns {Promise<void>}
 */
export async function createHeader(data: MainJson, root: Document = document): Promise<void> {
    const header = root.getElementById("main-header");
    if (!header) throw new Error("Element #main-header not found!");

    if (!header.textContent?.trim()) {
        header.textContent = data.header;
    }
}