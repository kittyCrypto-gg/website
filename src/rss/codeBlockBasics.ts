import * as icons from "../icons.tsx";
import { render2Frag } from "../reactHelpers.tsx";
import { fmtCodeLang, getCodeLang, normCodeLangKey } from "./codeLanguage.ts";
import { copyText } from "./clipboard.ts";
import { moveCodeSegShareToFrame } from "./segments.ts";
import type { CodeVariant, HljsApi } from "./types.ts";

declare const hljs: HljsApi | undefined;

/**
 * Tiny text bit.
 * @param {string} lang
 * @returns {HTMLSpanElement}
 */
function mkLangTxt(lang: string): HTMLSpanElement {
    const text = document.createElement("span");

    text.className = "rss-code-lang__text";
    text.textContent = `\u00A0${fmtCodeLang(lang)}`;

    return text;
}

/**
 * Resets lang label, prob overkill.
 * @param {HTMLSpanElement} label
 * @param {string} lang
 * @returns {void}
 */
export function setLangLblTxt(label: HTMLSpanElement, lang: string): void {
    const text = label.querySelector(".rss-code-lang__text");

    if (text instanceof HTMLSpanElement) {
        text.textContent = `\u00A0${fmtCodeLang(lang)}`;
        return;
    }

    label.replaceChildren(
        render2Frag(icons.MakeCodeIcon()),
        mkLangTxt(lang)
    );
}

/**
 * Back to copy state.
 * @param {HTMLButtonElement} btn
 * @returns {void}
 */
function setCpyIco(btn: HTMLButtonElement): void {
    btn.replaceChildren(render2Frag(icons.MakeCopyIcon()));
    btn.classList.remove("rss-code-copy--done", "rss-code-copy--failed");
    btn.setAttribute("aria-label", "Copy code to clipboard");
    btn.title = "Copy code";
}

/**
 * Happy icon.
 * @param {HTMLButtonElement} btn
 * @returns {void}
 */
function setOkIco(btn: HTMLButtonElement): void {
    btn.replaceChildren(render2Frag(icons.MakeCheckIcon()));
    btn.classList.add("rss-code-copy--done");
    btn.classList.remove("rss-code-copy--failed");
    btn.setAttribute("aria-label", "Copied to clipboard");
    btn.title = "Copied";
}

/**
 * Sad copy icon thing.
 * @param {HTMLButtonElement} btn
 * @returns {void}
 */
function setBadIco(btn: HTMLButtonElement): void {
    btn.replaceChildren(render2Frag(icons.MakeCopyIcon()));
    btn.classList.add("rss-code-copy--failed");
    btn.classList.remove("rss-code-copy--done");
    btn.setAttribute("aria-label", "Copy failed");
    btn.title = "Copy failed";
}

/**
 * Little copied flash.
 * @param {HTMLButtonElement} btn
 * @param {boolean} ok
 * @returns {void}
 */
function setCpyDone(btn: HTMLButtonElement, ok: boolean): void {
    if (ok) {
        setOkIco(btn);
    } else {
        setBadIco(btn);
    }

    window.setTimeout(() => {
        btn.disabled = false;
        setCpyIco(btn);
    }, 1200);
}

/**
 * Button for stealing code from a dynamic source.
 * @param {() => string} readText
 * @returns {HTMLButtonElement}
 */
export function mkDynCpyBtn(readText: () => string): HTMLButtonElement {
    const btn = document.createElement("button");

    btn.type = "button";
    btn.className = "rss-code-copy";
    setCpyIco(btn);

    btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        btn.disabled = true;

        void copyText(readText()).then((ok) => {
            setCpyDone(btn, ok);
        });
    });

    return btn;
}

/**
 * Button for stealing code.
 * @param {HTMLElement} code
 * @returns {HTMLButtonElement}
 */
function mkCpyBtn(code: HTMLElement): HTMLButtonElement {
    return mkDynCpyBtn(() => code.textContent ?? "");
}

