import * as helpers from "../helpers.ts";
import { DEF_REG_ORDER, DEF_REG_LABELS, normDat, mkLbl, englishName, flagCode, noSlash, isRow } from "./shared.ts";
import type { Opts, Loc, FlagRes, Regions, LocationSortMode, LocationEntry, Row } from "./shared.ts";

export abstract class locApiBase {
    protected readonly selEl: HTMLSelectElement;
    protected readonly flagEl: HTMLElement;
    protected readonly dataUrl: string;
    protected readonly flagsUrl: string;
    protected readonly regOrder: readonly string[];
    protected readonly regLabels: Readonly<Record<string, string>>;
    protected readonly phLabel: string;
    protected readonly emptyLabel: string;

    protected data: Regions | null = null;
    protected onChg: (() => void) | null = null;
    protected pickerEl: HTMLDivElement | null = null;
    protected pickerBtn: HTMLButtonElement | null = null;
    protected pickerMenu: HTMLDivElement | null = null;
    protected optionsEl: HTMLDivElement | null = null;
    protected searchEl: HTMLInputElement | null = null;
    protected sortMode: LocationSortMode = "region";
    protected searchQuery = "";
    protected expandedGroups = new Set<string>();

    protected abstract fillMenu(menu: HTMLDivElement): void;
    protected abstract mkSortBtn(mode: LocationSortMode, label: string): HTMLButtonElement;
    protected abstract setSortMode(mode: LocationSortMode): void;
    protected abstract rebuildMenu(): void;
    protected abstract renderOptions(): void;
    protected abstract renderRegionGroups(options: HTMLDivElement): void;
    protected abstract renderLetterGroups(options: HTMLDivElement): void;
    protected abstract renderSearchResults(options: HTMLDivElement, query: string): void;
    protected abstract mkGroupButton(groupId: string, label: string): HTMLButtonElement;
    protected abstract mkLocationItem(entry: LocationEntry, nested: boolean): HTMLButtonElement;
    protected abstract mkPickItm(option: HTMLOptionElement): HTMLButtonElement;
    protected abstract pickVal(locationKey: string): void;
    protected abstract syncPick(): void;
    protected abstract selLbl(): string;
    protected abstract find(locationKey: string): Row | null;
    protected abstract show(locationKey: string): Promise<FlagRes>;
    protected abstract ndInit(): void;

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

    protected bind(): void {
        if (this.onChg) this.selEl.removeEventListener("change", this.onChg);

        this.onChg = () => {
            this.syncPick();
            void this.renderCurrentFlag();
        };

        this.selEl.addEventListener("change", this.onChg);
    }

    protected async fetchDat(): Promise<Regions> {
        const response = await fetch(this.dataUrl);
        if (!response.ok) throw new Error(`Failed to fetch ${this.dataUrl} (${response.status})`);

        const value: unknown = await response.json();
        if (!helpers.isRecord(value)) throw new Error("Locations JSON must contain an object at the root");
        return normDat(value);
    }

    protected fillSelect(): void {
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

    protected addPh(): void {
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = this.phLabel;
        this.selEl.appendChild(ph);
    }

    protected addRegs(): void {
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

    protected addAlphaGroups(): void {
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

    protected regionKeys(): string[] {
        if (!this.data) return [];
        const configured = this.regOrder.filter((key) => helpers.isRecord(this.data?.[key]));
        const extras = Object.keys(this.data).filter((key) => !configured.includes(key));
        return [...configured, ...extras].sort((left, right) => this.regionLabel(left).localeCompare(this.regionLabel(right), "en", { sensitivity: "base" }));
    }

    protected regionLabel(region: string): string {
        return this.regLabels[region] ?? englishName(region);
    }

    protected entriesForRegion(region: string): LocationEntry[] {
        if (!this.data) return [];
        const reg = this.data[region];
        if (!helpers.isRecord(reg)) return [];

        return Object.entries(reg)
            .filter((entry): entry is [string, Row] => isRow(entry[1]))
            .map(([locationKey, row]) => ({ locationKey, row, region }))
            .sort((left, right) => englishName(left.locationKey).localeCompare(englishName(right.locationKey), "en", { sensitivity: "base" }));
    }

    protected allLocations(): LocationEntry[] {
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

    protected rndPick(): void {
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

}
