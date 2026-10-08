import * as helpers from "../helpers.ts";
import { showToggleVisual } from "../toggleIcons.ts";
import { readerIsFullyLoaded } from "../reader.tsx";
import { getParams } from "../reader.tsx";
import { injectBookmarksIntoHTML } from "../reader.tsx";
import { READER_TOGGLE_ICON_SPEC, waitForReaderToggle } from "./types.ts";
import type { ReaderModeOptions } from "./types.ts";
import { ReaderToggleContent } from "./readerMode/content.ts";
export type { ReaderModeOptions } from "./readerMode/types.ts";

export class ReaderToggle extends ReaderToggleContent {
	/**
	 * @param {ReaderModeOptions} [options={}] - Reader mode keep/focus configuration.
	 * @returns {Promise<boolean>} True when the toggle was found and initialised.
	 */
	static async setup(options: ReaderModeOptions = {}): Promise<boolean> {
		if (document.readyState === "loading") {
			await helpers.waitForDomReady();
		}

		const readerToggle = await waitForReaderToggle(
			document.getElementById("reader-toggle")
		);

		if (!(readerToggle instanceof HTMLButtonElement)) return false;

		const instance = new ReaderToggle(readerToggle, options);
		instance.syncButtonState();

		if (!readerToggle.__readerListener) {
			readerToggle.addEventListener("click", instance.handleToggleClick);
			readerToggle.__readerListener = true;
		}

		if (window.location.search.includes("reader=true")) {
			await readerIsFullyLoaded();

			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					void instance.enableReaderMode();
				});
			});
		}

		return true;
	}

	/**
	 * @returns {Promise<void>} Enables reader mode by parsing the current document with Readability.
	 */
	async enableReaderMode(): Promise<void> {
		if (this.readerActive) return;

		const imgArray = this.storeChapterImages(document);
		const { storyPath, chapter } = getParams();

		await this.ensureReadabilityLoaded();

		const articleElem = document.querySelector<HTMLElement>("article#reader, main article, article");
		if (!articleElem) {
			alert("No article found for reader mode.");
			return;
		}

		if (!this.originalNodeClone) {
			this.originalNodeClone = articleElem.cloneNode(true);
		}

		const docClone = document.cloneNode(true) as Document;
		this.parseTooltips(docClone);
		this.parseEmails(docClone);

		const ReadabilityCtor = window.Readability;
		if (!ReadabilityCtor) return;

		const reader = new ReadabilityCtor(docClone);
		const parsed = reader.parse();
		if (!(parsed && parsed.content)) return;

		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(parsed.content, "text/html");

		const htmlContent = storyPath
			? await injectBookmarksIntoHTML(parsedDoc.body.innerHTML, storyPath, chapter)
			: parsedDoc.body.innerHTML;

		articleElem.innerHTML = htmlContent;
		this.restoreChapterImages(imgArray, articleElem);

		const articleObj = document.getElementById("reader");
		if (articleObj) {
			articleObj.classList.add("reader-container");
		}

		const focusRoot = this.resolveFocusRoot(articleElem);
		const keepRoots = this.collectKeepRoots(focusRoot);

		document.body.classList.add("reader-mode");
		this.applyReaderShell(focusRoot, keepRoots);

		const url = new URL(window.location.href);
		if (!url.searchParams.has("reader")) {
			url.searchParams.set("reader", "true");
			window.history.pushState({}, "", url);
		}

		this.readerToggle.classList.add("active");
		void showToggleVisual(this.readerToggle, "disable", READER_TOGGLE_ICON_SPEC);
		this.readerActive = true;
	}

	/**
	 * @returns {Promise<void>}
	 */
	async __hardSoftReload(): Promise<void> {
		const url = new URL(window.location.href);
		url.searchParams.delete("reader");
		url.searchParams.set("_", Date.now().toString());
		window.location.replace(url.toString());
	}

	/**
	 * @returns {Promise<void>}
	 */
	async disableReaderMode(): Promise<void> {
		await this.__hardSoftReload();
	}

	/**
	 * @returns {Promise<void>}
	 */
	async handleToggleClick(): Promise<void> {
		if (this.readerActive) {
			await this.disableReaderMode();
			return;
		}

		await this.enableReaderMode();
	}
}

export const setupReaderToggle = ReaderToggle.setup;
