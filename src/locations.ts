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

interface Row {
    local_name: string;
    emoji: string;
}

const DEF_REG_ORDER = [
    "europe", "asia", "america", "oceania", "africa",
] as const;

const DEF_REG_LABELS: Readonly<Record<string, string>> = {
    europe: "Europe",
    asia: "Asia",
    america: "America",
    oceania: "Oceania",
    africa: "Africa",
};

const DEF_TOP_KEYS = [
    "scotland",
    "england",
    "wales",
    "northern ireland",
    "ireland",
    "united states of america",
    "japan",
    "spain",
    "argentina"
] as const;

export class locApi {
    private readonly selEl: HTMLSelectElement;
    private readonly flagEl: HTMLElement;
    private readonly dataUrl: string;
    private readonly flagsUrl: string;
    private readonly topKeys: readonly string[];
    private readonly regOrder: readonly string[];
    private readonly regLabels: Readonly<Record<string, string>>;
    private readonly phLabel: string;
    private readonly emptyLabel: string;

    private data: Regions | null = null;
    private onChg: (() => void) | null = null;
    private pickerEl: HTMLDivElement | null = null;
    private pickerBtn: HTMLButtonElement | null = null;

    /**
     * stores the bits and defaults, not much else
     * @param {Opts} options
     * @returns {void}
     */
    public constructor(options: Opts) {
        this.selEl = options.selectElement;
        this.flagEl = options.flagElement;
        this.dataUrl = options.locationsUrl;
        this.flagsUrl = noSlash(options.flagsBaseUrl);
        this.topKeys = options.mostFrequentKeys ?? DEF_TOP_KEYS;
        this.regOrder = options.regionOrder ?? DEF_REG_ORDER;
        this.regLabels = options.regionLabels ?? DEF_REG_LABELS;
        this.phLabel = options.placeholderLabel ?? "Location (Optional)";
        this.emptyLabel = options.emptyFlagLabel ?? "Select a location";
    }

    /**
     * load data, make options, wire it
     * then paints current flag if any
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        this.data = await this.fetchDat();
        this.fill();
        this.bind();
        this.syncPick();

        if (!this.selEl.value) {
            this.clearFlag();
            return;
        }

        await this.show(this.selEl.value);
    }

    /**
     * tidy the picker, mostly
     * @returns {void}
     */
    public destroy(): void {
        if (this.onChg) {
            this.selEl.removeEventListener("change", this.onChg);
            this.onChg = null;
        }

        this.pickerEl?.remove();
        this.pickerEl = null;
        this.pickerBtn = null;
        this.selEl.classList.remove("comment-location-native");

        this.data = null;
    }

    /**
     * reloads json and tries not to lose the value
     * @returns {Promise<void>}
     */
    public async reload(): Promise<void> {
        const selKey = this.selEl.value;

        this.data = await this.fetchDat();
        this.fill();

        if (!selKey) {
            this.clearFlag();
            this.syncPick();
            return;
        }

        const row = this.find(selKey);
        if (!row) {
            this.clearFlag();
            this.syncPick();
            return;
        }

        this.selEl.value = selKey;
        this.syncPick();
        await this.show(selKey);
    }

    /**
     * set it from code, empty means clear
     * @param {string} locationKey
     * @returns {Promise<void>}
     */
    public async setValue(locationKey: string): Promise<void> {
        this.ndInit();

        if (!locationKey) {
            this.selEl.value = "";
            this.clearFlag();
            this.syncPick();
            return;
        }

        const row = this.find(locationKey);
        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        this.selEl.value = locationKey;
        this.syncPick();
        await this.show(locationKey);
    }

    /**
     * current key
     * @returns {string}
     */
    public getValue(): string {
        return this.selEl.value;
    }

    /**
     * gets the row-ish public shape
     * @param {string} locationKey
     * @returns {Loc | null}
     */
    public getLocation(locationKey: string): Loc | null {
        this.ndInit();

        const row = this.find(locationKey);
        if (!row) return null;

        return {
            localName: row.local_name,
            flag: row.emoji
        };
    }