/**
 * Lang badge thing.
 * @param {string} lang
 * @returns {HTMLSpanElement}
 */
function mkLangLbl(lang: string): HTMLSpanElement {
    const label = document.createElement("span");

    label.className = "rss-code-lang";
    setLangLblTxt(label, lang);

    return label;
}

/**
 * Top bit for code blocks.
 * @param {HTMLElement} code
 * @returns {HTMLDivElement}
 */
export function mkCodeBar(code: HTMLElement): HTMLDivElement {
    const toolbar = document.createElement("div");

    toolbar.className = "rss-code-toolbar";
    toolbar.append(mkLangLbl(getCodeLang(code)), mkCpyBtn(code));

    return toolbar;
}

/**
 * Reads the code element inside a pre.
 * @param {HTMLPreElement} pre
 * @returns {HTMLElement | null}
 */
export function getPreCode(pre: HTMLPreElement): HTMLElement | null {
    const code = pre.querySelector("code");

    return code instanceof HTMLElement ? code : null;
}

/**
 * Turns one pre block into a switchable variant.
 * @param {HTMLPreElement} pre
 * @returns {CodeVariant | null}
 */
export function mkCodeVariant(pre: HTMLPreElement): CodeVariant | null {
    const code = getPreCode(pre);

    if (!code) {
        return null;
    }

    const lang = getCodeLang(code);

    return {
        pre,
        code,
        lang,
        langKey: normCodeLangKey(lang),
        label: fmtCodeLang(lang)
    };
}

/**
 * Gets the active code block inside a grouped code frame.
 * @param {HTMLDivElement} frame
 * @returns {HTMLElement | null}
 */
export function getActCodeVariant(frame: HTMLDivElement): HTMLElement | null {
    const active = frame.querySelector(".rss-code-variant.is-active code");

    return active instanceof HTMLElement ? active : null;
}

/**
 * Fixes old bar text.
 * @param {HTMLDivElement} frame
 * @param {HTMLElement} code
 * @returns {void}
 */
export function updCodeBar(frame: HTMLDivElement, code: HTMLElement): void {
    const label = frame.querySelector(".rss-code-lang");
    if (!(label instanceof HTMLSpanElement)) return;

    setLangLblTxt(label, getCodeLang(code));
}

/**
 * Do not let post eat this stuff.
 * @param {HTMLElement} root
 * @returns {void}
 */
export function stopPstEvts(root: HTMLElement): void {
    if (root.dataset.rssStopPropagationWired === "1") return;

    root.dataset.rssStopPropagationWired = "1";

    const stop = (ev: Event): void => {
        ev.stopPropagation();
    };

    root.addEventListener("click", stop);
    root.addEventListener("mousedown", stop);
    root.addEventListener("pointerdown", stop);
    root.addEventListener("touchstart", stop);
    root.addEventListener("keydown", stop);
}

/**
 * Wraps code if needed.
 * @param {HTMLPreElement} pre
 * @param {HTMLElement} code
 * @returns {void}
 */
export function ensCodeTls(pre: HTMLPreElement, code: HTMLElement): void {
    const parent = pre.parentElement;
    if (!parent) return;

    const currentFrame = pre.closest(".rss-code-frame");
    if (currentFrame instanceof HTMLDivElement) {
        updCodeBar(currentFrame, code);
        stopPstEvts(currentFrame);
        return;
    }

    const frame = document.createElement("div");

    frame.className = "rss-code-frame";
    frame.dataset.language = getCodeLang(code);

    moveCodeSegShareToFrame(frame, [pre]);

    parent.insertBefore(frame, pre);
    frame.append(mkCodeBar(code), pre);

    stopPstEvts(frame);
}

/**
 * Highlight once, maybe.
 * @param {HTMLElement} code
 * @returns {void}
 */
export function hglCode(code: HTMLElement): void {
    if (code.dataset.rssHighlighted === "1") return;
    if (typeof hljs === "undefined") return;

    code.dataset.rssHighlighted = "1";
    hljs.highlightElement(code);
}
