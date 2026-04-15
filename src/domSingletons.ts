import * as helpers from "./helpers.ts";

/**
 * Finds the one element we want to treat as the singleton.
 *
 * Roughly how it behaves:
 * - first it looks for an actual id match
 * - if it finds more than one, it keeps the first and bins the extras
 * - if there is no id match, it tries the class instead
 * - same deal there, first one stays, duplicates go away
 * - if the kept class match had no id yet, it gets upgraded to this id
 *
 * basically it tidies old messy markup before the rest of the code touches it.
 *
 * @param {string} id
 * @param {ParentNode} root
 * @returns {HTMLElement | null}
 */
function findOne(id: string, root: ParentNode = document): HTMLElement | null {
    if (!id || !root) return null;

    const safe = helpers.escapeCssIdentifier(id);

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
 * Removes anything that ends up resolving to this id.
 * It also does the class fallback cleanup first, so old duplicate rubbish gets folded down
 * before the final remove happens.
 * @param {string} id
 * @param {ParentNode} root
 * @returns {void}
 */
export function removeExistingById(id: string, root: ParentNode = document): void {
    if (!id || !root) return;

    findOne(id, root);

    const safe = helpers.escapeCssIdentifier(id);
    root.querySelectorAll<HTMLElement>(`#${safe}`).forEach((el) => el.remove());
}

/**
 * Rebuilds a singleton element from scratch.
 * Clears out anything old with the same id first, then makes a fresh one and stamps the id on it.
 * Handy for stuff like modals, floating buttons, debug panels, that kind of thing.
 * @param {string} id
 * @param {() => TEl} createEl
 * @param {ParentNode} root
 * @returns {TEl}
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