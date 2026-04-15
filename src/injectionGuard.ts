import { removeExistingById, recreateSingleton } from "./domSingletons.js";
import * as helpers from "./helpers.ts";

interface Api {
    /**
     * Adds a bunch of ids into the guarded set.
     * @param {Iterable<string>} ids
     * @returns {void}
     */
    apply(ids: Iterable<string>): void;

    /**
     * Adds one id to the guarded set.
     * @param {string} id
     * @returns {void}
     */
    add(id: string): void;

    /**
     * Removes one id from the guarded set.
     * @param {string} id
     * @returns {void}
     */
    remove(id: string): void;

    /**
     * Checks if an id is guarded.
     * @param {string} id
     * @returns {boolean}
     */
    has(id: string): boolean;

    /**
     * Lists all guarded ids.
     * @returns {readonly string[]}
     */
    list(): readonly string[];

    /**
     * Runs singleton cleanup for every guarded id.
     * @param {ParentNode} root
     * @returns {void}
     */
    enforce(root?: ParentNode): void;

    /**
     * Enforces singleton cleanup for one guarded id.
     * @param {string} id
     * @param {ParentNode} root
     * @returns {HTMLElement | null}
     */
    enforceOne(id: string, root?: ParentNode): HTMLElement | null;

    /**
     * Removes any current instances of a guarded id.
     * @param {string} id
     * @param {ParentNode} root
     * @returns {void}
     */
    purge(id: string, root?: ParentNode): void;

    /**
     * Rebuilds a guarded singleton from scratch.
     * @template TEl
     * @param {string} id
     * @param {() => TEl} createEl
     * @param {ParentNode} root
     * @returns {TEl}
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
 * Small wrapper around domSingletons that only works on ids we explicitly guard.
 * stops random callers from doing weird singleton surgery wherever they feel like.
 */
export class InjectionGuard implements Api {
    private readonly ids = new Set<string>();

    /**
     * Seeds the guard with any initial ids.
     * @param {Iterable<string>} ids
     */
    public constructor(ids: Iterable<string> = []) {
        this.apply(ids);
    }

    /**
     * Adds a bunch of ids.
     * @param {Iterable<string>} ids
     * @returns {void}
     */
    public apply(ids: Iterable<string>): void {
        for (const id of ids) {
            this.add(id);
        }
    }

    /**
     * Adds one id if it is not blank rubbish.
     * @param {string} id
     * @returns {void}
     */
    public add(id: string): void {
        const val = String(id || "").trim();
        if (!val) return;

        this.ids.add(val);
    }

    /**
     * Removes one id from the guard set.
     * @param {string} id
     * @returns {void}
     */
    public remove(id: string): void {
        this.ids.delete(id);
    }

    /**
     * Checks if an id is guarded right now.
     * @param {string} id
     * @returns {boolean}
     */
    public has(id: string): boolean {
        return this.ids.has(id);
    }

    /**
     * Lists guarded ids.
     * @returns {readonly string[]}
     */
    public list(): readonly string[] {
        return Array.from(this.ids);
    }

    /**
     * Runs singleton cleanup for every guarded id.
     * @param {ParentNode} root
     * @returns {void}
     */
    public enforce(root: ParentNode = document): void {
        for (const id of this.ids) {
            this.enforceOne(id, root);
        }
    }

    /**
     * Forces one guarded id down to a single kept element.
     * Keeps the first match and re-inserts a clean clone roughly where it was.
     * a bit fussy, but that is the point.
     * @param {string} id
     * @param {ParentNode} root
     * @returns {HTMLElement | null}
     */
    public enforceOne(id: string, root: ParentNode = document): HTMLElement | null {
        if (!this.has(id)) return null;

        const safe = helpers.escapeCssIdentifier(id);
        const hits = Array.from(root.querySelectorAll<HTMLElement>(`#${safe}`));

        if (hits.length === 0) return null;
        if (hits.length === 1) return hits[0];

        const first = hits[0];
        const parent = first.parentNode;
        if (!parent) return first;

        const next = first.nextSibling;
        const snap = first.cloneNode(true) as HTMLElement;

        removeExistingById(id, root);

        const kept = recreateSingleton(id, () => snap, root);

        if (next && next.parentNode === parent) {
            parent.insertBefore(kept, next);
            return kept;
        }

        parent.appendChild(kept);
        return kept;
    }

    /**
     * Purges a guarded id completely.
     * does nothing for unguarded ones.
     * @param {string} id
     * @param {ParentNode} root
     * @returns {void}
     */
    public purge(id: string, root: ParentNode = document): void {
        if (!this.has(id)) return;
        removeExistingById(id, root);
    }

    /**
     * Recreates one guarded singleton.
     * Throws if somebody asks for an id this guard does not own.
     * @template TEl
     * @param {string} id
     * @param {() => TEl} createEl
     * @param {ParentNode} root
     * @returns {TEl}
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
 * Installs the global guard if needed, otherwise reuses the existing one.
 * also feeds in any extra ids you pass this time round.
 * @param {Iterable<string>} ids
 * @returns {InjectionGuard}
 */
export function installInjectionGuard(ids: Iterable<string> = []): InjectionGuard {
    const ex = window.injectionGuard;
    if (ex) {
        ex.apply(ids);
        return ex;
    }

    const guard = new InjectionGuard(ids);
    window.injectionGuard = guard;
    return guard;
}

/**
 * Gets the global guard, creating it on demand if it does not exist yet.
 * @returns {InjectionGuard}
 */
export function getInjectionGuard(): InjectionGuard {
    return window.injectionGuard ?? installInjectionGuard();
}