import * as helpers from "./helpers.ts";

interface Opts {
    selectElement: HTMLSelectElement;
    flagElement: HTMLElement;
    locationsUrl: string;
    flagsBaseUrl: string;
    mostFrequentKeys?: string[];
    regionOrder?: readonly string[];
    regionLabels?: Readonly<Record<string, string>>;
    placeholderLabel?: string;
    emptyFlagLabel?: string;
}

interface Loc {
    localName: string;
    flag: string;
}

interface FlagRes {
    locationKey: string;
    label: string;
    flagCode: string;
    flagUrl: string;
}

type Regions = Record<string, Record<string, Row>>;
type LocationSortMode = "region" | "alpha";
type LocationEntry = Readonly<{
    locationKey: string;
    row: Row;
    region: string;
}>;

interface Row {
    local_name: string;
    emoji: string;
}

const DEF_REG_ORDER = ["africa", "america", "asia", "europe", "oceania"] as const;
const DEF_REG_LABELS: Readonly<Record<string, string>> = {
    africa: "Africa",
    america: "Americas",
    asia: "Asia",
    europe: "Europe",
    oceania: "Oceania",
};

export class locApi {
    private readonly selEl: HTMLSelectElement;
    private readonly flagEl: HTMLElement;
    private readonly dataUrl: string;
    private readonly flagsUrl: string;
    private readonly regOrder: readonly string[];
    private readonly regLabels: Readonly<Record<string, string>>;
    private readonly phLabel: string;
    private readonly emptyLabel: string;

    private data: Regions | null = null;
    private onChg: (() => void) | null = null;
    private pickerEl: HTMLDivElement | null = null;
    private pickerBtn: HTMLButtonElement | null = null;
    private pickerMenu: HTMLDivElement | null = null;
    private optionsEl: HTMLDivElement | null = null;
    private searchEl: HTMLInputElement | null = null;
    private sortMode: LocationSortMode = "region";
    private searchQuery = "";
    private expandedGroups = new Set<string>();

    public constructor(options: Opts) {
        this.selEl = options.selectElement;
        this.flagEl = options.flagElement;
        this.dataUrl = options.locationsUrl;
        this.flagsUrl = noSlash(options.flagsBaseUrl);
        this.regOrder = options.regionOrder ?? DEF_REG_ORDER;
        this.regLabels = options.regionLabels ?? DEF_REG_LABELS;
        this.phLabel = options.placeholderLabel ?? "Location (Optional)";
        this.emptyLabel = options.emptyFlagLabel ?? "Select a location";
    }

    public async init(): Promise<void> {
        this.data = await this.fetchDat();
        this.fillSelect();
        this.rndPick();
        this.bind();
        this.syncPick();

        if (!this.selEl.value) {
            this.clearFlag();
            return;
        }

        await this.show(this.selEl.value);
    }

    public destroy(): void {
        if (this.onChg) {
            this.selEl.removeEventListener("change", this.onChg);
            this.onChg = null;
        }

        this.pickerEl?.remove();
        this.pickerEl = null;
        this.pickerBtn = null;
        this.pickerMenu = null;
        this.optionsEl = null;
        this.searchEl = null;
        this.selEl.classList.remove("comment-location-native");
        this.data = null;
    }

    public async reload(): Promise<void> {
        const selectedKey = this.selEl.value;
        this.data = await this.fetchDat();
        this.fillSelect();

        if (selectedKey && Array.from(this.selEl.options).some((option) => option.value === selectedKey)) {
            this.selEl.value = selectedKey;
        }

        this.rebuildMenu();
        this.syncPick();

        if (!selectedKey || !this.find(selectedKey)) {
            this.clearFlag();
            return;
        }

        await this.show(selectedKey);
    }

    public async setValue(locationKey: string): Promise<void> {
        this.ndInit();

        if (!locationKey) {
            this.selEl.value = "";
            this.clearFlag();
            this.syncPick();
            return;
        }

        if (!this.find(locationKey)) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        this.selEl.value = locationKey;
        this.syncPick();
        await this.show(locationKey);
    }

