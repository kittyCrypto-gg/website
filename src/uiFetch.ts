export type MainMenuEntry = string | Readonly<{
    href: string;
    icon?: string;
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