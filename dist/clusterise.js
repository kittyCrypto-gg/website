export class Clusteriser {
    #target;
    #baseId;
    #scrollId;
    #contentId;
    #instance;
    #options;

    constructor(target, options = {}) {
        this.#target = this.#getElement(target);
        if (!this.#target) throw new Error("Target container not found");
        this.#baseId = this.#target.id || 'clusterise';
        this.#scrollId = `${this.#baseId}-scroll-area`;
        this.#contentId = `${this.#baseId}-content-area`;
        this.#options = options;
        this.#instance = null;
    }

    async init() {
        this.#prepareDOM();
        await this.#loadClusterizeJS();
        this.#instance = new window.Clusterize({
            scrollId: this.#scrollId,
            contentId: this.#contentId,
            rows: this.#options.rows || [],
            ...this.#options
        });
        return this;
    }

    update(rows) {
        if (!this.#instance) throw new Error("Clusteriser not initialised yet");
        this.#instance.update(rows);
    }

    destroy() {
        if (this.#instance) {
            this.#instance.destroy(true);
            this.#instance = null;
        }
    }

    get instance() {
        return this.#instance;
    }

    // --- Private methods ---

    #getElement(target) {
        if (target instanceof Element) return target;
        if (typeof target === 'string' && target[0] === '#') return document.getElementById(target.slice(1));
        if (typeof target === 'string' && target[0] === '.') return document.querySelector(target);
        if (typeof target === 'string') return document.getElementById(target) || document.querySelector('.' + target);
        return null;
    }

    #prepareDOM() {
        if (this.#target.querySelector('.clusterise-scroll')) return;

        const scrollArea = document.createElement('div');
        scrollArea.className = 'clusterise-scroll';
        scrollArea.id = this.#scrollId;

        const contentArea = document.createElement('div');
        contentArea.className = 'clusterise-content';
        contentArea.id = this.#contentId;

        while (this.#target.firstChild) contentArea.appendChild(this.#target.firstChild);
        scrollArea.appendChild(contentArea);
        this.#target.appendChild(scrollArea);
        this.#target.classList.add('clusterise');
    }

    #loadClusterizeJS() {
        return new Promise((resolve, reject) => {
            if (window.Clusterize) return resolve();
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/gh/NeXTs/Clusterize.js@master/clusterize.js";
            script.onload = () => resolve();
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}  