    public getValue(): string {
        return this.selEl.value;
    }

    public getLocation(locationKey: string): Loc | null {
        this.ndInit();
        const row = this.find(locationKey);
        if (!row) return null;
        return { localName: row.local_name, flag: row.emoji };
    }

    public clearFlag(): void {
        this.flagEl.replaceChildren();
        this.flagEl.textContent = this.emptyLabel;
    }

    public async renderCurrentFlag(): Promise<FlagRes | null> {
        const locationKey = this.selEl.value;
        this.syncPick();

        if (!locationKey || !this.find(locationKey)) {
            this.clearFlag();
            return null;
        }

        return this.show(locationKey);
    }

    public getFlagUrl(locationKey: string): string {
        this.ndInit();
        const row = this.find(locationKey);
        if (!row) throw new Error(`Location not found in dataset: ${locationKey}`);
        return `${this.flagsUrl}/${flagCode(row.emoji)}.png`;
    }

    public getLabel(locationKey: string): string {
        this.ndInit();
        const row = this.find(locationKey);
        if (!row) throw new Error(`Location not found in dataset: ${locationKey}`);
        return mkLbl(locationKey, row.local_name);
    }

    private bind(): void {
        if (this.onChg) this.selEl.removeEventListener("change", this.onChg);

        this.onChg = () => {
            this.syncPick();
            void this.renderCurrentFlag();
        };

        this.selEl.addEventListener("change", this.onChg);
    }

    private async fetchDat(): Promise<Regions> {
        const response = await fetch(this.dataUrl);
        if (!response.ok) throw new Error(`Failed to fetch ${this.dataUrl} (${response.status})`);

        const value: unknown = await response.json();
        if (!helpers.isRecord(value)) throw new Error("Locations JSON must contain an object at the root");
        return normDat(value);
    }

    private fillSelect(): void {
        this.ndInit();
        const selected = this.selEl.value;
        this.selEl.replaceChildren();
        this.addPh();

        if (this.sortMode === "alpha") this.addAlphaGroups();
        else this.addRegs();

        if (selected && Array.from(this.selEl.options).some((option) => option.value === selected)) {
            this.selEl.value = selected;
        }
    }

    private addPh(): void {
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = this.phLabel;
        this.selEl.appendChild(ph);
    }

    private addRegs(): void {
        if (!this.data) return;

        for (const regName of this.regionKeys()) {
            const entries = this.entriesForRegion(regName);
            if (!entries.length) continue;

            const group = document.createElement("optgroup");
            group.label = this.regionLabel(regName);

            for (const entry of entries) {
                const option = document.createElement("option");
                option.value = entry.locationKey;
                option.textContent = mkLbl(entry.locationKey, entry.row.local_name);
                group.appendChild(option);
            }

            this.selEl.appendChild(group);
        }
    }

    private addAlphaGroups(): void {
        const byLetter = new Map<string, LocationEntry[]>();

        for (const entry of this.allLocations()) {
            const letter = englishName(entry.locationKey).charAt(0).toUpperCase();
            if (!/^[A-Z]$/.test(letter)) continue;
            const items = byLetter.get(letter) ?? [];
            items.push(entry);
            byLetter.set(letter, items);
        }

        for (const letter of Array.from(byLetter.keys()).sort()) {
            const group = document.createElement("optgroup");
            group.label = letter;

            for (const entry of byLetter.get(letter) ?? []) {
                const option = document.createElement("option");
                option.value = entry.locationKey;
                option.textContent = mkLbl(entry.locationKey, entry.row.local_name);
                group.appendChild(option);
            }

            this.selEl.appendChild(group);
        }
    }

    private regionKeys(): string[] {
        if (!this.data) return [];
        const configured = this.regOrder.filter((key) => helpers.isRecord(this.data?.[key]));
        const extras = Object.keys(this.data).filter((key) => !configured.includes(key));
        return [...configured, ...extras].sort((left, right) => this.regionLabel(left).localeCompare(this.regionLabel(right), "en", { sensitivity: "base" }));
    }

