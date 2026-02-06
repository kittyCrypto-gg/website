function escapeIdForQuery(id) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function")
        return CSS.escape(id);

    return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function removeExistingById(id, root = document) {
    if (!id || !root) return;
    const safe = escapeIdForQuery(id);
    root.querySelectorAll(`#${safe}`).forEach(el => el.remove());
}

export function recreateSingleton(id, createEl, root = document) {
    removeExistingById(id, root);
    const el = createEl();
    el.id = id;
    return el;
}