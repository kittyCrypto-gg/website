import * as helpers from "./helpers.ts";

const pendByUrl = new Map<string, Promise<HTMLScriptElement>>();
const LD_ATTR = "data-script-loaded";

type Attrs = Readonly<Record<string, string>>;

type LoadScriptOpts = Readonly<{
    retries?: number;
    asModule?: boolean;
    attrs?: Attrs;
}>;

type TagOpts = Readonly<{
    asModule: boolean;
    attrs: Attrs | null;
}>;

/**
 * Loads a script into <head>, or reuses the one already there.
 * Also keeps duplicate callers from all racing each other like idiots.
 * @param {string} url
 * @param {LoadScriptOpts} opts
 * @returns {Promise<HTMLScriptElement>}
 */
export async function loadScript(url: string, opts: LoadScriptOpts = {}): Promise<HTMLScriptElement> {
    const src = typeof url === "string" ? url.trim() : "";
    if (!src) throw new Error("loadScrpt: url must be a non-empty string");

    const pend = pendByUrl.get(src);
    if (pend) return await pend;

    const retries = typeof opts.retries === "number" ? opts.retries : -1;
    const asModule = opts.asModule === true;
    const attrs = helpers.isRecord(opts.attrs) ? (opts.attrs as Attrs) : null;

    const run = (async (): Promise<HTMLScriptElement> => {
        const tag = getTag(src, { asModule, attrs });
        await waitHead(tag, retries);
        await waitLoad(tag, src);
        return tag;
    })();

    pendByUrl.set(src, run);

    try {
        return await run;
    } finally {
        pendByUrl.delete(src);
    }
}

/**
 * Gets the script tag for this src, or makes one if needed.
 * Then makes sure it is sitting in <head>.
 * @param {string} src
 * @param {TagOpts} opts
 * @returns {HTMLScriptElement}
 */
function getTag(src: string, opts: TagOpts): HTMLScriptElement {
    const tag = findTag(src) || mkTag(src);

    if (opts.asModule) tag.type = "module";
    else tag.async = true;

    if (opts.attrs) setAttrs(tag, opts.attrs);
    if (!tag.parentNode) document.head.appendChild(tag);

    return tag;
}

/**
 * Looks for an existing script tag with this src.
 * @param {string} src
 * @returns {HTMLScriptElement | null}
 */
function findTag(src: string): HTMLScriptElement | null {
    const tags = document.getElementsByTagName("script");

    for (let i = 0; i < tags.length; i += 1) {
        const tag = tags[i];
        if (tag.src === src || tag.getAttribute("src") === src) return tag;
    }

    return null;
}

/**
 * Makes a plain script tag with the given src.
 * no drama.
 * @param {string} src
 * @returns {HTMLScriptElement}
 */
function mkTag(src: string): HTMLScriptElement {
    const tag = document.createElement("script");
    tag.src = src;
    return tag;
}

/**
 * Applies extra attrs onto the tag.
 * Skips blank values and anything not string-ish.
 * @param {HTMLScriptElement} tag
 * @param {Attrs} attrs
 * @returns {void}
 */
function setAttrs(tag: HTMLScriptElement, attrs: Attrs): void {
    for (const key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;

        const value = attrs[key];
        if (typeof value !== "string") continue;

        const trimmed = value.trim();
        if (!trimmed) continue;

        tag.setAttribute(key, trimmed);
    }
}

/**
 * Waits until the tag is actually in <head>.
 * Negative retries means just keep waiting.
 * @param {HTMLScriptElement} tag
 * @param {number} retries
 * @returns {Promise<void>}
 */
async function waitHead(tag: HTMLScriptElement, retries: number): Promise<void> {
    const inHead = (): boolean => tag.isConnected && document.head.contains(tag);
    if (inHead()) return;

    for (let tries = 0; retries < 0 || tries <= retries; tries += 1) {
        await helpers.nextFrame();
        if (inHead()) return;
    }

    throw new Error(`loadHeadScrpt: script was not inserted after ${retries} retries`);
}

/**
 * Waits for the script to finish loading.
 * If we already marked it as loaded, this just bails out straight away.
 * @param {HTMLScriptElement} tag
 * @param {string} src
 * @returns {Promise<void>}
 */
async function waitLoad(tag: HTMLScriptElement, src: string): Promise<void> {
    if (tag.getAttribute(LD_ATTR) === "1") return;

    await new Promise<void>((resolve, reject) => {
        /**
         * Removes the temp listeners.
         * @returns {void}
         */
        const tidy = (): void => {
            tag.removeEventListener("load", onLoad);
            tag.removeEventListener("error", onErr);
        };

        /**
         * Marks the tag as loaded and resolves.
         * @returns {void}
         */
        const onLoad = (): void => {
            tidy();
            tag.setAttribute(LD_ATTR, "1");
            resolve();
        };

        /**
         * Rejects when the script load falls over.
         * @returns {void}
         */
        const onErr = (): void => {
            tidy();
            reject(new Error(`loadHeadScrpt: failed to load ${src}`));
        };

        tag.addEventListener("load", onLoad, { once: true });
        tag.addEventListener("error", onErr, { once: true });

        if (tag.getAttribute(LD_ATTR) !== "1") return;

        tidy();
        resolve();
    });
}