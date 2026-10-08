import { needAst, mkLbl, englishName, searchKey, flagCode, isRow } from "./shared.ts";
import type { FlagRes, LocationSortMode, LocationEntry, Row } from "./shared.ts";
import { locApiBase } from "./base.ts";

export class locApi extends locApiBase {
    protected fillMenu(menu: HTMLDivElement): void {
        const toolbar = document.createElement("div");
        toolbar.className = "comment-location-sort";
        toolbar.setAttribute("role", "group");
        toolbar.setAttribute("aria-label", "Location browser controls");

        const label = document.createElement("span");
        label.className = "comment-location-sort__label";
        label.textContent = "Browse by";

        const segments = document.createElement("div");
        segments.className = "comment-location-sort__segments";
        segments.append(this.mkSortBtn("region", "Region"), this.mkSortBtn("alpha", "A–Z"));

        const search = document.createElement("input");
        search.type = "search";
        search.className = "comment-location-sort__search";
        search.value = this.searchQuery;
        search.placeholder = "Filter regions or countries…";
        search.autocomplete = "off";
        search.spellcheck = false;
        search.setAttribute("aria-label", "Filter locations by English name");
        search.addEventListener("input", () => {
            this.searchQuery = search.value;
            this.renderOptions();
        });

        toolbar.append(label, segments, search);

        const options = document.createElement("div");
        options.className = "comment-location-dropdown__options";
        options.setAttribute("role", "listbox");
        options.setAttribute("aria-label", "Locations");

        menu.append(toolbar, options);
        this.searchEl = search;
        this.optionsEl = options;
        this.renderOptions();
    }

