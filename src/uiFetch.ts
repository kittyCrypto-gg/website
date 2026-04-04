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
    reset: string;
    done: string;
}>;

export type EffectsUiConfig = Readonly<{
    icon: string;
    iconPath?: string;
    title: string;
    modal: EffectsUiModalConfig;
}>;

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
    windows?: Readonly<Record<string, WindowJsonDefinition>>;
}>;

let uiDataPromise: Promise<MainJson> | null = null;

/**
 * @param {string} [src="../data/main.json"] Path to the UI JSON file.
 * @returns {Promise<MainJson>} Shared UI data.
 */
export async function fetchUiData(src = "../data/main.json"): Promise<MainJson> {
    if (!uiDataPromise) {
        uiDataPromise = (async (): Promise<MainJson> => {
            const response = await fetch(src);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return (await response.json()) as MainJson;
        })();
    }

    try {
        return await uiDataPromise;
    } catch (error: unknown) {
        uiDataPromise = null;
        throw error;
    }
}