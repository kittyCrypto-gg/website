import * as helpers from "../helpers.ts";

export interface Opts {
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

export interface Loc {
    localName: string;
    flag: string;
}

export interface FlagRes {
    locationKey: string;
    label: string;
    flagCode: string;
    flagUrl: string;
}

export type Regions = Record<string, Record<string, Row>>;
export type LocationSortMode = "region" | "alpha";
export type LocationEntry = Readonly<{
    locationKey: string;
    row: Row;
    region: string;
}>;

export interface Row {
    local_name: string;
    emoji: string;
}

export const DEF_REG_ORDER = ["africa", "america", "asia", "europe", "oceania"] as const;
export const DEF_REG_LABELS: Readonly<Record<string, string>> = {
    africa: "Africa",
    america: "Americas",
    asia: "Asia",
    europe: "Europe",
    oceania: "Oceania",
};


export async function needAst(assetUrl: string): Promise<void> {
    const response = await fetch(assetUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${assetUrl} (${response.status})`);
}

export function normDat(value: unknown): Regions {
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

export function mkLbl(locationKey: string, localName: string): string {
    const englishNameValue = englishName(locationKey);
    return sameNm(englishNameValue, localName)
        ? englishNameValue
        : `${englishNameValue} (${localName})`;
}

export function englishName(value: string): string {
    return fmtEng(value);
}

export function sameNm(englishNameValue: string, localName: string): boolean {
    return normNm(englishNameValue) === normNm(localName);
}

export function normNm(value: string): string {
    return value.trim().toLocaleLowerCase("en");
}

export function searchKey(value: string): string {
    return value.trim().toLocaleLowerCase("en");
}

export function fmtEng(value: string): string {
    return value
        .split(" ")
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

export function flagCode(flag: string): string {
    const symbols = Array.from(flag);
    if (!symbols.length) throw new Error("Flag value is empty");
    return symbols.map((symbol) => regAsc(symbol)).join("").toLowerCase();
}

export function regAsc(symbol: string): string {
    const codePoint = symbol.codePointAt(0);
    if (!codePoint) throw new Error(`Invalid regional indicator symbol: ${symbol}`);
    const asciiCode = codePoint - 127397;
    if (asciiCode < 65 || asciiCode > 90) throw new Error(`Symbol is not a regional indicator letter: ${symbol}`);
    return String.fromCharCode(asciiCode);
}

export function noSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function isRow(value: unknown): value is Row {
    return helpers.isRecord(value)
        && typeof value.emoji === "string"
        && typeof value.local_name === "string";
}