    protected mkSortBtn(mode: LocationSortMode, label: string): HTMLButtonElement {
        const button = document.createElement("button");
        const current = this.sortMode === mode;

        button.type = "button";
        button.className = "comment-location-dropdown__button comment-location-sort__button";
        button.textContent = label;
        button.dataset.sortMode = mode;
        button.classList.toggle("is-active", current);
        button.setAttribute("aria-pressed", current ? "true" : "false");
        button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.setSortMode(mode);
        });

        return button;
    }

    protected setSortMode(mode: LocationSortMode): void {
        if (mode === this.sortMode) return;

        this.sortMode = mode;
        this.expandedGroups.clear();
        this.fillSelect();
        this.rebuildMenu();
        this.syncPick();

        this.pickerMenu
            ?.querySelector<HTMLButtonElement>(`.comment-location-sort__button[data-sort-mode="${mode}"]`)
            ?.focus();
    }

    protected rebuildMenu(): void {
        if (!this.pickerMenu) return;
        this.pickerMenu.replaceChildren();
        this.optionsEl = null;
        this.searchEl = null;
        this.fillMenu(this.pickerMenu);
    }

    protected renderOptions(): void {
        const options = this.optionsEl;
        if (!options) return;
        options.replaceChildren();

        const query = searchKey(this.searchQuery);
        if (query) {
            this.renderSearchResults(options, query);
            this.syncPick();
            return;
        }

        const placeholder = this.selEl.options.item(0);
        if (placeholder) options.appendChild(this.mkPickItm(placeholder));

        if (this.sortMode === "region") this.renderRegionGroups(options);
        else this.renderLetterGroups(options);

        this.syncPick();
    }

    protected renderRegionGroups(options: HTMLDivElement): void {
        for (const region of this.regionKeys()) {
            const entries = this.entriesForRegion(region);
            if (!entries.length) continue;

            const groupId = `region:${region}`;
            options.appendChild(this.mkGroupButton(groupId, this.regionLabel(region)));

            if (!this.expandedGroups.has(groupId)) continue;
            for (const entry of entries) options.appendChild(this.mkLocationItem(entry, true));
        }
    }

    protected renderLetterGroups(options: HTMLDivElement): void {
        const byLetter = new Map<string, LocationEntry[]>();

        for (const entry of this.allLocations()) {
            const letter = englishName(entry.locationKey).charAt(0).toUpperCase();
            if (!/^[A-Z]$/.test(letter)) continue;
            const entries = byLetter.get(letter) ?? [];
            entries.push(entry);
            byLetter.set(letter, entries);
        }

        for (const letter of Array.from(byLetter.keys()).sort()) {
            const groupId = `letter:${letter}`;
            options.appendChild(this.mkGroupButton(groupId, letter));

            if (!this.expandedGroups.has(groupId)) continue;
            for (const entry of byLetter.get(letter) ?? []) options.appendChild(this.mkLocationItem(entry, true));
        }
    }

    protected renderSearchResults(options: HTMLDivElement, query: string): void {
        const matchingRegions = this.regionKeys().filter((region) => searchKey(this.regionLabel(region)).startsWith(query));
        const matchingLocations = this.allLocations().filter((entry) => searchKey(englishName(entry.locationKey)).startsWith(query));

        for (const region of matchingRegions) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "comment-location-dropdown__group comment-location-dropdown__group--toggle comment-location-dropdown__group--search";
            button.textContent = `▶ ${this.regionLabel(region)}`;
            button.addEventListener("click", () => {
                this.sortMode = "region";
                this.searchQuery = "";
                this.expandedGroups.clear();
                this.expandedGroups.add(`region:${region}`);
                this.fillSelect();
                this.rebuildMenu();
                this.syncPick();
            });
            options.appendChild(button);
        }

        for (const entry of matchingLocations) options.appendChild(this.mkLocationItem(entry, false));

        if (!matchingRegions.length && !matchingLocations.length) {
            const empty = document.createElement("div");
            empty.className = "comment-location-dropdown__empty";
            empty.setAttribute("role", "status");
            empty.textContent = "No matches";
            options.appendChild(empty);
        }
    }

    protected mkGroupButton(groupId: string, label: string): HTMLButtonElement {
        const expanded = this.expandedGroups.has(groupId);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "comment-location-dropdown__group comment-location-dropdown__group--toggle";
        button.textContent = `${expanded ? "▼" : "▶"} ${label}`;
        button.setAttribute("aria-expanded", expanded ? "true" : "false");
        button.addEventListener("click", () => {
            if (expanded) this.expandedGroups.delete(groupId);
            else this.expandedGroups.add(groupId);
            this.renderOptions();
        });
        return button;
    }

    protected mkLocationItem(entry: LocationEntry, nested: boolean): HTMLButtonElement {
        const option = document.createElement("option");
        option.value = entry.locationKey;
        option.textContent = mkLbl(entry.locationKey, entry.row.local_name);
        const item = this.mkPickItm(option);
        if (nested) item.classList.add("comment-location-dropdown__item--nested");
        return item;
    }

    protected mkPickItm(option: HTMLOptionElement): HTMLButtonElement {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "comment-location-dropdown__item";
        item.textContent = option.textContent || this.phLabel;
        item.dataset.locationKey = option.value;
        item.setAttribute("role", "option");

        if (!option.value) item.classList.add("comment-location-dropdown__item--placeholder");
        item.addEventListener("click", () => this.pickVal(option.value));
        return item;
    }

    protected pickVal(locationKey: string): void {
        this.selEl.value = locationKey;
        this.selEl.dispatchEvent(new Event("change", { bubbles: true }));
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
    }

    protected syncPick(): void {
        if (this.pickerBtn) this.pickerBtn.textContent = this.selLbl();

        this.pickerEl
            ?.querySelectorAll<HTMLButtonElement>(".comment-location-dropdown__item")
            .forEach((item) => {
                const isCurrent = item.dataset.locationKey === this.selEl.value;
                item.classList.toggle("is-current", isCurrent);
                item.setAttribute("aria-selected", isCurrent ? "true" : "false");
            });
    }

    protected selLbl(): string {
        const selected = Array.from(this.selEl.options).find((option) => option.value === this.selEl.value);
        const label = selected?.textContent?.trim() ?? "";
        return label.length ? label : this.phLabel;
    }

    protected find(locationKey: string): Row | null {
        if (!this.data) return null;

        for (const region of Object.values(this.data)) {
            if (!helpers.isRecord(region)) continue;
            const row = region[locationKey];
            if (isRow(row)) return row;
        }

        return null;
    }

    protected async show(locationKey: string): Promise<FlagRes> {
        const row = this.find(locationKey);
        if (!row) throw new Error(`Location not found in dataset: ${locationKey}`);

        const code = flagCode(row.emoji);
        const url = `${this.flagsUrl}/${code}.png`;
        await needAst(url);

        const image = document.createElement("img");
        image.src = url;
        image.alt = `${mkLbl(locationKey, row.local_name)} flag`;
        this.flagEl.replaceChildren(image);

        return {
            locationKey,
            label: mkLbl(locationKey, row.local_name),
            flagCode: code,
            flagUrl: url,
        };
    }

    protected ndInit(): void {
        if (!this.data) throw new Error("LocationApi has not been initialised. Call init() first.");
    }
}
