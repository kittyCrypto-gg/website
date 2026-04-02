import type { MainJson } from "./uiFetch.ts";

/**
 * @param {MainJson} data UI data.
 * @param {Document} [root=document] Document to operate on.
 * @returns {Promise<void>} Resolves after footer creation.
 */
export async function createFooter(data: MainJson, root: Document = document): Promise<void> {
    const footer = root.getElementById("main-footer");
    if (!footer) throw new Error("Element #main-footer not found!");

    const currentYear = new Date().getFullYear();
    footer.textContent = data.footer.replace("${year}", String(currentYear));
}