/**
 * @param {string} id - Element id or class token to escape for use in a CSS selector.
 * @returns {string} A safely escaped string that can be used in CSS selectors to target an element by its id or class. This function checks if the CSS.escape method is available in the environment and uses it to escape the value. If CSS.escape is not available, it falls back to a manual escaping method that replaces characters that are not alphanumeric, underscores, or hyphens with a backslash followed by the character itself. This ensures that the resulting string can be safely used in query selectors without causing syntax errors or unintended matches.
 */
function escapeIdForQuery(id: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(id);
    }

    return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Resolves a singleton target by first looking for matching ids, then falling back to matching classes.
 *
 * Resolution rules:
 * - If one or more elements match the id, the first is kept and the rest are removed.
 * - If no elements match the id, class matches are checked.
 * - If one or more elements match the class, the first is kept and the rest are removed.
 * - When the kept class match does not already have an id, it is promoted to use the provided id.
 *
 * @param {string} id - Element id or class token to resolve.
 * @param {ParentNode} root - Root node to search within.
 * @returns {HTMLElement | null} The kept singleton element, or null if no matching element was found.
 */
function resolveSingletonTarget(id: string, root: ParentNode = document): HTMLElement | null {
    if (!id || !root) return null;

    const safe = escapeIdForQuery(id);

    const idMatches = Array.from(root.querySelectorAll<HTMLElement>(`#${safe}`));
    if (idMatches.length > 0) {
        const kept = idMatches[0];
        idMatches.slice(1).forEach((el) => el.remove());
        return kept;
    }

    const classMatches = Array.from(root.querySelectorAll<HTMLElement>(`.${safe}`));
    if (classMatches.length === 0) return null;

    const kept = classMatches[0];
    classMatches.slice(1).forEach((el) => el.remove());

    if (!kept.id) {
        kept.id = id;
    }

    return kept;
}

/**
 * @param {string} id - Element id to remove.
 * @param {ParentNode} root - Root node to search within.
 * @returns {void} This function removes all elements with the specified id from the DOM within the given root node. Before removal, it attempts to resolve the target as a singleton, which means it will also fall back to matching elements by class name when no id match exists. If class matches are found, it keeps the first one, removes the rest, and promotes the kept one to use the provided id when it does not already have one. After that, all elements with the resolved id are removed.
 */
export function removeExistingById(id: string, root: ParentNode = document): void {
    if (!id || !root) return;

    resolveSingletonTarget(id, root);

    const safe = escapeIdForQuery(id);
    root.querySelectorAll<HTMLElement>(`#${safe}`).forEach((el) => el.remove());
}

/**
 * @param {string} id - Element id to create (singleton).
 * @param {() => TEl} createEl - Factory that creates the element.
 * @param {ParentNode} root - Root node to search within.
 * @returns {TEl} The newly created element with the specified id. This function first removes any existing elements with the same id within the specified root node. It also supports a fallback where, if no matching id exists but elements with a matching class name do exist, the first class match is kept, the rest are removed, and the kept one is promoted to use the provided id before removal. Then it creates a new element using the provided factory function, assigns it the given id, and returns it. This approach is useful for managing unique DOM elements that should not have duplicates, such as modals, tooltips, or debug panels.
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