    /**
     * blank flag display
     * @returns {void}
     */
    public clearFlag(): void {
        this.flagEl.replaceChildren();
        this.flagEl.textContent = this.emptyLabel;
    }

    /**
     * redraw the current flag thing
     * @returns {Promise<FlagRes | null>}
     */
    public async renderCurrentFlag(): Promise<FlagRes | null> {
        const locationKey = this.selEl.value;

        this.syncPick();

        if (!locationKey) {
            this.clearFlag();
            return null;
        }

        const row = this.find(locationKey);
        if (!row) {
            this.clearFlag();
            return null;
        }

        return this.show(locationKey);
    }

    /**
     * png url for a loc
     * @param {string} locationKey
     * @returns {string}
     */
    public getFlagUrl(locationKey: string): string {
        this.ndInit();

        const row = this.find(locationKey);
        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        const code = flagCode(row.emoji);
        return `${this.flagsUrl}/${code}.png`;
    }

    /**
     * label for ui, nothing fancy
     * @param {string} locationKey
     * @returns {string}
     */
    public getLabel(locationKey: string): string {
        this.ndInit();

        const row = this.find(locationKey);
        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        return mkLbl(locationKey, row.local_name);
    }

    /**
     * wire change listener again
     * @returns {void}
     */
    private bind(): void {
        if (this.onChg) {
            this.selEl.removeEventListener("change", this.onChg);
        }

        this.onChg = () => {
            this.syncPick();
            void this.renderCurrentFlag();
        };

        this.selEl.addEventListener("change", this.onChg);
    }

