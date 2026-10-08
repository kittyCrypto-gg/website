import * as icons from "../icons.tsx";
import { render2Frag } from "../reactHelpers.tsx";
import {
    fmtCodeLang,
    getCodeLang,
    normCodeLangKey
} from "./codeLanguage.ts";
import {
    getPreferredCodeVariantIndex,
    makeCodeGroupPreferenceKey,
    saveCodePreference
} from "./codePreferences.ts";
import { wireExternalCodeBlocks } from "./externalCode.ts";
import { moveCodeSegShareToFrame } from "./segments.ts";
import { copyText } from "./clipboard.ts";
import type {
    CodeGroupActiveOptions,
    CodeVariant,
    HljsApi
} from "./types.ts";

declare const hljs: HljsApi | undefined;

export type CodeBlockLayoutHooks = Readonly<{
    recalculateContentHeight: (content: HTMLElement) => void;
    adjustScrollHeight: () => void;
    queuePostHeight: (post: HTMLElement) => void;
}>;

let codeGroupIndex = 0;
let layoutHooks: CodeBlockLayoutHooks | null = null;

/**
 * Finds the selected variant lang key from a frame.
 * @param {HTMLDivElement} frame
 * @param {number} activeIndex
 * @returns {string | null}
 */
function getCodeChoiceLangKey(frame: HTMLDivElement, activeIndex: number): string | null {
    const input = frame.querySelector<HTMLInputElement>(
        `[data-rss-code-choice][data-rss-code-choice-index="${activeIndex}"]`
    );

    return input?.dataset.rssCodeChoiceLang ?? null;
}

/**
 * Finds the first variant index matching a language key.
 * @param {HTMLDivElement} frame
 * @param {string} langKey
 * @returns {number | null}
 */
function findCodeChoiceIndex(frame: HTMLDivElement, langKey: string): number | null {
    const inputs = Array.from(frame.querySelectorAll<HTMLInputElement>("[data-rss-code-choice]"));
    const match = inputs.find((input) => input.dataset.rssCodeChoiceLang === langKey);
    const index = Number(match?.dataset.rssCodeChoiceIndex ?? "");

    return Number.isNaN(index) ? null : index;
}

/**
 * Updates surrounding post layout after code height changes.
 * @param {HTMLDivElement} frame
 * @returns {void}
 */
function qCodeGroupLayout(frame: HTMLDivElement): void {
    const content = frame.closest(".rss-post-content");

    window.requestAnimationFrame(() => {
        if (content instanceof HTMLElement) {
            layoutHooks?.recalculateContentHeight(content);
        }

        layoutHooks?.adjustScrollHeight();
    });
}

/**
 * Selects the preferred language in all matching groups.
 * @param {HTMLDivElement} sourceFrame
 * @param {string} groupKey
 * @param {string} langKey
 * @returns {void}
 */