    private regionLabel(region: string): string {
        return this.regLabels[region] ?? englishName(region);
    }

    private entriesForRegion(region: string): LocationEntry[] {
        if (!this.data) return [];
        const reg = this.data[region];
        if (!helpers.isRecord(reg)) return [];

        return Object.entries(reg)
            .filter((entry): entry is [string, Row] => isRow(entry[1]))
            .map(([locationKey, row]) => ({ locationKey, row, region }))
            .sort((left, right) => englishName(left.locationKey).localeCompare(englishName(right.locationKey), "en", { sensitivity: "base" }));
    }

    private allLocations(): LocationEntry[] {
        if (!this.data) return [];
        const seen = new Set<string>();
        const items: LocationEntry[] = [];

        for (const region of this.regionKeys()) {
            for (const entry of this.entriesForRegion(region)) {
                if (seen.has(entry.locationKey)) continue;
                seen.add(entry.locationKey);
                items.push(entry);
            }
        }

        return items.sort((left, right) => englishName(left.locationKey).localeCompare(englishName(right.locationKey), "en", { sensitivity: "base" }));
    }

    private rndPick(): void {
        const parent = this.selEl.parentElement;
        if (!parent) return;

        const staticPicker = parent.querySelector<HTMLDivElement>(
            '.comment-location-dropdown[data-kc-static-location="1"]'
        );
        if (this.pickerEl && this.pickerEl !== staticPicker) this.pickerEl.remove();

        this.selEl.classList.add("comment-location-native");

        const picker = staticPicker ?? document.createElement("div");
        picker.className = "comment-location-dropdown";

        const button = picker.querySelector<HTMLButtonElement>(
            "#" + this.selEl.id + "-dropdown-button"
        ) ?? document.createElement("button");
        button.id = `${this.selEl.id}-dropdown-button`;
        button.type = "button";
        button.className = "comment-location-dropdown__button";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-controls", `${this.selEl.id}-dropdown-menu`);

        const menu = picker.querySelector<HTMLDivElement>(
            "#" + this.selEl.id + "-dropdown-menu"
        ) ?? document.createElement("div");
        menu.id = `${this.selEl.id}-dropdown-menu`;
        menu.className = "comment-location-dropdown__content";

        if (button.parentElement !== picker) picker.appendChild(button);
        if (menu.parentElement !== picker) picker.appendChild(menu);

        if (!staticPicker && this.flagEl.parentElement === parent) {
            parent.insertBefore(picker, this.flagEl);
        }
        if (!staticPicker && this.flagEl.parentElement !== parent) parent.appendChild(picker);

        this.pickerEl = picker;
        this.pickerBtn = button;
        this.pickerMenu = menu;
        this.fillMenu(menu);
        this.syncPick();
    }

