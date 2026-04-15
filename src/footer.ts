import type { MainJson } from "./uiFetch.ts";

/**
 * Writes the footer text into #main-footer and swaps in the current year.
 * very small thing, but keeps that placeholder rubbish out of the html.
 * @param {MainJson} data
 * @param {Document} root
 * @returns {Promise<void>}
 */
export async function createFooter(data: MainJson, root: Document = document): Promise<void> {
    const footer = root.getElementById("main-footer");
    if (!footer) throw new Error("Element #main-footer not found!");

    const currentYear = new Date().getFullYear();
    footer.textContent = data.footer.replace("${year}", String(currentYear));
}