import * as config from "../config.ts";
import * as helpers from "../helpers.ts";
import type { StoriesIndex } from "./types.ts";

/**
 * @param {Document} root
 * @returns {Promise<void>}
 */
export async function populatePicker(root: Document = document): Promise<void> {
    const picker = window.storyPickerRoot;
    if (!picker) return;

    const makePickerHint = (): HTMLDivElement => {
        const hint = root.createElement("div");

        hint.className = "story-dropdown__hint";
        hint.textContent = "Pick a story...";
        hint.setAttribute("aria-hidden", "true");

        return hint;
    };

    const makeSizerItem = (text: string, className = ""): HTMLDivElement => {
        const item = root.createElement("div");

        item.className = ["story-dropdown__sizer-item", className]
            .filter(Boolean)
            .join(" ");

        item.textContent = text;

        return item;
    };

    try {
        const res = await fetch(`${config.storiesIndexURL}`);
        if (!res.ok) throw new Error("No stories found");

        const storiesUnknown: unknown = await res.json();

        if (!helpers.isRecord(storiesUnknown)) {
            throw new Error("Invalid stories index format");
        }

        const stories = storiesUnknown as StoriesIndex;
        const storyNames = Object.keys(stories);

        const makeStoryHref = (storyName: string): string =>
            `${window.location.pathname}?story=${encodeURIComponent(storyName)}&chapter=1`;

        const makeStoryItem = (storyName: string): HTMLAnchorElement => {
            const item = root.createElement("a");

            item.className = "story-dropdown__item";
            item.href = makeStoryHref(storyName);
            item.textContent = storyName;

            if (storyName === window.storyName) {
                item.classList.add("is-current");
                item.setAttribute("aria-current", "page");
            }

            return item;
        };

        const existing = picker.querySelector(".story-dropdown[data-kc-story-static]");
        const dropdown = existing instanceof HTMLDivElement ? existing : root.createElement("div");
        dropdown.className = "story-dropdown";

        const button = dropdown.querySelector<HTMLButtonElement>("#reader-story-selector") ?? root.createElement("button");
        button.id = "reader-story-selector";
        button.type = "button";
        button.className = "story-dropdown__button";
        button.textContent = window.storyName || "Pick a story...";
        button.setAttribute("aria-haspopup", "true");

        const sizer = dropdown.querySelector<HTMLDivElement>(".story-dropdown__sizer") ?? root.createElement("div");
        sizer.replaceChildren();
        sizer.className = "story-dropdown__sizer";
        sizer.setAttribute("aria-hidden", "true");

        sizer.appendChild(makeSizerItem("Pick a story...", "story-dropdown__sizer-item--hint"));

        storyNames
            .map((storyName) => makeSizerItem(storyName))
            .forEach((item) => sizer.appendChild(item));

        const menu = dropdown.querySelector<HTMLDivElement>(".story-dropdown__content") ?? root.createElement("div");
        menu.replaceChildren();
        menu.className = "story-dropdown__content";

        menu.appendChild(makePickerHint());

        storyNames
            .map(makeStoryItem)
            .forEach((item) => menu.appendChild(item));

        if (!(existing instanceof HTMLDivElement)) picker.replaceChildren(dropdown);
        if (button.parentElement !== dropdown) dropdown.appendChild(button);
        if (sizer.parentElement !== dropdown) dropdown.appendChild(sizer);
        if (menu.parentElement !== dropdown) dropdown.appendChild(menu);
    } catch (err) {
        console.warn("No stories found or failed to load stories.json", err);
    }
}
