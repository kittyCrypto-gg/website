import { getCodeLang } from "./codeLanguage.ts";
import { saveCodePreference } from "./codePreferences.ts";
import { hglCode } from "./codeBlockBasics.ts";
import { qCodeGroupLayout } from "./codeBlockContext.ts";
import type { CodeGroupActiveOptions } from "./types.ts";

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
export function setCodeGroupActive(
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
