import * as icons from "../icons.tsx";
import { render2Frag } from "../reactHelpers.tsx";
import { getCodeLang } from "./codeLanguage.ts";
import { getPreferredCodeVariantIndex, makeCodeGroupPreferenceKey } from "./codePreferences.ts";
import { moveCodeSegShareToFrame } from "./segments.ts";
import { mkDynCpyBtn, mkCodeVariant, getActCodeVariant, stopPstEvts, hglCode } from "./codeBlockBasics.ts";
import { colCodeRuns } from "./codeBlockRuns.ts";
import { currentCodeGroupIndex, nextCodeGroupIndex } from "./codeBlockContext.ts";
import { setCodeGroupActive } from "./codeBlockSelection.ts";
import type { CodeVariant } from "./types.ts";

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
    const groupName = `rss-code-group-${currentCodeGroupIndex()}`;

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

    nextCodeGroupIndex();

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
export function grpAdjacentCodeBlocks(root: HTMLElement): void {
    colCodeRuns(root).forEach((run) => {
        mkCodeGroupFrame(run);
    });
}