    private fillMenu(menu: HTMLDivElement): void {
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

    private mkSortBtn(mode: LocationSortMode, label: string): HTMLButtonElement {
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

    private setSortMode(mode: LocationSortMode): void {
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

    private rebuildMenu(): void {
        if (!this.pickerMenu) return;
        this.pickerMenu.replaceChildren();
        this.optionsEl = null;
        this.searchEl = null;
        this.fillMenu(this.pickerMenu);
    }

    private renderOptions(): void {
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

    private renderRegionGroups(options: HTMLDivElement): void {
        for (const region of this.regionKeys()) {
            const entries = this.entriesForRegion(region);
            if (!entries.length) continue;

            const groupId = `region:${region}`;
            options.appendChild(this.mkGroupButton(groupId, this.regionLabel(region)));

            if (!this.expandedGroups.has(groupId)) continue;
            for (const entry of entries) options.appendChild(this.mkLocationItem(entry, true));
        }
    }

    private renderLetterGroups(options: HTMLDivElement): void {
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

    private renderSearchResults(options: HTMLDivElement, query: string): void {
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

    private mkGroupButton(groupId: string, label: string): HTMLButtonElement {
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

    private mkLocationItem(entry: LocationEntry, nested: boolean): HTMLButtonElement {
        const option = document.createElement("option");
        option.value = entry.locationKey;
        option.textContent = mkLbl(entry.locationKey, entry.row.local_name);
        const item = this.mkPickItm(option);
        if (nested) item.classList.add("comment-location-dropdown__item--nested");
        return item;
    }

    private mkPickItm(option: HTMLOptionElement): HTMLButtonElement {
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

    private pickVal(locationKey: string): void {
        this.selEl.value = locationKey;
        this.selEl.dispatchEvent(new Event("change", { bubbles: true }));
        const active = document.activeElement;
        if (active instanceof HTMLElement) active.blur();
    }

    private syncPick(): void {
        if (this.pickerBtn) this.pickerBtn.textContent = this.selLbl();

        this.pickerEl
            ?.querySelectorAll<HTMLButtonElement>(".comment-location-dropdown__item")
            .forEach((item) => {
                const isCurrent = item.dataset.locationKey === this.selEl.value;
                item.classList.toggle("is-current", isCurrent);
                item.setAttribute("aria-selected", isCurrent ? "true" : "false");
            });
    }

    private selLbl(): string {
        const selected = Array.from(this.selEl.options).find((option) => option.value === this.selEl.value);
        const label = selected?.textContent?.trim() ?? "";
        return label.length ? label : this.phLabel;
    }

    private find(locationKey: string): Row | null {
        if (!this.data) return null;

        for (const region of Object.values(this.data)) {
            if (!helpers.isRecord(region)) continue;
            const row = region[locationKey];
            if (isRow(row)) return row;
        }

        return null;
    }

    private async show(locationKey: string): Promise<FlagRes> {
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

    private ndInit(): void {
        if (!this.data) throw new Error("LocationApi has not been initialised. Call init() first.");
    }
}

export function createLocationApi(options: Opts): locApi {
    return new locApi(options);
}

async function needAst(assetUrl: string): Promise<void> {
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${assetUrl} (${response.status})`);
}

function normDat(value: unknown): Regions {
    if (!helpers.isRecord(value)) throw new Error("Locations JSON must contain an object at the root");
    const data: Regions = {};

    for (const [regName, regValue] of Object.entries(value)) {
        if (!helpers.isRecord(regValue)) continue;
        const reg: Record<string, Row> = {};

        for (const [locationKey, locationValue] of Object.entries(regValue)) {
            if (isRow(locationValue)) reg[locationKey] = locationValue;
        }

        data[regName] = reg;
    }

    return data;
}

function mkLbl(locationKey: string, localName: string): string {
    const englishNameValue = englishName(locationKey);
    return sameNm(englishNameValue, localName)
        ? englishNameValue
        : `${englishNameValue} (${localName})`;
}

function englishName(value: string): string {
    return fmtEng(value);
}

function sameNm(englishNameValue: string, localName: string): boolean {
    return normNm(englishNameValue) === normNm(localName);
}

function normNm(value: string): string {
    return value.trim().toLocaleLowerCase("en");
}

function searchKey(value: string): string {
    return value.trim().toLocaleLowerCase("en");
}

function fmtEng(value: string): string {
    return value
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

function flagCode(flag: string): string {
    const symbols = Array.from(flag);
    if (!symbols.length) throw new Error("Flag value is empty");
    return symbols.map((symbol) => regAsc(symbol)).join("").toLowerCase();
}

function regAsc(symbol: string): string {
    const codePoint = symbol.codePointAt(0);
    if (!codePoint) throw new Error(`Invalid regional indicator symbol: ${symbol}`);
    const asciiCode = codePoint - 127397;
    if (asciiCode < 65 || asciiCode > 90) throw new Error(`Symbol is not a regional indicator letter: ${symbol}`);
    return String.fromCharCode(asciiCode);
}

function noSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isRow(value: unknown): value is Row {
    return helpers.isRecord(value)
        && typeof value.emoji === "string"
        && typeof value.local_name === "string";
}
