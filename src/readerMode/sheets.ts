import { showToggleVisual } from "../toggleIcons.ts";
import { READER_TOGGLE_ICON_SPEC } from "./types.ts";
import type { ReaderModeKeepTarget, ReaderModeCssSheetTarget, PurgedDomSheetEntry, PurgedImportSheetEntry, PurgedSheetEntry, ReaderModeOptions } from "./types.ts";

export abstract class ReaderToggleSheets {
	readerActive: boolean = false;
	originalNodeClone: Node | null = null;
	readerToggle: HTMLButtonElement;
	options: ReaderModeOptions;
	purgedSheets: PurgedSheetEntry[] = [];
	overrideSheetEl: HTMLStyleElement | null = null;

	/**
	 * @param {HTMLButtonElement} readerToggle - The toggle element used to enable/disable reader mode.
	 * @param {ReaderModeOptions} [options={}] - Reader mode keep/focus configuration.
	 * @returns {void}
	 */
	constructor(readerToggle: HTMLButtonElement, options: ReaderModeOptions = {}) {
		this.readerToggle = readerToggle;
		this.options = options;
		this.handleToggleClick = this.handleToggleClick.bind(this);
	}

	abstract handleToggleClick(): Promise<void>;

	/**
	 * @returns {void}
	 */
	syncButtonState(): void {
		if (document.body.classList.contains("reader-mode")) {
			this.readerToggle.classList.add("active");
			void showToggleVisual(this.readerToggle, "disable", READER_TOGGLE_ICON_SPEC);
			return;
		}

		this.readerToggle.classList.remove("active");
		void showToggleVisual(this.readerToggle, "enable", READER_TOGGLE_ICON_SPEC);
	}

	/**
	 * @param {ReaderModeKeepTarget} target - Selector or element to resolve.
	 * @param {ParentNode} [root=document] - Root used for selector lookup.
	 * @returns {Element[]} Resolved elements.
	 */
	resolveTarget(target: ReaderModeKeepTarget, root: ParentNode = document): Element[] {
		if (!target) return [];

		if (typeof target === "string") {
			return Array.from(root.querySelectorAll(target));
		}

		if (target instanceof Element) {
			return [target];
		}

		return [];
	}

	/**
	 * @param {string} raw - Href fragment to look for in nested @import rules.
	 * @returns {PurgedImportSheetEntry[]} Matching import-rule entries.
	 */
	resolveImportedSheets(raw: string): PurgedImportSheetEntry[] {
		const matches: PurgedImportSheetEntry[] = [];
		const seen = new Set<string>();

		/**
		 * @param {CSSStyleSheet | null | undefined} sheet - Current sheet to scan.
		 * @returns {void}
		 */
		const visit = (sheet: CSSStyleSheet | null | undefined): void => {
			if (!sheet) return;

			let rules: CSSRuleList;
			try {
				rules = sheet.cssRules;
			} catch {
				return;
			}

			for (let i = 0; i < rules.length; i += 1) {
				const rule = rules[i];
				if (!(rule instanceof CSSImportRule)) continue;

				const href = rule.href || rule.styleSheet?.href || "";
				const key = `${sheet.href || "inline"}::${i}::${href}`;

				if (href.includes(raw) && !seen.has(key)) {
					seen.add(key);
					matches.push({
						kind: "import",
						ownerSheet: sheet,
						index: i,
						cssText: rule.cssText
					});
				}

				visit(rule.styleSheet);
			}
		};

		for (const sheet of Array.from(document.styleSheets)) {
			if (!(sheet instanceof CSSStyleSheet)) continue;
			visit(sheet);
		}

		return matches;
	}

	/**
	 * @param {ReaderModeCssSheetTarget} target - Sheet identifier, selector, or element.
	 * @returns {PurgedSheetEntry[]} Matching stylesheet entries.
	 */
	resolveSheetTarget(target: ReaderModeCssSheetTarget): PurgedSheetEntry[] {
		if (!target) return [];

		if (target instanceof HTMLLinkElement || target instanceof HTMLStyleElement) {
			return [{
				kind: "dom",
				sheet: target,
				disabled: !!target.disabled
			}];
		}

		if (typeof target !== "string") return [];

		const raw = target.trim();
		if (!raw) return [];

		if (raw.startsWith("#") || raw.startsWith(".")) {
			return Array.from(document.querySelectorAll(raw))
				.filter(
					(el): el is HTMLLinkElement | HTMLStyleElement =>
						el instanceof HTMLLinkElement || el instanceof HTMLStyleElement
				)
				.map((sheet) => ({
					kind: "dom" as const,
					sheet,
					disabled: !!sheet.disabled
				}));
		}

		const links = Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel='stylesheet']"))
			.filter((link) => (link.getAttribute("href") || "").includes(raw))
			.map((sheet) => ({
				kind: "dom" as const,
				sheet,
				disabled: !!sheet.disabled
			}));

