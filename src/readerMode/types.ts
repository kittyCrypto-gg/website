export type ChapterImageInfo = Readonly<{
	src: string;
	alt: string;
	hasContainer: boolean;
}>;

export type ReadabilityParseResult = Readonly<{
	content?: string;
}> | null;

export type ReadabilityInstance = Readonly<{
	parse: () => ReadabilityParseResult;
}>;

export type ReadabilityConstructor = new (doc: Document) => ReadabilityInstance;

export type ReaderModeKeepTarget = string | Element | null | undefined;
export type ReaderModeCssSheetTarget = string | HTMLLinkElement | HTMLStyleElement | null | undefined;
export type ReaderModeCssVarName = `--${string}`;
export type ReaderModeCssVarOverrides = Readonly<Record<ReaderModeCssVarName, string>>;

export type PurgedDomSheetEntry = Readonly<{
	kind: "dom";
	sheet: HTMLLinkElement | HTMLStyleElement;
	disabled: boolean;
}>;

export type PurgedImportSheetEntry = Readonly<{
	kind: "import";
	ownerSheet: CSSStyleSheet;
	index: number;
	cssText: string;
}>;

export type PurgedSheetEntry = PurgedDomSheetEntry | PurgedImportSheetEntry;

export type ReaderModeOptions = Readonly<{
	keep?: readonly ReaderModeKeepTarget[];
	focus?: ReaderModeKeepTarget;
	sheetPurge?: readonly ReaderModeCssSheetTarget[];
	varOverrides?: ReaderModeCssVarOverrides;
}>;

declare global {
	interface Window {
		Readability?: ReadabilityConstructor;
	}

	interface HTMLElement {
		__readerListener?: boolean;
	}
}

export const READER_TOGGLE_ICON_SPEC = {
	size: 32,
	wrapperClass: "theme-toggle-button__icon",
	svgClass: "theme-toggle-button__svg"
} as const;

export async function waitForReaderToggle(
    current: HTMLElement | null
): Promise<HTMLButtonElement | null> {
    if (current instanceof HTMLButtonElement) return current;

    return new Promise<HTMLButtonElement>((resolve) => {
        const observer = new MutationObserver(() => {
            const element = document.getElementById("reader-toggle");
            if (!(element instanceof HTMLButtonElement)) return;

            observer.disconnect();
            resolve(element);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    });
}