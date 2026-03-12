/**
 * Socials data loaded from ../data/socials.json.
 */
interface SocialEntry {
    url: string;
    icon: string;
}

interface SocialDirectory {
    [socialName: string]: SocialEntry;
}

interface SocialPayload {
    social: SocialDirectory;
}

/**
 * Fetches the socials payload from disk.
 *
 * @returns {Promise<SocialPayload | null>} The parsed socials payload, or null if loading fails.
 */
async function loadSocialsPayload(): Promise<SocialPayload | null> {
    try {
        const response: Response = await fetch("../data/socials.json", {
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            console.error(`Failed to load socials.json. HTTP ${response.status}`);
            return null;
        }

        const payload: unknown = await response.json();

        if (!isSocialPayload(payload)) {
            console.error("socials.json has an invalid structure.");
            return null;
        }

        return payload;
    } catch (error: unknown) {
        console.error("Failed to fetch socials.json.", error);
        return null;
    }
}

/**
 * Checks whether a value is a record-like object.
 *
 * @param {unknown} value The value to inspect.
 * @returns {value is Record<string, unknown>} True when the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Checks whether a value matches a social entry.
 *
 * @param {unknown} value The value to inspect.
 * @returns {value is SocialEntry} True when the value matches the SocialEntry shape.
 */
function isSocialEntry(value: unknown): value is SocialEntry {
    if (!isRecord(value)) {
        return false;
    }

    return typeof value.url === "string" && typeof value.icon === "string";
}

/**
 * Checks whether a value matches the socials payload shape.
 *
 * @param {unknown} value The value to inspect.
 * @returns {value is SocialPayload} True when the value matches the SocialPayload shape.
 */
function isSocialPayload(value: unknown): value is SocialPayload {
    if (!isRecord(value) || !isRecord(value.social)) {
        return false;
    }

    const socialEntries: unknown[] = Object.values(value.social);
    return socialEntries.every((entry: unknown): boolean => isSocialEntry(entry));
}

/**
 * Converts a raw social key into a cleaner display label.
 *
 * @param {string} socialName The raw social key from the JSON object.
 * @returns {string} A human-readable label.
 */
function formatSocialLabel(socialName: string): string {
    return socialName
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (character: string): string => character.toUpperCase());
}

/**
 * Checks whether an icon path points to an SVG file.
 *
 * @param {string} iconPath The icon path to inspect.
 * @returns {boolean} True when the icon path appears to target an SVG file.
 */
function isSvgIconPath(iconPath: string): boolean {
    return /\.svg(?:\?.*)?$/i.test(iconPath);
}

/**
 * Creates a themed icon node for a social card.
 *
 * SVG files are fetched and injected inline so they can inherit CSS colour.
 * Non-SVG files fall back to a regular <img>.
 *
 * @param {Document} documentRef The current document.
 * @param {string} socialName The social name from the JSON key.
 * @param {string} iconPath The icon file path.
 * @returns {Promise<HTMLElement>} The icon wrapper element.
 */
async function createSocialIcon(
    documentRef: Document,
    socialName: string,
    iconPath: string
): Promise<HTMLElement> {
    const iconWrapper: HTMLSpanElement = documentRef.createElement("span");
    iconWrapper.className = "socials-segment__icon";
    iconWrapper.setAttribute("aria-hidden", "true");

    if (!isSvgIconPath(iconPath)) {
        const iconImage: HTMLImageElement = documentRef.createElement("img");
        iconImage.src = iconPath;
        iconImage.alt = `${formatSocialLabel(socialName)} icon`;
        iconImage.width = 32;
        iconImage.height = 32;
        iconImage.loading = "lazy";

        iconWrapper.append(iconImage);
        return iconWrapper;
    }

    try {
        const iconResponse: Response = await fetch(iconPath, {
            headers: {
                "Accept": "image/svg+xml"
            }
        });

        if (!iconResponse.ok) {
            throw new Error(`Failed to load icon. HTTP ${iconResponse.status}`);
        }

        const svgMarkup: string = await iconResponse.text();
        iconWrapper.innerHTML = svgMarkup;

        const svgElement: SVGSVGElement | null = iconWrapper.querySelector("svg");

        if (!svgElement) {
            throw new Error("SVG markup did not contain an <svg> root element.");
        }

        svgElement.setAttribute("width", "32");
        svgElement.setAttribute("height", "32");
        svgElement.setAttribute("focusable", "false");
        svgElement.setAttribute("aria-hidden", "true");

        const titleElement: Element | null = svgElement.querySelector("title");
        if (titleElement) {
            titleElement.remove();
        }

        return iconWrapper;
    } catch (error: unknown) {
        console.error(`Failed to load SVG icon for ${socialName}.`, error);

        const fallbackIcon: HTMLImageElement = documentRef.createElement("img");
        fallbackIcon.src = iconPath;
        fallbackIcon.alt = `${formatSocialLabel(socialName)} icon`;
        fallbackIcon.width = 32;
        fallbackIcon.height = 32;
        fallbackIcon.loading = "lazy";

        iconWrapper.append(fallbackIcon);
        return iconWrapper;
    }
}