		const styles = Array.from(document.querySelectorAll<HTMLStyleElement>("style"))
			.filter((style) => (style.id || "").includes(raw))
			.map((sheet) => ({
				kind: "dom" as const,
				sheet,
				disabled: !!sheet.disabled
			}));

		const imports = this.resolveImportedSheets(raw);

		return [...links, ...styles, ...imports];
	}

	/**
	 * @param {HTMLElement} fallback - Fallback focus root.
	 * @returns {Element} Focus root for reader mode.
	 */
	resolveFocusRoot(fallback: HTMLElement): Element {
		const resolved = this.resolveTarget(this.options.focus);
		return resolved[0] ?? fallback;
	}

	/**
	 * @param {Element} focusRoot - Main reading surface.
	 * @returns {Element[]} Elements whose subtrees should remain visible.
	 */
	collectKeepRoots(focusRoot: Element): Element[] {
		const collected = new Set<Element>();

		collected.add(this.readerToggle);
		collected.add(focusRoot);

		const extraKeeps = this.options.keep ?? [];
		for (const keepTarget of extraKeeps) {
			for (const el of this.resolveTarget(keepTarget)) {
				collected.add(el);
			}
		}

		return Array.from(collected).filter((el) => el.isConnected);
	}

	/**
	 * @param {Element} el - Element to hide.
	 * @returns {void}
	 */
	hideElement(el: Element): void {
		if (!(el instanceof HTMLElement)) return;

		el.dataset.readerModeHidden = "true";
		el.style.setProperty("display", "none", "important");
	}

	/**
	 * @returns {void}
	 */
	purgeSheets(): void {
		if (this.purgedSheets.length > 0) return;

		const domSeen = new Set<HTMLLinkElement | HTMLStyleElement>();
		const importSeen = new Set<string>();
		const collected: PurgedSheetEntry[] = [];
		const targets = this.options.sheetPurge ?? [];

		for (const target of targets) {
			for (const entry of this.resolveSheetTarget(target)) {
				const isDomSheet = entry.kind === "dom";

				if (isDomSheet && domSeen.has(entry.sheet)) continue;
				if (isDomSheet) domSeen.add(entry.sheet);
				if (isDomSheet) collected.push(entry);
				if (isDomSheet) continue;

				const importKey = `${entry.ownerSheet.href || "inline"}::${entry.index}::${entry.cssText}`;
				if (importSeen.has(importKey)) continue;
				importSeen.add(importKey);
				collected.push(entry);
			}
		}

		this.purgedSheets = collected;

		const domEntries = collected.filter(
			(entry): entry is PurgedDomSheetEntry => entry.kind === "dom"
		);
		const importEntries = collected
			.filter((entry): entry is PurgedImportSheetEntry => entry.kind === "import")
			.sort((a, b) => b.index - a.index);

		for (const entry of domEntries) {
			entry.sheet.disabled = true;
		}

		for (const entry of importEntries) {
			try {
				entry.ownerSheet.deleteRule(entry.index);
			} catch {
				// Ignore sheets that cannot be modified.
			}
		}
	}

	/**
	 * @returns {void}
	 */
	applyVarOverrides(): void {
		if (this.overrideSheetEl) return;

		const entries = Object.entries(this.options.varOverrides ?? {});
		if (entries.length === 0) return;

		const cssBody = entries
			.map(([name, value]) => `  ${name}: ${value};`)
			.join("\n");

		const style = document.createElement("style");
		style.id = "reader-mode-var-overrides";
		style.textContent = `:root {\n${cssBody}\n}`;

		const footer = document.getElementById("main-footer");
		if (footer) {
			footer.appendChild(style);
		} else {
			document.body.appendChild(style);
		}

		this.overrideSheetEl = style;
	}

	/**
	 * @returns {void}
	 */
	restorePurgedSheets(): void {
		const domEntries = this.purgedSheets.filter(
			(entry): entry is PurgedDomSheetEntry => entry.kind === "dom"
		);
		const importEntries = this.purgedSheets
			.filter((entry): entry is PurgedImportSheetEntry => entry.kind === "import")
			.sort((a, b) => a.index - b.index);

		for (const entry of domEntries) {
			entry.sheet.disabled = entry.disabled;
		}

		for (const entry of importEntries) {
			try {
				entry.ownerSheet.insertRule(entry.cssText, entry.index);
			} catch {
				// Ignore sheets that cannot be restored cleanly.
			}
		}

		this.purgedSheets = [];
	}

	/**
	 * @returns {void}
	 */
	removeVarOverrides(): void {
		this.overrideSheetEl?.remove();
		this.overrideSheetEl = null;
	}

}
