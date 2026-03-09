import { removeExistingById, recreateSingleton } from "./domSingletons.js";

interface InjectionGuardApi {
    /**
     * @param {Iterable<string>} ids - Element ids to add to the guarded set.
     * @returns {void} Nothing.
     */
    apply(ids: Iterable<string>): void;

    /**
     * @param {string} id - Element id to add to the guarded set.
     * @returns {void} Nothing.
     */
    add(id: string): void;

    /**
     * @param {string} id - Element id to remove from the guarded set.
     * @returns {void} Nothing.
     */
    remove(id: string): void;

    /**
     * @param {string} id - Element id to check.
     * @returns {boolean} True when the id is guarded.
     */
    has(id: string): boolean;

    /**
     * @returns {readonly string[]} The currently guarded ids.
     */
    list(): readonly string[];

    /**
     * @param {ParentNode} root - Root node to search within.
     * @returns {void} Nothing.
     */
    enforce(root?: ParentNode): void;

    /**
     * @param {string} id - Element id to enforce as a singleton.
     * @param {ParentNode} root - Root node to search within.
     * @returns {HTMLElement | null} The kept singleton element, or null if no matching element exists.
     */
    enforceOne(id: string, root?: ParentNode): HTMLElement | null;

    /**
     * @param {string} id - Element id whose existing instances should be removed.
     * @param {ParentNode} root - Root node to search within.
     * @returns {void} Nothing.
     */
    purge(id: string, root?: ParentNode): void;

    /**
     * @template TEl
     * @param {string} id - Element id to recreate as a singleton.
     * @param {() => TEl} createEl - Factory that creates the element.
     * @param {ParentNode} root - Root node to search within.
     * @returns {TEl} The recreated singleton element.
     */
    recreate<TEl extends HTMLElement>(
        id: string,
        createEl: () => TEl,
        root?: ParentNode
    ): TEl;
}

declare global {
    interface Window {
        injectionGuard?: InjectionGuard;
    }
}

/**
 * @param {string} id - Element id to escape for use in a CSS selector.
 * @returns {string} A safely escaped id string for querySelector usage.
 */
function escapeIdForQuery(id: string): string {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(id);
    }

    return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/**
 * Small wrapper around domSingletons that only allows operations on guarded ids.
 */
export class InjectionGuard implements InjectionGuardApi {
    private readonly guardedIds = new Set<string>();

    /**
     * @param {Iterable<string>} ids - Initial ids to guard.
     */
    public constructor(ids: Iterable<string> = []) {
        this.apply(ids);
    }

    /**
     * @param {Iterable<string>} ids - Element ids to add to the guarded set.
     * @returns {void} Nothing.
     */
    public apply(ids: Iterable<string>): void {
        for (const id of ids) {
            this.add(id);
        }
    }

    /**
     * @param {string} id - Element id to add to the guarded set.
     * @returns {void} Nothing.
     */
    public add(id: string): void {
        const value = String(id || "").trim();
        if (!value) return;
        this.guardedIds.add(value);
    }

    /**
     * @param {string} id - Element id to remove from the guarded set.
     * @returns {void} Nothing.
     */
    public remove(id: string): void {
        this.guardedIds.delete(id);
    }

    /**
     * @param {string} id - Element id to check.
     * @returns {boolean} True when the id is guarded.
     */
    public has(id: string): boolean {
        return this.guardedIds.has(id);
    }

    /**
     * @returns {readonly string[]} The currently guarded ids.
     */
    public list(): readonly string[] {
        return Array.from(this.guardedIds);
    }

    /**
     * @param {ParentNode} root - Root node to search within.
     * @returns {void} Nothing.
     */
    public enforce(root: ParentNode = document): void {
        for (const id of this.guardedIds) {
            this.enforceOne(id, root);
        }
    }

    /**
     * @param {string} id - Element id to enforce as a singleton.
     * @param {ParentNode} root - Root node to search within.
     * @returns {HTMLElement | null} The kept singleton element, or null if no matching element exists.
     */
    public enforceOne(id: string, root: ParentNode = document): HTMLElement | null {
        if (!this.has(id)) return null;

        const safeId = escapeIdForQuery(id);
        const matches = Array.from(root.querySelectorAll<HTMLElement>(`#${safeId}`));

        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];

        const first = matches[0];
        const parent = first.parentNode;
        if (!parent) return first;

        const nextSibling = first.nextSibling;
        const snapshot = first.cloneNode(true) as HTMLElement;

        removeExistingById(id, root);

        const singleton = recreateSingleton(id, () => snapshot, root);

        if (nextSibling && nextSibling.parentNode === parent) {
            parent.insertBefore(singleton, nextSibling);
            return singleton;
        }

        parent.appendChild(singleton);
        return singleton;
    }

    /**
     * @param {string} id - Element id whose existing instances should be removed.
     * @param {ParentNode} root - Root node to search within.
     * @returns {void} Nothing.
     */
    public purge(id: string, root: ParentNode = document): void {
        if (!this.has(id)) return;
        removeExistingById(id, root);
    }

    /**
     * @template TEl
     * @param {string} id - Element id to recreate as a singleton.
     * @param {() => TEl} createEl - Factory that creates the element.
     * @param {ParentNode} root - Root node to search within.
     * @returns {TEl} The recreated singleton element.
     */
    public recreate<TEl extends HTMLElement>(
        id: string,
        createEl: () => TEl,
        root: ParentNode = document
    ): TEl {
        if (!this.has(id)) {
            throw new Error(`InjectionGuard cannot recreate unguarded id "${id}".`);
        }

        return recreateSingleton(id, createEl, root);
    }
}

/**
 * @param {Iterable<string>} ids - Initial ids to guard.
 * @returns {InjectionGuard} The installed global injection guard instance.
 */
export function installInjectionGuard(ids: Iterable<string> = []): InjectionGuard {
    const existing = window.injectionGuard;
    if (existing) {
        existing.apply(ids);
        return existing;
    }

    const guard = new InjectionGuard(ids);
    window.injectionGuard = guard;
    return guard;
}

/**
 * @returns {InjectionGuard} The global injection guard instance.
 */
export function getInjectionGuard(): InjectionGuard {
    return window.injectionGuard ?? installInjectionGuard();
}