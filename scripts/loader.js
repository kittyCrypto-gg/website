const urlPending = new Map();
const LOADED_ATTR = "data-script-loaded";

export async function loadScript(url, opts = {}) {
    const src = typeof url === "string" ? url.trim() : "";
    if (!src) throw new Error("loadScrpt: url must be a non-empty string");

    const pending = urlPending.get(src);
    if (pending) return await pending;

    const retries = typeof opts.retries === "number" ? opts.retries : -1;
    const asModule = opts.asModule === true;
    const attrs = isObj(opts.attrs) ? opts.attrs : null;

    const run = (async () => {
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

function scrptTaginHead(src, { asModule, attrs }) {
    const tag = whereTag(src) || makeTag(src);

    if (asModule) tag.type = "module";
    else tag.async = true;

    if (attrs) attrApply(tag, attrs);

    if (!tag.parentNode) document.head.appendChild(tag);

    return tag;
}

function whereTag(src) {
    const scripts = document.getElementsByTagName("script");
    for (let i = 0; i < scripts.length; i += 1) {
        const s = scripts[i];
        if (s.src === src || s.getAttribute("src") === src) return s;
    }
    return null;
}

function makeTag(src) {
    const s = document.createElement("script");
    s.src = src;
    return s;
}

function attrApply(tag, attrs) {
    for (const key in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
        const value = attrs[key];
        if (typeof value !== "string") continue;
        const trimmed = value.trim();
        if (trimmed) tag.setAttribute(key, trimmed);
    }
}

async function dontRush(tag, retries) {
    const inHead = () => tag.isConnected && document.head.contains(tag);

    if (inHead()) return;

    for (let tries = 0; retries < 0 || tries <= retries; tries += 1) {
        await nextFrame();
        if (inHead()) return;
    }

    throw new Error(`loadHeadScrpt: script was not inserted after ${retries} retries`);
}

async function waitForIt(tag, src) {
    if (tag.getAttribute(LOADED_ATTR) === "1") return;

    await new Promise((resolve, reject) => {
        const tidyUp = () => {
            tag.removeEventListener("load", onLoad);
            tag.removeEventListener("error", onErr);
        };

        const onLoad = () => {
            tidyUp();
            tag.setAttribute(LOADED_ATTR, "1");
            resolve();
        };

        const onErr = () => {
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

function isObj(v) {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

async function nextFrame() {
    await new Promise(r => requestAnimationFrame(r));
}