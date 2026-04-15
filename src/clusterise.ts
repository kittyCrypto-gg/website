import * as helpers from "./helpers";

type Row = string;

type Inst = Readonly<{
    update: (rows: readonly Row[]) => void;
    destroy: (clean?: boolean) => void;
}>;

type Ctor = new (options: Record<string, unknown>) => Inst;

declare global {
    interface Window {
        Clusterize?: Ctor;
    }
}

export type ClusteriserTarget = Element | string;

export type ClusteriserOptions = Readonly<{
    rows?: readonly Row[];
}> & Readonly<Record<string, unknown>>;

export class Clusteriser {
    #el: Element;
    #baseId: string;
    #scrollId: string;
    #contentId: string;
    #inst: Inst | null;
    #opts: ClusteriserOptions;
    #on: boolean;

    /**
     * Sets the wrapper up around a target el.
     * Throws if the target cant be found, which is fair tbh.
     * @param {ClusteriserTarget} target
     * @param {ClusteriserOptions} options
     */
    constructor(target: ClusteriserTarget, options: ClusteriserOptions = {}) {
        const resolvedTarget = this.#elFrom(target);
        if (!resolvedTarget) throw new Error("Target container not found");

        this.#el = resolvedTarget;
        this.#baseId = this.#el.id || "clusterize";
        this.#scrollId = `${this.#baseId}-scroll-area`;
        this.#contentId = `${this.#baseId}-content-area`;
        this.#opts = options;
        this.#inst = null;
        this.#on = false;
    }

    /**
     * Loads clusterize if needed and creates the instance.
     * Calling it twice is a no-op mostly.
     * @returns {Promise<this>}
     */
    async init(): Promise<this> {
        if (this.#on) return this;

        await this.#loadJs();

        const Clusterize = window.Clusterize;
        if (!Clusterize) {
            throw new Error("Clusterize.js loaded but window.Clusterize is unavailable");
        }

        this.#inst = new Clusterize({
            scrollId: this.#scrollId,
            contentId: this.#contentId,
            rows: this.#opts.rows ?? [],
            ...this.#opts
        });

        this.#on = true;
        return this;
    }

    /**
     * Pushes new rows into clusterize.
     * @param {readonly Row[]} rows
     * @returns {void}
     */
    update(rows: readonly Row[]): void {
        if (!this.#on || !this.#inst) return;
        this.#inst.update(rows);
    }

    /**
     * Tears the instance down.
     * @returns {void}
     */
    destroy(): void {
        if (!this.#inst) return;
        this.#inst.destroy(true);
        this.#inst = null;
        this.#on = false;
    }

    /**
     * Tells you if init happened.
     * @returns {boolean}
     */
    get isInitialised(): boolean {
        return this.#on;
    }

    /**
     * Content area id used by Clusterize.
     * @returns {string}
     */
    get contentId(): string {
        return this.#contentId;
    }

    /**
     * Scroll area id used by Clusterize.
     * @returns {string}
     */
    get scrollId(): string {
        return this.#scrollId;
    }

    /**
     * Resolves an element from a selector-ish input.
     * Handles #id, .class, plain id, then plain class.
     * @param {ClusteriserTarget} target
     * @returns {Element | null}
     */
    #elFrom(target: ClusteriserTarget): Element | null {
        if (target instanceof Element) return target;
        if (typeof target !== "string") return null;
        if (target[0] === "#") return document.getElementById(target.slice(1));
        if (target[0] === ".") return document.querySelector(target);

        return document.getElementById(target) || document.querySelector("." + target);
    }

    /**
     * Builds the scroll/content wrapper dom if it is not there yet.
     * @returns {Promise<void>}
     */
    async #prepDom(): Promise<void> {
        await helpers.waitForDomReady();
        if (this.#el.querySelector(".clusterise-scroll")) return;

        const scrollArea = document.createElement("div");
        scrollArea.className = "clusterise-scroll";
        scrollArea.id = this.#scrollId;

        const contentArea = document.createElement("div");
        contentArea.className = "clusterise-content";
        contentArea.id = this.#contentId;

        while (this.#el.firstChild) contentArea.appendChild(this.#el.firstChild);

        scrollArea.appendChild(contentArea);
        this.#el.appendChild(scrollArea);
        this.#el.classList.add("clusterise");
    }

    /**
     * Loads the external clusterize script once.
     * Also makes sure the dom shell exists first.
     * @returns {Promise<void>}
     */
    async #loadJs(): Promise<void> {
        await this.#prepDom();
        if (window.Clusterize) return;

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/clusterize.js/clusterize.min.js";

            /**
             * Script loaded ok.
             * @returns {void}
             */
            const onLoad = (): void => {
                resolve();
            };

            /**
             * Script load failed, rip.
             * @returns {void}
             */
            const onErr = (): void => {
                reject(new Error("Failed to load Clusterize.js"));
            };

            script.onload = onLoad;
            script.onerror = onErr;
            document.head.appendChild(script);
        });
    }
}