function syncCodeGroupPeers(sourceFrame: HTMLDivElement, groupKey: string, langKey: string): void {
    Array.from(document.querySelectorAll<HTMLDivElement>(".rss-code-frame[data-rss-code-group='1']")).forEach((frame) => {
        if (frame === sourceFrame) return;
        if (frame.dataset.rssCodeGroupPrefKey !== groupKey) return;

        const index = findCodeChoiceIndex(frame, langKey);

        if (index === null) {
            return;
        }

        setCodeGroupActive(frame, index, {
            savePreference: false,
            syncPeers: false
        });
    });
}

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
function setLangLblTxt(label: HTMLSpanElement, lang: string): void {
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
function mkDynCpyBtn(readText: () => string): HTMLButtonElement {
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
function mkCodeBar(code: HTMLElement): HTMLDivElement {
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
function getPreCode(pre: HTMLPreElement): HTMLElement | null {
    const code = pre.querySelector("code");

    return code instanceof HTMLElement ? code : null;
}

/**
 * Turns one pre block into a switchable variant.
 * @param {HTMLPreElement} pre
 * @returns {CodeVariant | null}
 */
function mkCodeVariant(pre: HTMLPreElement): CodeVariant | null {
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
 * Blank text and comments may sit between adjacent markdown code blocks.
 * @param {ChildNode} node
 * @returns {boolean}
 */
function isCodeRunGap(node: ChildNode): boolean {
    if (node.nodeType === Node.COMMENT_NODE) {
        return true;
    }

    if (node.nodeType !== Node.TEXT_NODE) {
        return false;
    }

    return (node.textContent ?? "").trim().length === 0;
}

/**
 * Collects adjacent code block runs from one parent.
 * @param {ParentNode} parent
 * @returns {HTMLPreElement[][]}
 */
function colCodeRunsFromParent(parent: ParentNode): HTMLPreElement[][] {
    const runs: HTMLPreElement[][] = [];
    let run: HTMLPreElement[] = [];

    const flush = (): void => {
        if (run.length > 1) {
            runs.push(run);
        }

        run = [];
    };

    Array.from(parent.childNodes).forEach((node) => {
        if (isCodeRunGap(node)) {
            return;
        }

        if (node instanceof HTMLPreElement && getPreCode(node) !== null && !node.closest(".rss-code-frame")) {
            run.push(node);
            return;
        }

        flush();
    });

    flush();

    return runs;
}

/**
 * Collects adjacent code block runs from a post.
 * @param {HTMLElement} root
 * @returns {HTMLPreElement[][]}
 */
function colCodeRuns(root: HTMLElement): HTMLPreElement[][] {
    const parents = new Set<ParentNode>();

    Array.from(root.querySelectorAll<HTMLPreElement>("pre")).forEach((pre) => {
        if (pre.closest(".rss-code-frame")) {
            return;
        }

        if (!pre.parentNode) {
            return;
        }

        parents.add(pre.parentNode);
    });

    return Array.from(parents).flatMap((parent) => colCodeRunsFromParent(parent));
}

/**
 * Gets the active code block inside a grouped code frame.
 * @param {HTMLDivElement} frame
 * @returns {HTMLElement | null}
 */
function getActCodeVariant(frame: HTMLDivElement): HTMLElement | null {
    const active = frame.querySelector(".rss-code-variant.is-active code");

    return active instanceof HTMLElement ? active : null;
}

/**
 * Syncs the visual state of the language radio buttons.
 * @param {HTMLDivElement} frame
 * @param {number} activeIndex
 * @returns {void}
 */
function syncCodeChoiceState(frame: HTMLDivElement, activeIndex: number): void {
    Array.from(frame.querySelectorAll<HTMLLabelElement>(".rss-code-choice")).forEach((label) => {
        const input = label.querySelector<HTMLInputElement>("[data-rss-code-choice]");
        const index = Number(input?.dataset.rssCodeChoiceIndex ?? "");

        if (Number.isNaN(index)) {
            return;
        }

        const active = index === activeIndex;

        label.dataset.on = active ? "1" : "0";

        if (input) {
            input.checked = active;
        }
    });
}

/**
 * Selects one code variant in a grouped code block.
 * @param {HTMLDivElement} frame
 * @param {number} activeIndex
 * @param {CodeGroupActiveOptions} options
 * @returns {void}
 */
function setCodeGroupActive(
    frame: HTMLDivElement,
    activeIndex: number,
    options: CodeGroupActiveOptions = {}
): void {
    const panes = Array.from(frame.querySelectorAll<HTMLDivElement>(".rss-code-variant"));
    const activeLangKey = getCodeChoiceLangKey(frame, activeIndex);
    const groupKey = frame.dataset.rssCodeGroupPrefKey ?? "";

    if (!activeLangKey) {
        return;
    }

    panes.forEach((pane) => {
        const index = Number(pane.dataset.rssCodeVariantIndex ?? "");
        const active = index === activeIndex;
        const code = pane.querySelector("code");

        pane.hidden = !active;
        pane.classList.toggle("is-active", active);
        pane.setAttribute("aria-hidden", active ? "false" : "true");

        if (active && code instanceof HTMLElement) {
            frame.dataset.language = getCodeLang(code);
            frame.dataset.rssCodeActiveLang = activeLangKey;
            hglCode(code);
        }
    });

    frame.dataset.rssCodeActiveIndex = String(activeIndex);
    syncCodeChoiceState(frame, activeIndex);
    qCodeGroupLayout(frame);

    if (options.savePreference && groupKey) {
        saveCodePreference(groupKey, activeLangKey);
    }

    if (options.syncPeers && groupKey) {
        syncCodeGroupPeers(frame, groupKey, activeLangKey);
    }
}

/**
 * Creates one radio choice for a grouped code block.
 * @param {string} groupName
 * @param {CodeVariant} variant
 * @param {number} index
 * @returns {HTMLLabelElement}
 */
function mkCodeChoice(
    groupName: string,
    variant: CodeVariant,
    index: number
): HTMLLabelElement {
    const label = document.createElement("label");
    const input = document.createElement("input");
    const dot = document.createElement("span");
    const text = document.createElement("span");

    label.className = "rss-code-choice";
    label.dataset.on = index === 0 ? "1" : "0";
    label.title = `Show ${variant.label}`;

    input.type = "radio";
    input.name = groupName;
    input.value = String(index);
    input.checked = index === 0;
    input.className = "rss-code-choice__input";
    input.dataset.rssCodeChoice = "1";
    input.dataset.rssCodeChoiceIndex = String(index);
    input.dataset.rssCodeChoiceLang = variant.langKey;
    input.setAttribute("aria-label", variant.label);

    dot.className = "rss-code-choice__dot";
    dot.setAttribute("aria-hidden", "true");

    text.className = "rss-code-choice__text";
    text.textContent = variant.label;

    input.addEventListener("change", () => {
        const frame = input.closest(".rss-code-frame");

        if (!(frame instanceof HTMLDivElement)) {
            return;
        }

        setCodeGroupActive(frame, index, {
            savePreference: true,
            syncPeers: true
        });
    });

    label.append(input, dot, text);

    return label;
}

/**
 * Builds the language switcher for a grouped code block.
 * @param {string} groupName
 * @param {readonly CodeVariant[]} variants
 * @returns {HTMLDivElement}
 */
function mkCodeSwitch(
    groupName: string,
    variants: readonly CodeVariant[]
): HTMLDivElement {
    const root = document.createElement("div");
    const icon = document.createElement("span");
    const choices = document.createElement("div");

    root.className = "rss-code-lang rss-code-lang--switch";

    icon.className = "rss-code-lang__icon";
    icon.setAttribute("aria-hidden", "true");
    icon.append(render2Frag(icons.MakeCodeIcon()));

    choices.className = "rss-code-choice-list";
    choices.setAttribute("role", "radiogroup");
    choices.setAttribute("aria-label", "Code language");

    variants.forEach((variant, index) => {
        choices.appendChild(mkCodeChoice(groupName, variant, index));
    });

    root.append(icon, choices);

    return root;
}

/**
 * Builds the toolbar for a grouped code block.
 * @param {HTMLDivElement} frame
 * @param {readonly CodeVariant[]} variants
 * @returns {HTMLDivElement}
 */
function mkCodeGroupBar(
    frame: HTMLDivElement,
    variants: readonly CodeVariant[]
): HTMLDivElement {
    const toolbar = document.createElement("div");
    const groupName = `rss-code-group-${codeGroupIndex}`;

    toolbar.className = "rss-code-toolbar rss-code-toolbar--group";
    toolbar.append(
        mkCodeSwitch(groupName, variants),
        mkDynCpyBtn(() => getActCodeVariant(frame)?.textContent ?? "")
    );

    return toolbar;
}

/**
 * Creates one switchable code variant pane.
 * @param {CodeVariant} variant
 * @param {number} index
 * @returns {HTMLDivElement}
 */
function mkCodeVariantPane(variant: CodeVariant, index: number): HTMLDivElement {
    const pane = document.createElement("div");

    pane.className = "rss-code-variant";
    pane.dataset.rssCodeVariantIndex = String(index);
    pane.dataset.rssCodeVariantLang = variant.langKey;
    pane.setAttribute("aria-hidden", index === 0 ? "false" : "true");
    pane.hidden = index !== 0;
    pane.appendChild(variant.pre);

    if (index === 0) {
        pane.classList.add("is-active");
    }

    return pane;
}

/**
 * Turns adjacent markdown code blocks into one switchable code frame.
 * @param {readonly HTMLPreElement[]} run
 * @returns {void}
 */
function mkCodeGroupFrame(run: readonly HTMLPreElement[]): void {
    const parent = run[0]?.parentElement;

    if (!parent) {
        return;
    }

    const variants = run
        .map((pre) => mkCodeVariant(pre))
        .filter((variant): variant is CodeVariant => variant !== null);

    if (variants.length < 2) {
        return;
    }

    codeGroupIndex += 1;

    const groupKey = makeCodeGroupPreferenceKey(variants);
    const preferredIndex = getPreferredCodeVariantIndex(variants, groupKey);
    const frame = document.createElement("div");
    const deck = document.createElement("div");

    frame.className = "rss-code-frame rss-code-frame--group";
    frame.dataset.rssCodeGroup = "1";
    frame.dataset.rssCodeGroupPrefKey = groupKey;
    frame.dataset.language = variants[preferredIndex]?.lang ?? variants[0].lang;

    moveCodeSegShareToFrame(frame, variants.map((variant) => variant.pre));

    deck.className = "rss-code-variants";

    parent.insertBefore(frame, run[0]);

    variants.forEach((variant, index) => {
        deck.appendChild(mkCodeVariantPane(variant, index));
    });

    frame.append(mkCodeGroupBar(frame, variants), deck);

    setCodeGroupActive(frame, preferredIndex, {
        savePreference: false,
        syncPeers: false
    });

    stopPstEvts(frame);

    variants.forEach((variant) => {
        hglCode(variant.code);
    });
}

/**
 * Groups adjacent markdown code blocks before single-code toolbar wiring runs.
 * @param {HTMLElement} root
 * @returns {void}
 */
function grpAdjacentCodeBlocks(root: HTMLElement): void {
    colCodeRuns(root).forEach((run) => {
        mkCodeGroupFrame(run);
    });
}

/**
 * Fixes old bar text.
 * @param {HTMLDivElement} frame
 * @param {HTMLElement} code
 * @returns {void}
 */
function updCodeBar(frame: HTMLDivElement, code: HTMLElement): void {
    const label = frame.querySelector(".rss-code-lang");
    if (!(label instanceof HTMLSpanElement)) return;

    setLangLblTxt(label, getCodeLang(code));
}

/**
 * Do not let post eat this stuff.
 * @param {HTMLElement} root
 * @returns {void}
 */
function stopPstEvts(root: HTMLElement): void {
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
function ensCodeTls(pre: HTMLPreElement, code: HTMLElement): void {
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
function hglCode(code: HTMLElement): void {
    if (code.dataset.rssHighlighted === "1") return;
    if (typeof hljs === "undefined") return;

    code.dataset.rssHighlighted = "1";
    hljs.highlightElement(code);
}

/**
 * Post code bits.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function hglPstCode(
    pstDiv: HTMLElement,
    hooks: CodeBlockLayoutHooks
): void {
    layoutHooks = hooks;
    wireExternalCodeBlocks(pstDiv, {
        getPreCode,
        highlightCode: hglCode,
        updateCodeBar: updCodeBar,
        queueCodeGroupLayout: qCodeGroupLayout,
        queuePostHeight: hooks.queuePostHeight
    });
    grpAdjacentCodeBlocks(pstDiv);

    Array.from(pstDiv.querySelectorAll<HTMLElement>("pre code")).forEach((code) => {
        if (code.closest("[data-rss-code-group='1']")) {
            hglCode(code);
            return;
        }

        const pre = code.closest("pre");
        if (!(pre instanceof HTMLPreElement)) return;

        ensCodeTls(pre, code);
        hglCode(code);
    });
}

