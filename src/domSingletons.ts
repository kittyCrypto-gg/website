/**
 * @param {string} id - Element id to escape for use in a CSS selector.
 * @returns {string} A safely escaped string that can be used in CSS selectors to target an element by its id. This function checks if the CSS.escape method is available in the environment and uses it to escape the id. If CSS.escape is not available, it falls back to a manual escaping method that replaces characters that are not alphanumeric, underscores, or hyphens with a backslash followed by the character itself. This ensures that the resulting string can be safely used in query selectors without causing syntax errors or unintended matches.
 */
function escapeIdForQuery(id: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(id);
    }

    return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * @param {string} id - Element id to remove.
 * @param {ParentNode} root - Root node to search within.
 * @returns {void} This function removes all elements with the specified id from the DOM within the given root node. It first checks if the id and root are valid, then it uses a query selector to find all matching elements and removes them from the DOM. This is useful for ensuring that only one instance of an element with a particular id exists, effectively implementing a singleton pattern for DOM elements.
 */
export function removeExistingById(id: string, root: ParentNode = document): void {
    if (!id || !root) return;
    const safe = escapeIdForQuery(id);
    root.querySelectorAll<HTMLElement>(`#${safe}`).forEach((el) => el.remove());
}

/**
 * @param {string} id - Element id to create (singleton).
 * @param {() => TEl} createEl - Factory that creates the element.
 * @param {ParentNode} root - Root node to search within.
 * @returns {TEl} The newly created element with the specified id. This function first removes any existing elements with the same id within the specified root node to ensure that only one instance exists. Then it creates a new element using the provided factory function, assigns it the given id, and returns it. This approach is useful for managing unique DOM elements that should not have duplicates, such as modals, tooltips, or debug panels.
 */
export function recreateSingleton<TEl extends HTMLElement>(
    id: string,
    createEl: () => TEl,
    root: ParentNode = document
): TEl {
    removeExistingById(id, root);
    const el = createEl();
    el.id = id;
    return el;
}