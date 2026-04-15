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
    "africa",
    "america",
    "asia",
    "europe",
    "oceania"
] as const;

const DEF_REG_LABELS: Readonly<Record<string, string>> = {
    africa: "Africa",
    america: "America",
    asia: "Asia",
    europe: "Europe",
    oceania: "Oceania"
};

const DEF_TOP_KEYS = [
    "scotland",
    "england",
    "wales",
    "northern ireland",
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

    /**
     * Wires the little api wrapper up.
     * mostly just stores refs and defaults really.
     * @param {Opts} options
     * @returns {void}
     */
    public constructor(options: Opts) {
        this.selEl = options.selectElement;
        this.flagEl = options.flagElement;
        this.dataUrl = options.locationsUrl;
        this.flagsUrl = trimSlash(options.flagsBaseUrl);
        this.topKeys = options.mostFrequentKeys ?? DEF_TOP_KEYS;
        this.regOrder = options.regionOrder ?? DEF_REG_ORDER;
        this.regLabels = options.regionLabels ?? DEF_REG_LABELS;
        this.phLabel = options.placeholderLabel ?? "Select a location";
        this.emptyLabel = options.emptyFlagLabel ?? "Select a location";
    }

    /**
     * Loads the dataset, fills the select, hooks the change event.
     * then paints the current flag if there is already a value sat there.
     * @returns {Promise<void>}
     */
    public async init(): Promise<void> {
        this.data = await this.fetchData();
        this.fill();
        this.bind();

        if (!this.selEl.value) {
            this.clearFlag();
            return;
        }

        await this.show(this.selEl.value);
    }

    /**
     * Removes listeners and drops the cached dataset.
     * small tidy-up job.
     * @returns {void}
     */
    public destroy(): void {
        if (this.onChg) {
            this.selEl.removeEventListener("change", this.onChg);
            this.onChg = null;
        }

        this.data = null;
    }

    /**
     * Re-fetches the locations json and rebuilds the dropdown.
     * keeps the current value if it still exists.
     * @returns {Promise<void>}
     */
    public async reload(): Promise<void> {
        const selKey = this.selEl.value;

        this.data = await this.fetchData();
        this.fill();

        if (!selKey) {
            this.clearFlag();
            return;
        }

        const row = this.find(selKey);
        if (!row) {
            this.clearFlag();
            return;
        }

        this.selEl.value = selKey;
        await this.show(selKey);
    }

    /**
     * Sets a location in code and updates the flag too.
     * blank value clears it.
     * @param {string} locationKey
     * @returns {Promise<void>}
     */
    public async setValue(locationKey: string): Promise<void> {
        this.needInit();

        if (!locationKey) {
            this.selEl.value = "";
            this.clearFlag();
            return;
        }

        const row = this.find(locationKey);
        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        this.selEl.value = locationKey;
        await this.show(locationKey);
    }

    /**
     * Gives back the currently selected key.
     * @returns {string}
     */
    public getValue(): string {
        return this.selEl.value;
    }

    /**
     * Looks up one location from the loaded dataset.
     * returns null if it is missing.
     * @param {string} locationKey
     * @returns {Loc | null}
     */
    public getLocation(locationKey: string): Loc | null {
        this.needInit();

        const row = this.find(locationKey);
        if (!row) return null;

        return {
            localName: row.local_name,
            flag: row.emoji
        };
    }

    /**
     * Clears whatever is being shown in the flag slot.
     * @returns {void}
     */
    public clearFlag(): void {
        this.flagEl.replaceChildren();
        this.flagEl.textContent = this.emptyLabel;
    }

    /**
     * Re-renders the flag for the current select value.
     * null when there is no value to show.
     * @returns {Promise<FlagRes | null>}
     */
    public async renderCurrentFlag(): Promise<FlagRes | null> {
        const locationKey = this.selEl.value;

        if (!locationKey) {
            this.clearFlag();
            return null;
        }

        return this.show(locationKey);
    }

    /**
     * Resolves the png url for a given location flag.
     * @param {string} locationKey
     * @returns {string}
     */
    public getFlagUrl(locationKey: string): string {
        this.needInit();

        const row = this.find(locationKey);
        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        const code = toFlagCode(row.emoji);
        return `${this.flagsUrl}/${code}.png`;
    }

    /**
     * Builds the user-facing label for one location.
     * @param {string} locationKey
     * @returns {string}
     */
    public getLabel(locationKey: string): string {
        this.needInit();

        const row = this.find(locationKey);
        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        return mkLbl(locationKey, row.local_name);
    }

    /**
     * Hooks the select change event.
     * if one was there already it gets replaced.
     * @returns {void}
     */
    private bind(): void {
        if (this.onChg) {
            this.selEl.removeEventListener("change", this.onChg);
        }

        this.onChg = () => {
            void this.renderCurrentFlag();
        };

        this.selEl.addEventListener("change", this.onChg);
    }

    /**
     * Fetches the raw locations json and normalises it.
     * @returns {Promise<Regions>}
     */
    private async fetchData(): Promise<Regions> {
        const response = await fetch(this.dataUrl);

        if (!response.ok) {
            throw new Error(`Failed to fetch ${this.dataUrl} (${response.status})`);
        }

        const value: unknown = await response.json();

        if (!helpers.isRecord(value)) {
            throw new Error("Locations JSON must contain an object at the root");
        }

        return normData(value);
    }

    /**
     * Rebuilds the dropdown from scratch.
     * @returns {void}
     */
    private fill(): void {
        this.needInit();

        this.selEl.replaceChildren();
        this.addPh();
        this.addTop();
        this.addRegs();
    }

    /**
     * Adds the empty placeholder option at the top.
     * @returns {void}
     */
    private addPh(): void {
        const ph = document.createElement("option");
        ph.value = "";
        ph.textContent = this.phLabel;
        this.selEl.appendChild(ph);
    }

    /**
     * Adds the "Most Frequent" optgroup if any of those keys exist.
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
     * Adds all the regional optgroups in the configured order.
     * skips empty or rubbish regions.
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
     * Finds one row in the cached dataset.
     * null if missing.
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
     * Renders a specific flag into the host element.
     * also checks the asset exists before swapping it in.
     * @param {string} locationKey
     * @returns {Promise<FlagRes>}
     */
    private async show(locationKey: string): Promise<FlagRes> {
        const row = this.find(locationKey);

        if (!row) {
            throw new Error(`Location not found in dataset: ${locationKey}`);
        }

        const code = toFlagCode(row.emoji);
        const url = `${this.flagsUrl}/${code}.png`;

        await needAsset(url);

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
     * Throws if init was never called.
     * saves the rest of the class from repeating itself too much.
     * @returns {void}
     */
    private needInit(): void {
        if (this.data) {
            return;
        }

        throw new Error("LocationApi has not been initialised. Call init() first.");
    }
}

/**
 * Tiny factory for the location api.
 * @param {Opts} options
 * @returns {locApi}
 */
export function createLocationApi(options: Opts): locApi {
    return new locApi(options);
}

/**
 * Makes sure an asset URL actually exists.
 * throws if the fetch comes back bad.
 * @param {string} assetUrl
 * @returns {Promise<void>}
 */
async function needAsset(assetUrl: string): Promise<void> {
    const response = await fetch(assetUrl);

    if (response.ok) {
        return;
    }

    throw new Error(`Failed to fetch ${assetUrl} (${response.status})`);
}

/**
 * Normalises the raw dataset shape into the typed one we actually use.
 * anything weird just gets skipped.
 * @param {unknown} value
 * @returns {Regions}
 */
function normData(value: unknown): Regions {
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
 * Builds the visible label for one location option.
 * english name first, local name in brackets if it differs.
 * @param {string} locationKey
 * @param {string} localName
 * @returns {string}
 */
function mkLbl(locationKey: string, localName: string): string {
    const englishName = fmtEng(locationKey);

    return sameName(englishName, localName)
        ? englishName
        : `${englishName} (${localName})`;
}

/**
 * Checks if two names are basically the same after normalising.
 * @param {string} englishName
 * @param {string} localName
 * @returns {boolean}
 */
function sameName(englishName: string, localName: string): boolean {
    return normName(englishName) === normName(localName);
}

/**
 * Normalises a name so comparisons are less fussy.
 * @param {string} value
 * @returns {string}
 */
function normName(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase("en");
}

/**
 * Turns a dataset key into a nicer english label.
 * pretty simple title-casing thing.
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
 * Turns a flag emoji into a lowercase country code-ish string.
 * @param {string} flag
 * @returns {string}
 */
function toFlagCode(flag: string): string {
    const symbols = Array.from(flag);

    if (symbols.length === 0) {
        throw new Error("Flag value is empty");
    }

    return symbols
        .map((symbol) => regToAsc(symbol))
        .join("")
        .toLowerCase();
}

/**
 * Converts one regional indicator symbol into its ASCII letter.
 * @param {string} symbol
 * @returns {string}
 */
function regToAsc(symbol: string): string {
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
 * Trims one trailing slash off a url-like string.
 * just one, not a full cleanup mission.
 * @param {string} value
 * @returns {string}
 */
function trimSlash(value: string): string {
    return value.endsWith("/")
        ? value.slice(0, -1)
        : value;
}

/**
 * Checks whether a value looks like a location row.
 * @param {unknown} value
 * @returns {value is Row}
 */
function isRow(value: unknown): value is Row {
    return helpers.isRecord(value)
        && typeof value.emoji === "string"
        && typeof value.local_name === "string";
}

/**
 * Filters null out of arrays.
 * nothing more exotic than that.
 * @param {T | null} value
 * @returns {value is T}
 */
function notNull<T>(value: T | null): value is T {
    return value !== null;
}