/**
 * Creates a single social card element.
 *
 * @param {Document} documentRef The current document.
 * @param {string} socialName The social name from the JSON key.
 * @param {SocialEntry} socialEntry The social entry data.
 * @returns {Promise<HTMLAnchorElement>} The rendered social card.
 */
async function createSocialCard(
    documentRef: Document,
    socialName: string,
    socialEntry: SocialEntry
): Promise<HTMLAnchorElement> {
    const card: HTMLAnchorElement = documentRef.createElement("a");
    card.className = "socials-segment__item";
    card.href = socialEntry.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.setAttribute("aria-label", `${formatSocialLabel(socialName)}: ${socialEntry.url}`);

    const icon: HTMLElement = await createSocialIcon(documentRef, socialName, socialEntry.icon);

    const body: HTMLDivElement = documentRef.createElement("div");
    body.className = "socials-segment__body";

    const title: HTMLSpanElement = documentRef.createElement("span");
    title.className = "socials-segment__title";
    title.textContent = formatSocialLabel(socialName);

    const url: HTMLSpanElement = documentRef.createElement("span");
    url.className = "socials-segment__url";
    url.textContent = socialEntry.url;

    body.append(title, url);
    card.append(icon, body);

    return card;
}

/**
 * Inserts a spacer so an odd final item sits on the right side of the last row.
 *
 * @param {Document} documentRef The current document.
 * @returns {HTMLDivElement} The spacer element.
 */
function createRightAlignSpacer(documentRef: Document): HTMLDivElement {
    const spacer: HTMLDivElement = documentRef.createElement("div");
    spacer.className = "socials-segment__spacer";
    spacer.setAttribute("aria-hidden", "true");
    return spacer;
}

/**
 * Renders the socials into the target grid.
 *
 * @param {HTMLElement} gridElement The grid container element.
 * @param {SocialDirectory} socialDirectory The social map from the payload.
 * @returns {Promise<void>} Nothing.
 */
async function renderSocials(
    gridElement: HTMLElement,
    socialDirectory: SocialDirectory
): Promise<void> {
    const socialEntries: Array<[string, SocialEntry]> = Object.entries(socialDirectory);

    if (socialEntries.length === 0) {
        return;
    }

    const fragment: DocumentFragment = document.createDocumentFragment();
    const hasOddCount: boolean = socialEntries.length % 2 !== 0;
    const lastEntryIndex: number = socialEntries.length - 1;

    for (let index: number = 0; index < socialEntries.length; index += 1) {
        if (hasOddCount && index === lastEntryIndex) {
            fragment.append(createRightAlignSpacer(document));
        }

        const [socialName, socialEntry]: [string, SocialEntry] = socialEntries[index];
        const socialCard: HTMLAnchorElement = await createSocialCard(document, socialName, socialEntry);
        fragment.append(socialCard);
    }

    gridElement.replaceChildren(fragment);
}

/**
 * Finds the socials segment and hydrates it from the JSON payload.
 *
 * @returns {Promise<void>} Nothing.
 */
async function initialiseSocialsSegment(): Promise<void> {
    const gridElement: HTMLElement | null = document.querySelector(".socials-segment__grid");

    if (!gridElement) {
        return;
    }

    const payload: SocialPayload | null = await loadSocialsPayload();

    if (!payload) {
        return;
    }

    await renderSocials(gridElement, payload.social);
}

void initialiseSocialsSegment();