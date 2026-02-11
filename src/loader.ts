const urlPending = new Map<string, Promise<HTMLScriptElement>>();
const LOADED_ATTR = "data-script-loaded";

type ScriptAttrs = Readonly<Record<string, string>>;

type LoadScriptOpts = Readonly<{
    retries?: number;
    asModule?: boolean;
    attrs?: ScriptAttrs;
}>;

/**
 * @param {string} url - Script URL to load.
 * @param {LoadScriptOpts} opts - Options (retries, module mode, extra attributes).
 * @returns {Promise<HTMLScriptElement>} Promise that resolves to the loaded script element. This function manages the loading of external JavaScript files by creating or reusing script tags in the document head. It handles multiple concurrent requests for the same URL by maintaining a map of pending promises, ensuring that only one script tag is created per URL. The function also supports options for retrying the loading process, treating the script as a module, and applying additional attributes to the script tag. It returns a promise that resolves when the script is successfully loaded or rejects if it fails to load after the specified retries.
 */
export async function loadScript(url: string, opts: LoadScriptOpts = {}): Promise<HTMLScriptElement> {
    const src = typeof url === "string" ? url.trim() : "";
    if (!src) throw new Error("loadScrpt: url must be a non-empty string");

    const pending = urlPending.get(src);
    if (pending) return await pending;

    const retries = typeof opts.retries === "number" ? opts.retries : -1;
    const asModule = opts.asModule === true;
    const attrs = isObj(opts.attrs) ? (opts.attrs as ScriptAttrs) : null;

    const run = (async (): Promise<HTMLScriptElement> => {
        const tag = scrptTaginHead(src, { asModule, attrs });
        await dontRush(tag, retries);
        await waitForIt(tag, src);
        return tag;
    })();

    urlPending.set(src, run);

    try {
        return await run;
    } finally {
        urlPending.delete(src);
    }
}

type ScriptTagOpts = Readonly<{
    asModule: boolean;
    attrs: ScriptAttrs | null;
}>;

/**
 * @param {string} src - Script URL.
 * @param {ScriptTagOpts} param1 - Options for tag creation.
 * @returns {HTMLScriptElement} The created or existing script element.
 */
function scrptTaginHead(src: string, { asModule, attrs }: ScriptTagOpts): HTMLScriptElement {
    const tag = whereTag(src) || makeTag(src);

    if (asModule) tag.type = "module";
    else tag.async = true;

    if (attrs) attrApply(tag, attrs);

    if (!tag.parentNode) document.head.appendChild(tag);

    return tag;
}

/**
 * @param {string} src - Script URL.
 * @returns {HTMLScriptElement | null} The existing script element with the given src, or null if not found.
 */
function whereTag(src: string): HTMLScriptElement | null {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i += 1) {
        const s = scripts[i];
        if (s.src === src || s.getAttribute("src") === src) return s;
    }
    return null;
}

/**
 * @param {string} src - Script URL.
 */
function makeTag(src: string): HTMLScriptElement {
    const s = document.createElement("script");
    s.src = src;
    return s;
}

/**
 * @param {HTMLScriptElement} tag - Script element.
 * @param {ScriptAttrs} attrs - Attributes to apply.
 * @returns {void} This function applies a set of attributes to a given HTMLScriptElement. It iterates over the provided attributes object, checks for own properties, ensures the attribute values are strings, trims them, and sets them on the script element if they are non-empty. This is useful for dynamically adding attributes to script tags before they are added to the document.
 */
function attrApply(tag: HTMLScriptElement, attrs: ScriptAttrs): void {
    for (const key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        const value = attrs[key];
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed) tag.setAttribute(key, trimmed);
    }
}

/**
 * @param {HTMLScriptElement} tag - Script element.
 * @param {number} retries - Number of retries; < 0 means forever.
 * @returns {Promise<void>} This function waits for a script element to be present in the document head, retrying a specified number of times if necessary. It checks if the script tag is already connected to the document head, and if not, it waits for the next animation frame and checks again. This process continues until the script tag is found in the head or the maximum number of retries is reached. If the script tag is not found after exhausting the retries, it throws an error. This is useful for ensuring that a script tag has been properly added to the document before attempting to load or interact with it.
 */
async function dontRush(tag: HTMLScriptElement, retries: number): Promise<void> {
    const inHead = (): boolean => tag.isConnected && document.head.contains(tag);

    if (inHead()) return;

    for (let tries = 0; retries < 0 || tries <= retries; tries += 1) {
        await nextFrame();
        if (inHead()) return;
    }

    throw new Error(`loadHeadScrpt: script was not inserted after ${retries} retries`);
}

/**
 * @param {HTMLScriptElement} tag - Script element.
 * @param {string} src - Script URL.
 * @returns {Promise<void>} This function waits for a script element to load by listening for "load" and "error" events. It first checks if the script has already been marked as loaded using a custom attribute; if so, it resolves immediately. Otherwise, it sets up event listeners for the "load" and "error" events on the script tag. If the script loads successfully, it marks it as loaded and resolves the promise. If an error occurs during loading, it rejects the promise with an error message. The function also includes a cleanup mechanism to remove event listeners after they are triggered or if the script is already loaded, ensuring that resources are managed efficiently.
 */
async function waitForIt(tag: HTMLScriptElement, src: string): Promise<void> {
    if (tag.getAttribute(LOADED_ATTR) === "1") return;

    await new Promise<void>((resolve, reject) => {
        const tidyUp = (): void => {
            tag.removeEventListener("load", onLoad);
            tag.removeEventListener("error", onErr);
        };

        const onLoad = (): void => {
            tidyUp();
            tag.setAttribute(LOADED_ATTR, "1");
            resolve();
        };

        const onErr = (): void => {
            tidyUp();
            reject(new Error(`loadHeadScrpt: failed to load ${src}`));
        };

        tag.addEventListener("load", onLoad, { once: true });
        tag.addEventListener("error", onErr, { once: true });

        if (tag.getAttribute(LOADED_ATTR) === "1") {
            tidyUp();
            resolve();
        }
    });
}

/**
 * @param {unknown} v - Value to test.
 * @returns {v is Record<string, unknown>} True if the value is a non-null object that is not an array. This type guard function checks if the provided value is an object by verifying that it is not null, has a type of "object", and is not an array. This is useful for ensuring that a value can be safely treated as an object with key-value pairs, which is often necessary when working with dynamic data structures or when validating input before processing it as an object.
 */
function isObj(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

async function nextFrame(): Promise<void> {
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
}