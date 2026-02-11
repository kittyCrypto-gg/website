type ClusterizeRow = string;

type ClusterizeInstance = Readonly<{
    update: (rows: readonly ClusterizeRow[]) => void;
    destroy: (clean?: boolean) => void;
}>;

type ClusterizeCtor = new (options: Record<string, unknown>) => ClusterizeInstance;

declare global {
    interface Window {
        Clusterize?: ClusterizeCtor;
    }
}

export type ClusteriserTarget = Element | string;

export type ClusteriserOptions = Readonly<{
    rows?: readonly ClusterizeRow[];
}> & Readonly<Record<string, unknown>>;

export class Clusteriser {
    #target: Element;
    #baseId: string;
    #scrollId: string;
    #contentId: string;
    #instance: ClusterizeInstance | null;
    #options: ClusteriserOptions;

    /**
     * @param {ClusteriserTarget} target - Target container element or selector/id.
     * @param {ClusteriserOptions} options - Options passed through to Clusterize.
     * @throws {Error} If the target container cannot be found in the DOM.
     * @remarks This class provides a wrapper around Clusterize.js to facilitate virtualized rendering of large lists. It handles DOM preparation and dynamic loading of the Clusterize.js library. The target can be specified as an Element or a selector string (id with # or class with .). The init() method must be called after construction to set up the Clusterize instance, and update() can be used to change the rendered rows.
     */
    constructor(target: ClusteriserTarget, options: ClusteriserOptions = {}) {
        const resolvedTarget = this.#getElement(target);
        if (!resolvedTarget) throw new Error("Target container not found");

        this.#target = resolvedTarget;
        this.#baseId = this.#target.id || "clusterise";
        this.#scrollId = `${this.#baseId}-scroll-area`;
        this.#contentId = `${this.#baseId}-content-area`;
        this.#options = options;
        this.#instance = null;
    }

    async init(): Promise<this> {
        this.#prepareDOM();
        await this.#loadClusterizeJS();
        this.#instance = new window.Clusterize!({
            scrollId: this.#scrollId,
            contentId: this.#contentId,
            rows: this.#options.rows || [],
            ...this.#options
        });
        return this;
    }

    /**
     * @param {readonly ClusterizeRow[]} rows - HTML row strings to render.
     * @returns {void} Updates the rendered rows in the Clusterize instance. This method should be called whenever the data changes and you want to re-render the list. It will efficiently update the DOM to reflect the new set of rows, only rendering what is visible in the scroll area.
     */
    update(rows: readonly ClusterizeRow[]): void {
        if (!this.#instance) throw new Error("Clusteriser not initialised yet");
        this.#instance.update(rows);
    }

    destroy(): void {
        if (this.#instance) {
            this.#instance.destroy(true);
            this.#instance = null;
        }
    }

    get instance(): ClusterizeInstance | null {
        return this.#instance;
    }

    /**
     * @param {ClusteriserTarget} target - Element or selector/id.
     * @returns {Element | null} The resolved DOM element corresponding to the target, or null if not found. The method supports direct Element references, id selectors (starting with #), class selectors (starting with .), and fallback to id or class if a plain string is provided.
     */
    #getElement(target: ClusteriserTarget): Element | null {
        if (target instanceof Element) return target;
        if (typeof target === "string" && target[0] === "#") return document.getElementById(target.slice(1));
        if (typeof target === "string" && target[0] === ".") return document.querySelector(target);
        if (typeof target === "string") return document.getElementById(target) || document.querySelector("." + target);
        return null;
    }

    #prepareDOM(): void {
        if (this.#target.querySelector(".clusterise-scroll")) return;

        const scrollArea = document.createElement("div");
        scrollArea.className = "clusterise-scroll";
        scrollArea.id = this.#scrollId;

        const contentArea = document.createElement("div");
        contentArea.className = "clusterise-content";
        contentArea.id = this.#contentId;

        while (this.#target.firstChild) contentArea.appendChild(this.#target.firstChild);
        scrollArea.appendChild(contentArea);
        this.#target.appendChild(scrollArea);
        this.#target.classList.add("clusterise");
    }

    #loadClusterizeJS(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (window.Clusterize) return resolve();
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/gh/NeXTs/Clusterize.js@master/clusterize.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Clusterize.js"));
            document.head.appendChild(script);
        });
    }
}