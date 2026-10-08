import { activateImageNavigation } from "../reader.tsx";
import type { ChapterImageInfo } from "./types.ts";
import { ReaderToggleStructure } from "./structure.ts";

export abstract class ReaderToggleContent extends ReaderToggleStructure {
	/**
	 * @param {unknown} doc - Document clone to sanitise for Readability parsing.
	 * @returns {void} Removes tooltip behaviour for reader mode.
	 * - Normal tooltips: unwrap trigger, drop tooltip content.
	 * - Translation tooltips: unwrap translation content, drop trigger.
	 */
	parseTooltips(doc: unknown): void {
		if (!(doc instanceof Document)) return;

		const renderedTooltips = Array.from(doc.querySelectorAll<HTMLElement>(".tooltip"));
		for (const tooltip of renderedTooltips) {
			const translationContent = tooltip.querySelector<HTMLElement>(".tooltip-content.translation");
			if (translationContent && (translationContent.textContent || "").trim()) {
				const frag = doc.createDocumentFragment();
				for (const n of Array.from(translationContent.childNodes)) {
					frag.appendChild(n.cloneNode(true));
				}
				tooltip.replaceWith(frag);
				continue;
			}

			const trigger = tooltip.querySelector<HTMLElement>(".tooltip-trigger");
			if (!trigger) {
				tooltip.remove();
				continue;
			}

			const frag = doc.createDocumentFragment();
			for (const n of Array.from(trigger.childNodes)) {
				frag.appendChild(n.cloneNode(true));
			}

			tooltip.replaceWith(frag);
		}

		const rawTooltips = Array.from(doc.getElementsByTagName("tooltip"));
		for (const tooltip of rawTooltips) {
			const contentEl = Array.from(tooltip.children).find(
				(n) => n.tagName.toLowerCase() === "content"
			) as Element | undefined;

			if (!contentEl) {
				tooltip.remove();
				continue;
			}

			const translationAttr = (contentEl.getAttribute("translation") || "").trim().toLowerCase();
			const isTranslation = translationAttr === "true";
			const nodes = isTranslation
				? Array.from(contentEl.childNodes)
				: [];
			const emptyTranslation =
				isTranslation &&
				(nodes.length === 0 || (contentEl.textContent || "").trim() === "");

			if (emptyTranslation) {
				tooltip.remove();
				continue;
			}

			if (isTranslation) {
				const frag = doc.createDocumentFragment();

				for (const n of nodes) {
					frag.appendChild(n.cloneNode(true));
				}

				tooltip.replaceWith(frag);
				continue;
			}

			const triggerNodes = Array.from(tooltip.childNodes).filter((n) => n !== contentEl);
			if (triggerNodes.length === 0) {
				tooltip.remove();
				continue;
			}

			const frag = doc.createDocumentFragment();
			for (const n of triggerNodes) {
				frag.appendChild(n.cloneNode(true));
			}

			tooltip.replaceWith(frag);
		}
	}

	/**
	 * @param {Document | Element} root - Root node to scan for chapter images.
	 * @returns {ChapterImageInfo[]}
	 */
	storeChapterImages(root: Document | Element = document): ChapterImageInfo[] {
		return Array.from(root.querySelectorAll<HTMLImageElement>("img.chapter-image")).map((img) => ({
			src: img.currentSrc || img.src,
			alt: img.alt,
			hasContainer: !!img.closest(".chapter-image-container")
		}));
	}

	/**
	 * @returns {Promise<void>}
	 */
	async ensureReadabilityLoaded(): Promise<void> {
		if (window.Readability) return;

		await new Promise<void>((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.min.js";
			script.onload = () => resolve();
			script.onerror = () => reject(new Error("Failed to load Readability"));
			document.head.appendChild(script);
		});
	}

	/**
	 * @param {unknown} list - Stored image metadata list.
	 * @param {Document | Element} root - Root element where images should be restored.
	 * @returns {void}
	 */
	restoreChapterImages(list: unknown, root: Document | Element): void {
		if (!Array.isArray(list) || !root) return;
		const imgs = root.querySelectorAll<HTMLImageElement>("img");

		(list as ReadonlyArray<ChapterImageInfo>).forEach(({ src, alt, hasContainer }) => {
			const img = Array.from(imgs).find((i) => (i.currentSrc || i.src) === src && i.alt === alt);
			if (!img) return;

			img.classList.add("chapter-image");

			if (hasContainer && !img.closest(".chapter-image-container")) {
				const wrapper =
					(root as unknown as { createElement?: (tag: string) => HTMLElement }).createElement?.("div") ||
					document.createElement("div");
				wrapper.className = "chapter-image-container";
				img.replaceWith(wrapper);
				wrapper.appendChild(img);
			}
		});

		activateImageNavigation(document);
	}

	/**
	 * @param {unknown} doc - Document clone to sanitise for Readability parsing.
	 * @returns {void} Keeps only From/To/Subject and the email body (without signature) for reader mode.
	 */
	parseEmails(doc: unknown): void {
		if (!(doc instanceof Document)) return;

		const cards = Array.from(doc.querySelectorAll<HTMLElement>(".email-card"));
		if (cards.length === 0) return;

		const getLabel = (row: Element): string =>
			(row.querySelector(".email-label")?.textContent || "").trim().toLowerCase();

		const getNameFor = (card: Element, labelLower: string): string => {
			const rows = Array.from(card.querySelectorAll<HTMLElement>(".email-row"));
			const row = rows.find((r) => getLabel(r) === labelLower);
			if (!row) return "";

			const nameEl = row.querySelector<HTMLElement>(".email-name")
				|| row.querySelector<HTMLElement>(".email-value");
			return (nameEl?.textContent || "").trim();
		};

		const getSubject = (card: Element): string =>
			(card.querySelector<HTMLElement>(".email-subject-text")?.textContent || "").trim();

		const splitParagraphs = (text: string): string[] => {
			const t = (text || "").replace(/\r\n?/g, "\n");
			return t
				.split(/\n+/g)
				.map((p) => p.replace(/\s+/g, " ").trim())
				.filter(Boolean);
		};

		for (const card of cards) {
			const fromName = getNameFor(card, "from");
			const toName = getNameFor(card, "to");
			const subject = getSubject(card);

			const contentClone = card.querySelector<HTMLElement>(".email-content")?.cloneNode(true) as HTMLElement | null;
			if (contentClone) {
				contentClone.querySelectorAll(".email-signature, .email-signature-sep").forEach((n) => n.remove());
			}

			const bodyRaw = contentClone ? (contentClone.innerText || contentClone.textContent || "") : "";
			const bodyParas = splitParagraphs(bodyRaw);

			const replacement = doc.createElement("div");
			replacement.className = "reader-email";

			const addLine = (label: string, value: string): void => {
				if (!value) return;
				const p = doc.createElement("p");
				p.textContent = `${label}: ${value}`;
				replacement.appendChild(p);
			};

			addLine("From", fromName);
			addLine("To", toName);
			addLine("Subject", subject);

			for (const para of bodyParas) {
				const p = doc.createElement("p");
				p.textContent = para;
				replacement.appendChild(p);
			}

			const wrapper = card.closest<HTMLElement>(".email-wrapper") ?? card;
			wrapper.replaceWith(replacement);
		}

		doc.querySelectorAll(".email-actions-bar").forEach((n) => n.remove());
	}

}
