
import { ReaderToggleSheets } from "./sheets.ts";

export abstract class ReaderToggleStructure extends ReaderToggleSheets {
	/**
	 * @returns {Promise<void>}
	 */
	async waitForDomFlush(): Promise<void> {
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => resolve());
			});
		});
	}

	/**
	 * @param {Element} focusRoot - Root content element that should lose its window chrome.
	 * @returns {void}
	 */
	unframeManagedWindow(focusRoot: Element): void {
		const frame = focusRoot.closest<HTMLElement>(
			".window-frame, [data-window-id], [data-window-api-mounted='true']"
		);

		if (!frame) return;

		const header = frame.querySelector<HTMLElement>(":scope > .window-header");
		const body = frame.querySelector<HTMLElement>(":scope > .window-body");

		if (header) {
			header.dataset.readerModeHidden = "true";
			header.style.setProperty("display", "none", "important");
		}

		frame.dataset.readerModeUnframed = "true";
		frame.style.setProperty("display", "contents", "important");
		frame.style.setProperty("background", "transparent", "important");
		frame.style.setProperty("border", "0", "important");
		frame.style.setProperty("box-shadow", "none", "important");
		frame.style.setProperty("padding", "0", "important");
		frame.style.setProperty("margin", "0", "important");
		frame.style.setProperty("inline-size", "auto", "important");
		frame.style.setProperty("block-size", "auto", "important");
		frame.style.setProperty("width", "auto", "important");
		frame.style.setProperty("height", "auto", "important");
		frame.style.setProperty("max-width", "none", "important");
		frame.style.setProperty("max-height", "none", "important");
		frame.style.setProperty("min-width", "0", "important");
		frame.style.setProperty("min-height", "0", "important");
		frame.style.setProperty("position", "static", "important");
		frame.style.setProperty("left", "auto", "important");
		frame.style.setProperty("top", "auto", "important");
		frame.style.setProperty("overflow", "visible", "important");
		frame.style.setProperty("resize", "none", "important");
		frame.style.setProperty("z-index", "auto", "important");

		if (body) {
			body.dataset.readerModeUnframed = "true";
			body.style.setProperty("display", "contents", "important");
			body.style.setProperty("padding", "0", "important");
			body.style.setProperty("margin", "0", "important");
			body.style.setProperty("overflow", "visible", "important");
			body.style.setProperty("height", "auto", "important");
			body.style.setProperty("max-height", "none", "important");
			body.style.setProperty("min-height", "0", "important");
			body.style.setProperty("flex", "0 1 auto", "important");
		}
	}

	/**
	 * @param {readonly Element[]} keepRoots - Roots whose full subtrees must stay visible.
	 * @returns {void}
	 */
	hideEverythingExcept(keepRoots: readonly Element[]): void {
		this.purgeSheets();
		this.applyVarOverrides();

		const keepRootSet = new Set<Element>(keepRoots);
		const keepAncestorSet = new Set<Element>();

		for (const keepRoot of keepRoots) {
			let cur: Element | null = keepRoot;
			while (cur && cur !== document.body) {
				keepAncestorSet.add(cur);
				cur = cur.parentElement;
			}
		}

		/**
		 * @param {Element} container - Current container to walk.
		 * @returns {void}
		 */
		const visit = (container: Element): void => {
			for (const child of Array.from(container.children)) {
				if (keepRootSet.has(child)) {
					continue;
				}

				if (keepAncestorSet.has(child)) {
					visit(child);
					continue;
				}

				this.hideElement(child);
			}
		};

		visit(document.body);
	}

	/**
	 * @param {Element} focusRoot - Primary reading root to keep and unframe.
	 * @param {readonly Element[]} keepRoots - Additional keep roots.
	 * @returns {void}
	 */
	applyReaderShell(focusRoot: Element, keepRoots: readonly Element[]): void {
		this.unframeManagedWindow(focusRoot);
		this.hideEverythingExcept(keepRoots);
	}

}
