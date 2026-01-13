import * as Reader from "./reader.js";

class ReaderToggle {
	readerActive = false;
	originalNodeClone = null;
	readerToggle = null;
	enableText = "";
	disableText = "";

	constructor(readerToggle) {
		this.readerToggle = readerToggle;
		this.enableText = readerToggle.getAttribute("data-enable");
		this.disableText = readerToggle.getAttribute("data-disable");
		this.handleToggleClick = this.handleToggleClick.bind(this);
	}

	static async setup() {
		if (document.readyState === "loading") {
			await new Promise(resolve =>
				document.addEventListener("DOMContentLoaded", resolve, { once: true })
			);
		}

		let readerToggle = document.getElementById("reader-toggle");
		if (!readerToggle) {
			readerToggle = await new Promise(resolve => {
				const observer = new MutationObserver(() => {
					const el = document.getElementById("reader-toggle");
					if (el) {
						observer.disconnect();
						resolve(el);
					}
				});
				observer.observe(document.body, { childList: true, subtree: true });
			});
		}

		if (!readerToggle) return false;

		const instance = new ReaderToggle(readerToggle);
		instance.syncButtonState();

		if (!readerToggle.__readerListener) {
			readerToggle.addEventListener("click", instance.handleToggleClick);
			readerToggle.__readerListener = true;
		}

		// Automatically enable reader mode if URL contains reader=true
		if (window.location.search.includes("reader=true")) {
			await Reader.readerIsFullyLoaded();
			await instance.enableReaderMode();
		}

		return true;
	}

	syncButtonState() {
		if (document.body.classList.contains("reader-mode")) {
			this.readerToggle.textContent = this.disableText;
			this.readerToggle.classList.add("active");
		} else {
			this.readerToggle.textContent = this.enableText;
			this.readerToggle.classList.remove("active");
		}
	}

	storeChapterImages(root = document) {
		return Array.from(root.querySelectorAll("img.chapter-image")).map(img => ({
			src: img.currentSrc || img.src,
			alt: img.alt,
			hasContainer: !!img.closest(".chapter-image-container")
		}));
	}

	async ensureReadabilityLoaded() {
		if (window.Readability) return;
		await new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.min.js";
			script.onload = resolve;
			script.onerror = reject;
			document.head.appendChild(script);
		});
	}

	restoreChapterImages(list, root) {
		if (!Array.isArray(list) || !root) return;
		const imgs = root.querySelectorAll("img");
		list.forEach(({ src, alt, hasContainer }) => {
			const img = Array.from(imgs).find(i =>
				(i.currentSrc || i.src) === src && i.alt === alt
			);
			if (!img) return;
			img.classList.add("chapter-image");
			if (hasContainer && !img.closest(".chapter-image-container")) {
				const wrapper = root.createElement ? root.createElement("div") : document.createElement("div");
				wrapper.className = "chapter-image-container";
				img.replaceWith(wrapper);
				wrapper.appendChild(img);
			}
		});
		Reader.activateImageNavigation(root);
	}

	sanitiseEmailsForReadability(doc) {
		if (!doc || !(doc instanceof Document)) return;

		const cards = Array.from(doc.querySelectorAll(".email-card"));
		if (cards.length === 0) return;

		const getRowValue = (card, label) => {
			const rows = Array.from(card.querySelectorAll(".email-row"));
			const row = rows.find(r => {
				const t = (r.querySelector(".email-label")?.textContent || "").trim().toLowerCase();
				return t === label;
			});

			if (!row) return "";

			const name = (row.querySelector(".email-value")?.childNodes?.[0]?.textContent || "").trim();
			const addr = (row.querySelector(".email-address")?.textContent || "").trim().replace(/^\(|\)$/g, "");
			if (!name && !addr) return "";

			return addr ? `${name} (${addr})`.trim() : name;
		};

		for (const card of cards) {
			const fromText = getRowValue(card, "from");
			const toText = getRowValue(card, "to");

			const contentEl = card.querySelector(".email-content");
			const bodyHtml = contentEl ? contentEl.innerHTML : "";

			// Remove signature that may have been appended inside email-content for any reason
			const tmp = doc.createElement("div");
			tmp.innerHTML = bodyHtml;
			tmp.querySelectorAll(".email-signature, .email-signature-sep").forEach(n => n.remove());

			// Replace the entire card content with only from/to/body in a simple structure
			card.innerHTML = `
				<div class="email-reader-min">
					${fromText ? `<div class="email-reader-field"><strong>From</strong> ${fromText}</div>` : ""}
					${toText ? `<div class="email-reader-field"><strong>To</strong> ${toText}</div>` : ""}
					<div class="email-reader-body">${tmp.innerHTML}</div>
				</div>
			`;
		}

		// Remove toolbars or wrappers if Readability might latch onto them
		doc.querySelectorAll(".email-actions-bar, .email-header, .email-meta").forEach(n => n.remove());
	}


	async enableReaderMode() {
		const imgArray = this.storeChapterImages(document);

		const { storyPath, chapter } = Reader.getParams();

		await this.ensureReadabilityLoaded();

		const articleElem = document.querySelector("article#reader, main, article");
		if (!articleElem) {
			alert("No article found for reader mode.");
			return;
		}

		if (!this.originalNodeClone)
			this.originalNodeClone = articleElem.cloneNode(true);

		const docClone = document.cloneNode(true);
		this.sanitiseEmailsForReadability(docClone);
		const reader = new window.Readability(docClone);
		const parsed = reader.parse();

		if (!(parsed && parsed.content)) return;

		const parser = new DOMParser();
		const parsedDoc = parser.parseFromString(parsed.content, "text/html");

		let htmlContent = await Reader.injectBookmarksIntoHTML(parsedDoc.body.innerHTML, storyPath, chapter);

		articleElem.innerHTML = htmlContent;

		this.restoreChapterImages(imgArray, articleElem);

		// Ensure the reader-container class stays present
		const articleObj = document.getElementById("reader");
		if (articleObj) articleObj.classList.add("reader-container");

		const url = new URL(window.location);
		if (!url.searchParams.has("reader")) {
			url.searchParams.set("reader", "true");
			window.history.pushState({}, "", url);
		}

		document.body.classList.add("reader-mode");
		this.readerToggle.textContent = this.disableText;
		this.readerToggle.classList.add("active");
		this.readerActive = true;
	}

	async disableReaderMode() {
		const articleElem = document.querySelector("article#reader, main, article");
		if (articleElem && this.originalNodeClone) {
			const restored = this.originalNodeClone.cloneNode(true);
			articleElem.replaceWith(restored);
			Reader.setupReader(restored);
		}

		document.body.classList.remove("reader-mode");
		this.readerToggle.textContent = this.enableText;
		this.readerToggle.classList.remove("active");
		this.readerActive = false;

		// Remove ?reader=true from the URL when disabling reader mode
		const url = new URL(window.location);
		url.searchParams.delete("reader");
		window.history.pushState({}, "", url);
	}

	async handleToggleClick() {
		this.readerActive ? await this.disableReaderMode() : await this.enableReaderMode();
		return;
	}
}

export const setupReaderToggle = ReaderToggle.setup;