import * as config from "./config.ts";

export type MainMenuEntry = string | Readonly<{
    href: string;
    icon?: string;
}>;

export type MainThemeEntry = Readonly<{
    name?: string;
    location?: string;
    caller?: string;
}>;

export type windowInitPos = Readonly<{
    x: string;
    y: string;
}>;

export type WindowJsonOptions = Readonly<{
    id?: string;
    title?: string;
    launcherSrc?: string;
    mountTarget?: string;
    floatMntTrgt?: string;
    insertAtStart?: boolean;
    closedLnchrDis?: string;
    initFloat?: boolean;
    initFloatPos?: windowInitPos;
    initClosed?: boolean;
    initMini?: boolean;
    showCloseBttn?: boolean;
    showMiniBttn?: boolean;
    showFloatBttn?: boolean;
}>;

export type windowDef = Readonly<{
    selector: string;
    forceFreshStateOnLoad?: boolean;
    options: WindowJsonOptions;
}>;

export type fxUImodConf = Readonly<{
    title: string;
    lead: string;
    closeTitle: string;
    phosphorTitle: string;
    phosphorDescription: string;
    phosphorToggle: string;
    intensityLabel: string;
    phosphorHint: string;
    scanlinesTitle: string;
    scanlinesDescription: string;
    scanlinesToggle: string;
    scanlinesHint: string;
    scanlineSpeedLabel: string;
    scanlineSpeedHint: string;
    reset: string;
    done: string;
}>;

export type fxUIconf = Readonly<{
    icon: string;
    iconPath?: string;
    title: string;
    modal: fxUImodConf;
}>;

export type crtUImodConf = Readonly<{
    title: string;
    lead: string;
    closeTitle: string;
    transportTitle: string;
    presetAndFrequencyTitle: string;
    layerTogglesTitle: string;
    levelsTitle: string;
    statusTitle: string;
    presetFamilyLabel: string;
    presetPalLabel: string;
    presetNtscLabel: string;
    baseFrequencyLabel: string;
    masterLabel: string;
    scanlineLabel: string;
    humLabel: string;
    rectifierLabel: string;
    degaussLabel: string;
    collapseLabel: string;
    dischargeLabel: string;
    runningLabel: string;
    standardLabel: string;
    baseLabel: string;
    lineFrequencyLabel: string;
    retriggerDegauss: string;
    restore: string;
    none: string;
    startPrefix: string;
    stopPrefix: string;
    plotSpectrogram: string;
    plotWaveform: string;
    idleStatus: string;
    runningStatus: string;
}>;

export type crtUIconf = Readonly<{
    icon: string;
    iconPath?: string;
    title: string;
    modal: crtUImodConf;
}>;

export type ToggleVisualConfig = Readonly<{
    emoji: string;
    iconPath?: string;
    title?: string;
}>;

export type themeTglConf = Readonly<{
    dark: string;
    darkIconPath?: string;
    light: string;
    lightIconPath?: string;
    title?: string;
}>;

export type toggleConf = Readonly<{
    enable: string;
    enableIconPath?: string;
    disable: string;
    disableIconPath?: string;
    iconPath?: string;
    title?: string;
}>;

export type NtcJsonBody = Readonly<{
    notice: string;
    start: string;
    end: string;
}>;

export type NtcJsonItm = Readonly<{
    title: string;
    notice: string;
    start: string;
    end: string;
}>;

export type NtcJsonMap = Readonly<Record<string, NtcJsonBody>>;

export type NtcJson =
    | readonly NtcJsonItm[]
    | NtcJsonMap
    | Readonly<{ notices?: readonly NtcJsonItm[] | NtcJsonMap; }>;

export type MainJson = Readonly<{
    headScripts?: readonly string[];
    headerInjections?: readonly string[];
    mainMenu: Record<string, MainMenuEntry>;
    themes?: Record<string, MainThemeEntry>;
    header: string;
    footer: string;
    themeToggle: themeTglConf;
    readerModeToggle: toggleConf;
    readAloudToggle: toggleConf;
    effects: fxUIconf;
    crtUi?: crtUIconf;
    windows?: Readonly<Record<string, windowDef>>;
}>;

let uiDataPromise: Promise<MainJson> | null = null;
let ntcDataPromise: Promise<NtcJson> | null = null;

/**
 * @param {string} src JSON endpoint to fetch from.
 * @param {RequestCache} [cacheMode="default"] Cache mode for fetch. The browser loves knobs.
 * @returns {Promise<T>} Parsed JSON payload.
 */
export async function fetchJson<T>(src: string, cacheMode: RequestCache = "default"): Promise<T> {
    const response = await fetch(src, { cache: cacheMode });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return (await response.json()) as T;
}

/**
 * @param {string} [src="../data/main.json"] Path to the UI JSON file.
 * @returns {Promise<MainJson>} Shared UI data.
 */
export async function fetchUiData(src = "../data/main.json"): Promise<MainJson> {
    if (!uiDataPromise) {
        uiDataPromise = fetchJson<MainJson>(src);
    }

    try {
        return await uiDataPromise;
    } catch (error: unknown) {
        uiDataPromise = null;
        throw error;
    }
}

/**
 * @param {string} [src=config.noticeEndpoint] Path to the notices JSON endpoint.
 * @returns {Promise<NtcJson>} Shared notices payload.
 */
export async function fetchNtcsData(src = config.noticeEndpoint): Promise<NtcJson> {
    if (!ntcDataPromise) {
        ntcDataPromise = fetchJson<NtcJson>(src, "no-store");
    }

    try {
        return await ntcDataPromise;
    } catch (error: unknown) {
        ntcDataPromise = null;
        throw error;
    }
}