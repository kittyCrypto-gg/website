import * as config from "./config.ts";

export type MainMenuEntry = string | Readonly<{
    href: string;
    icon?: string;
}>;

export type WindowJsonInitialFloatingPosition = Readonly<{
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
    initFloatPos?: WindowJsonInitialFloatingPosition;
    initClosed?: boolean;
    initMini?: boolean;
    showCloseBttn?: boolean;
    showMiniBttn?: boolean;
    showFloatBttn?: boolean;
}>;

export type WindowJsonDefinition = Readonly<{
    selector: string;
    forceFreshStateOnLoad?: boolean;
    options: WindowJsonOptions;
}>;

export type EffectsUiModalConfig = Readonly<{
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

export type EffectsUiConfig = Readonly<{
    icon: string;
    iconPath?: string;
    title: string;
    modal: EffectsUiModalConfig;
}>;

export type CrtUiModalConfig = Readonly<{
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

export type CrtUiConfig = Readonly<{
    icon: string;
    iconPath?: string;
    title: string;
    modal: CrtUiModalConfig;
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
    header: string;
    footer: string;
    themeToggle: Readonly<{ dark: string; light: string; title?: string }>;
    readerModeToggle: Readonly<{ enable: string; disable: string; title?: string }>;
    readAloudToggle: Readonly<{ enable: string; disable: string; title?: string }>;
    effects: EffectsUiConfig;
    crtUi?: CrtUiConfig;
    windows?: Readonly<Record<string, WindowJsonDefinition>>;
}>;

let uiDataPromise: Promise<MainJson> | null = null;
let ntcDataPromise: Promise<NtcJson> | null = null;

/**
 * @param {string} src JSON endpoint to fetch from.
 * @param {RequestCache} [cacheMode="default"] Cache mode for fetch. The browser loves knobs.
 * @returns {Promise<T>} Parsed JSON payload.
 */
async function fetchJson<T>(src: string, cacheMode: RequestCache = "default"): Promise<T> {
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