    /**
     * fetch and clean the json
     * @returns {Promise<Regions>}
     */
    private async fetchDat(): Promise<Regions> {
        const response = await fetch(this.dataUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${this.dataUrl} (${response.status})`);
        }

        const value: unknown = await response.json();

        if (!helpers.isRecord(value)) {
            throw new Error("Locations JSON must contain an object at the root");
        }

        return normDat(value);
    }

    /**
     * make the select again
     * @returns {void}
     */
    private fill(): void {
        this.ndInit();

        this.selEl.replaceChildren();
        this.addPh();
        this.addTop();
        this.addRegs();
        this.rndPick();
    }

    /**
     * placeholder option
     * @returns {void}
     */
    private addPh(): void {
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = this.phLabel;
        this.selEl.appendChild(ph);
    }

    /**
     * top group, if anything matches
     * @returns {void}
     */
    private addTop(): void {
        const items = this.topKeys
            .map((locationKey) => {
                const row = this.find(locationKey);
                if (!row) return null;

                return {
                    locationKey,
                    row
                };
            })
            .filter(notNull);

        if (items.length === 0) {
            return;
        }

        const group = document.createElement("optgroup");
        group.label = "Most Frequent";

        for (const item of items) {
            const option = document.createElement("option");
            option.value = item.locationKey;
            option.textContent = mkLbl(item.locationKey, item.row.local_name);
            group.appendChild(option);
        }

        this.selEl.appendChild(group);
    }

    /**
     * region groups, skips weird stuff
     * @returns {void}
     */
    private addRegs(): void {
        if (!this.data) {
            return;
        }

        for (const regName of this.regOrder) {
            const reg = this.data[regName];
            if (!helpers.isRecord(reg)) {
                continue;
            }

            const entries = Object.entries(reg)
                .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "en"));

            if (entries.length === 0) {
                continue;
            }

            const group = document.createElement("optgroup");
            group.label = this.regLabels[regName] ?? regName;

            for (const [locationKey, row] of entries) {
                const option = document.createElement("option");
                option.value = locationKey;
                option.textContent = mkLbl(locationKey, row.local_name);
                group.appendChild(option);
            }

            this.selEl.appendChild(group);
        }
    }

    /**
     * make the fake dropdown bit
     * @returns {void}
     */
    private rndPick(): void {
        const parent = this.selEl.parentElement;
        if (!parent) return;

        this.pickerEl?.remove();
        this.selEl.classList.add("comment-location-native");

        const picker = document.createElement("div");
        picker.className = "comment-location-dropdown";

        const button = document.createElement("button");
        button.id = `${this.selEl.id}-dropdown-button`;
        button.type = "button";
        button.className = "comment-location-dropdown__button";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-controls", `${this.selEl.id}-dropdown-menu`);

        const menu = document.createElement("div");
        menu.id = `${this.selEl.id}-dropdown-menu`;
        menu.className = "comment-location-dropdown__content";
        menu.setAttribute("role", "listbox");

        this.fillMenu(menu);

        picker.append(button, menu);

        if (this.flagEl.parentElement === parent) {
            parent.insertBefore(picker, this.flagEl);
        } else {
            parent.appendChild(picker);
        }

        this.pickerEl = picker;
        this.pickerBtn = button;

        this.syncPick();
    }

    /**
     * menu items from native select
     * @param {HTMLDivElement} menu
     * @returns {void}
     */
    private fillMenu(menu: HTMLDivElement): void {
        for (const child of Array.from(this.selEl.children)) {
            if (child instanceof HTMLOptionElement) {
                menu.appendChild(this.mkPickItm(child));
                continue;
            }

            if (!(child instanceof HTMLOptGroupElement)) {
                continue;
            }

            const group = document.createElement("div");
            group.className = "comment-location-dropdown__group";
            group.textContent = child.label;
            group.setAttribute("aria-hidden", "true");
            menu.appendChild(group);

            for (const option of Array.from(child.children)) {
                if (!(option instanceof HTMLOptionElement)) {
                    continue;
                }

                menu.appendChild(this.mkPickItm(option));
            }
        }
    }

    /**
     * one fake dropdown item
     * @param {HTMLOptionElement} option
     * @returns {HTMLButtonElement}
     */
    private mkPickItm(option: HTMLOptionElement): HTMLButtonElement {
        const item = document.createElement("button");

        item.type = "button";
        item.className = "comment-location-dropdown__item";
        item.textContent = option.textContent || this.phLabel;
        item.dataset.locationKey = option.value;
        item.setAttribute("role", "option");

        if (!option.value) {
            item.classList.add("comment-location-dropdown__item--placeholder");
        }

        item.addEventListener("click", () => {
            this.pickVal(option.value);
        });

        return item;
    }

    /**
     * select from fake dropdown
     * @param {string} locationKey
     * @returns {void}
     */
    private pickVal(locationKey: string): void {
        this.selEl.value = locationKey;
        this.selEl.dispatchEvent(new Event("change", { bubbles: true }));

        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    }

    /**
     * make fake dropdown match native one
     * @returns {void}
     */
    private syncPick(): void {
        if (this.pickerBtn) {
            this.pickerBtn.textContent = this.selLbl();
        }

        this.pickerEl
            ?.querySelectorAll<HTMLButtonElement>(".comment-location-dropdown__item")
            .forEach((item) => {
                const isCurrent = item.dataset.locationKey === this.selEl.value;

                item.classList.toggle("is-current", isCurrent);
                item.setAttribute("aria-selected", isCurrent ? "true" : "false");
            });
    }

    /**
     * visible selected label
     * @returns {string}
     */
    private selLbl(): string {
        const selected = Array
            .from(this.selEl.options)
            .find((option) => option.value === this.selEl.value);

        const label = selected?.textContent?.trim() ?? "";
        return label.length > 0 ? label : this.phLabel;
    }

    /**
     * find row in cache
     * @param {string} locationKey
     * @returns {Row | null}
     */
    private find(locationKey: string): Row | null {
        if (!this.data) {
            return null;
        }

        for (const regName of this.regOrder) {
            const reg = this.data[regName];
            if (!helpers.isRecord(reg)) {
                continue;
            }

            const row = reg[locationKey];
            if (isRow(row)) {
                return row;
            }
        }

        return null;
    }

    /**
     * show a flag, checks png first
     * @param {string} locationKey
     * @returns {Promise<FlagRes>}
     */
    private async show(locationKey: string): Promise<FlagRes> {
        const row = this.find(locationKey);

        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

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
            flagUrl: url
        };
    }

    /**
     * complain if init didnt happen
     * @returns {void}
     */
    private ndInit(): void {
        if (this.data) {
            return;
        }

        throw new Error("LocationApi has not been initialised. Call init() first.");
    }
}

/**
 * factory, tiny thing
 * @param {Opts} options
 * @returns {locApi}
 */
export function createLocationApi(options: Opts): locApi {
    return new locApi(options);
}

/**
 * checks the asset exists
 * @param {string} assetUrl
 * @returns {Promise<void>}
 */
async function needAst(assetUrl: string): Promise<void> {
    const response = await fetch(assetUrl);

    if (response.ok) {
        return;
    }

    throw new Error(`Failed to fetch ${assetUrl} (${response.status})`);
}

/**
 * clean up raw data into rows we can use
 * skips odd stuff
 * @param {unknown} value
 * @returns {Regions}
 */
function normDat(value: unknown): Regions {
    if (!helpers.isRecord(value)) {
        throw new Error("Locations JSON must contain an object at the root");
    }

    const data: Regions = {};

    for (const [regName, regValue] of Object.entries(value)) {
        if (!helpers.isRecord(regValue)) {
            continue;
        }

        const reg: Record<string, Row> = {};

        for (const [locationKey, locationValue] of Object.entries(regValue)) {
            if (!isRow(locationValue)) {
                continue;
            }

            reg[locationKey] = locationValue;
        }

        data[regName] = reg;
    }

    return data;
}

/**
 * label, with local name if needed
 * @param {string} locationKey
 * @param {string} localName
 * @returns {string}
 */
function mkLbl(locationKey: string, localName: string): string {
    const englishName = fmtEng(locationKey);

    return sameNm(englishName, localName)
        ? englishName
        : `${englishName} (${localName})`;
}

/**
 * compare names, roughly
 * @param {string} englishName
 * @param {string} localName
 * @returns {boolean}
 */
function sameNm(englishName: string, localName: string): boolean {
    return normNm(englishName) === normNm(localName);
}

/**
 * name cleanup for compareing
 * @param {string} value
 * @returns {string}
 */
function normNm(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase("en");
}

/**
 * dumb title-ish case from key
 * @param {string} value
 * @returns {string}
 */
function fmtEng(value: string): string {
    return value
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

/**
 * emoji flag to code string
 * @param {string} flag
 * @returns {string}
 */
function flagCode(flag: string): string {
    const symbols = Array.from(flag);

    if (symbols.length === 0) {
        throw new Error("Flag value is empty");
    }

    return symbols
        .map((symbol) => regAsc(symbol))
        .join("")
        .toLowerCase();
}

/**
 * regional symbol to ascii letter
 * @param {string} symbol
 * @returns {string}
 */
function regAsc(symbol: string): string {
    const codePoint = symbol.codePointAt(0);

    if (!codePoint) {
        throw new Error(`Invalid regional indicator symbol: ${symbol}`);
    }

    const asciiCode = codePoint - 127397;

    if (asciiCode < 65 || asciiCode > 90) {
        throw new Error(`Symbol is not a regional indicator letter: ${symbol}`);
    }

    return String.fromCharCode(asciiCode);
}

/**
 * one slash off the end
 * @param {string} value
 * @returns {string}
 */
function noSlash(value: string): string {
    return value.endsWith("/")
        ? value.slice(0, -1)
        : value;
}

/**
 * row shape, loose check
 * @param {unknown} value
 * @returns {value is Row}
 */
function isRow(value: unknown): value is Row {
    return helpers.isRecord(value)
        && typeof value.emoji === "string"
        && typeof value.local_name === "string";
}

/**
 * removes nulls from maps
 * @param {T | null} value
 * @returns {value is T}
 */
function notNull<T>(value: T | null): value is T {
    return value !== null;
}
