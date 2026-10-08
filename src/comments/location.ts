import { createLocationApi, type locApi as LocationApi } from "../locations.ts";
import type { CommentLocationPickerInput } from "./types.ts";

export const COMMENT_LOCATION_KEY = "comment-location";
const LOC_DATA_URL = "../data/locations.json";
const LOC_FLAGS_URL = "../images/flags";

let locationApi: LocationApi | null = null;

export function getCommentLocationApi(): LocationApi | null {
    return locationApi;
}

export function normLoc(rawValue: string | null | undefined): string {
    const trimmed = rawValue?.trim() ?? "";
    return trimmed.length === 0 ? "world" : trimmed;
}

export function restoreLoc(
    locationSelect: HTMLSelectElement,
    storageKey = COMMENT_LOCATION_KEY
): void {
    const storedLocation = normLoc(localStorage.getItem(storageKey));
    const hasStoredOption = Array.from(locationSelect.options)
        .some((option) => option.value === storedLocation);

    locationSelect.value = hasStoredOption ? storedLocation : "world";
    locationSelect.dispatchEvent(new Event("change"));
}

function wireLocationPickerClose(locationSelect: HTMLSelectElement): void {
    const picker = locationSelect.parentElement
        ?.querySelector<HTMLElement>(".comment-location-dropdown");

    if (!picker) return;
    if (picker.dataset.wired === "1") return;

    picker.dataset.wired = "1";
    picker.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;

        const item = target.closest(".comment-location-dropdown__item");
        if (!(item instanceof HTMLElement)) return;

        picker.classList.add("is-picked");
        picker.addEventListener(
            "pointerleave",
            () => picker.classList.remove("is-picked"),
            { once: true }
        );
    });
}

export async function initCommentLocationPicker(
    input: CommentLocationPickerInput
): Promise<LocationApi> {
    const storageKey = input.storageKey ?? COMMENT_LOCATION_KEY;
    const api = createLocationApi({
        selectElement: input.selectElement,
        flagElement: input.flagElement,
        locationsUrl: LOC_DATA_URL,
        flagsBaseUrl: LOC_FLAGS_URL,
        placeholderLabel: input.placeholderLabel,
        emptyFlagLabel: input.emptyFlagLabel ?? "🌎"
    });

    await api.init();
    wireLocationPickerClose(input.selectElement);
    restoreLoc(input.selectElement, storageKey);

    input.selectElement.addEventListener("change", () => {
        localStorage.setItem(
            storageKey,
            normLoc(input.selectElement.value)
        );
    });

    locationApi = api;
    return api;
}

export function mkWorldBadge(): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "chat-location-badge";
    badge.dataset.location = "world";
    badge.textContent = "🌎";
    badge.setAttribute("aria-label", "World");
    badge.title = "World";
    return badge;
}

export function mkLocBadge(
    locationKeyRaw: string | null | undefined,
    api: LocationApi | null = locationApi
): HTMLElement {
    const locationKey = normLoc(locationKeyRaw);
    if (locationKey === "world") return mkWorldBadge();
    if (!api) return mkWorldBadge();

    try {
        const badge = document.createElement("span");
        badge.className = "chat-location-badge";
        badge.dataset.location = locationKey;

        const image = document.createElement("img");
        image.className = "chat-location-flag";
        image.src = api.getFlagUrl(locationKey);
        image.alt = api.getLabel(locationKey) + " flag";
        image.loading = "lazy";

        badge.appendChild(image);
        badge.title = api.getLabel(locationKey);
        return badge;
    } catch {
        return mkWorldBadge();
    }
}
