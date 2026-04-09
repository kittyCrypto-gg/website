import * as helpers from "./helpers";

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
    #initialised: boolean;

    constructor(target: ClusteriserTarget, options: ClusteriserOptions = {}) {
        const resolvedTarget = this.#getElement(target);
        if (!resolvedTarget) throw new Error("Target container not found");

        this.#target = resolvedTarget;
        this.#baseId = this.#target.id || "clusterize";
        this.#scrollId = `${this.#baseId}-scroll-area`;
        this.#contentId = `${this.#baseId}-content-area`;
        this.#options = options;
        this.#instance = null;
        this.#initialised = false;
    }

    async init(): Promise<this> {
        if (this.#initialised) return this;

        await this.#loadClusterizeJS();

        const Clusterize = window.Clusterize;
        if (!Clusterize) {
            throw new Error("Clusterize.js loaded but window.Clusterize is unavailable");
        }

        this.#instance = new Clusterize({
            scrollId: this.#scrollId,
            contentId: this.#contentId,
            rows: this.#options.rows ?? [],
            ...this.#options
        });

        this.#initialised = true;
        return this;
    }

    update(rows: readonly ClusterizeRow[]): void {
        if (!this.#initialised || !this.#instance) return;
        this.#instance.update(rows);
    }

    destroy(): void {
        if (!this.#instance) return;
        this.#instance.destroy(true);
        this.#instance = null;
        this.#initialised = false;
    }

    get isInitialised(): boolean {
        return this.#initialised;
    }

    get contentId(): string {
        return this.#contentId;
    }

    get scrollId(): string {
        return this.#scrollId;
    }

    #getElement(target: ClusteriserTarget): Element | null {
        if (target instanceof Element) return target;
        if (typeof target === "string" && target[0] === "#") return document.getElementById(target.slice(1));
        if (typeof target === "string" && target[0] === ".") return document.querySelector(target);
        if (typeof target === "string") return document.getElementById(target) || document.querySelector("." + target);
        return null;
    }

    async #prepareDOM(): Promise<void> {
        await helpers.waitForDomReady();
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

    async #loadClusterizeJS(): Promise<void> {
        await this.#prepareDOM();

        if (window.Clusterize) return;

        await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/clusterize.js/clusterize.min.js";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load Clusterize.js"));
            document.head.appendChild(script);
        });
    }
}