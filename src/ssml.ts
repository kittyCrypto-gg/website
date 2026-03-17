const SSML_AUTHORING_ATTRIBUTE_NAMES = [
    "ssml-phoneme",
    "ssml-alphabet",
    "ssml-sub",
    "ssml-say-as",
    "ssml-format",
    "ssml-detail",
    "ssml-text"
] as const;

const SSML_AUTHORING_SELECTOR =
    "[ssml-phoneme], [ssml-sub], [ssml-say-as]";

type SsmlPayload = Readonly<{
    ssml: string;
}>;

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function excXmlTxt(value: string | null | undefined): string {
    return (value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function excXmlAttr(value: string | null | undefined): string {
    return excXmlTxt(value)
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&apos;");
}

/**
 * @param {Element} element
 * @param {string} attributeName
 * @returns {string}
 */
function readAttr(element: Element, attributeName: string): string {
    return (element.getAttribute(attributeName) || "").trim();
}

/**
 * @param {Element} element
 * @returns {string}
 */
function getSpokenTxt(element: Element): string {
    const explicitSpokenText = readAttr(element, "ssml-text");
    if (explicitSpokenText) return explicitSpokenText;

    return (element.textContent || "").trim();
}

/**
 * @param {readonly string[]} parts
 * @returns {string}
 */
function joinAttr(parts: readonly string[]): string {
    return parts.filter(Boolean).join(" ");
}

/**
 * @param {Element} element
 * @returns {string | null}
 */
function buildSsmlPh(element: Element): string | null {
    const phoneme = readAttr(element, "ssml-phoneme");
    if (!phoneme) return null;

    const spokenText = getSpokenTxt(element);
    if (!spokenText) return null;

    const alphabet = readAttr(element, "ssml-alphabet") || "ipa";

    return `<phoneme alphabet="${excXmlAttr(alphabet)}" ph="${excXmlAttr(phoneme)}">${excXmlTxt(spokenText)}</phoneme>`;
}

/**
 * @param {Element} element
 * @returns {string | null}
 */
function buildSubSsml(element: Element): string | null {
    const substitution = readAttr(element, "ssml-sub");
    if (!substitution) return null;

    const spokenText = getSpokenTxt(element);
    if (!spokenText) return null;

    return `<sub alias="${excXmlAttr(substitution)}">${excXmlTxt(spokenText)}</sub>`;
}

/**
 * @param {Element} element
 * @returns {string | null}
 */
function buildSayAsSsml(element: Element): string | null {
    const interpretAs = readAttr(element, "ssml-say-as");
    if (!interpretAs) return null;

    const spokenText = getSpokenTxt(element);
    if (!spokenText) return null;

    const format = readAttr(element, "ssml-format");
    const detail = readAttr(element, "ssml-detail");

    const attributeParts = [
        `interpret-as="${excXmlAttr(interpretAs)}"`,
        format ? `format="${excXmlAttr(format)}"` : "",
        detail ? `detail="${excXmlAttr(detail)}"` : ""
    ];

    return `<say-as ${joinAttr(attributeParts)}>${excXmlTxt(spokenText)}</say-as>`;
}

/**
 * @param {Element} element
 * @returns {string | null}
 */
function buildSsmlMarkup(element: Element): string | null {
    const phonemeMarkup = buildSsmlPh(element);
    if (phonemeMarkup) return phonemeMarkup;

    const substitutionMarkup = buildSubSsml(element);
    if (substitutionMarkup) return substitutionMarkup;

    const sayAsMarkup = buildSayAsSsml(element);
    if (sayAsMarkup) return sayAsMarkup;

    return null;
}

/**
 * @param {Element} element
 * @returns {void}
 */
function removeSsmlAuthoringAttributes(element: Element): void {
    SSML_AUTHORING_ATTRIBUTE_NAMES.forEach((attributeName) => {
        element.removeAttribute(attributeName);
    });
}

/**
 * @param {Element} element
 * @param {string} ssmlMarkup
 * @returns {void}
 */
function applyReadAloudPayload(element: Element, ssmlMarkup: string): void {
    const payload: SsmlPayload = { ssml: ssmlMarkup };
    element.setAttribute("data-readaloud", JSON.stringify(payload));
}

/**
 * @param {string} htmlContent
 * @returns {string}
 */
export function replaceSsmlAuthoring(htmlContent: string): string {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = htmlContent;

    const ssmlElements = Array.from(wrapper.querySelectorAll(SSML_AUTHORING_SELECTOR));

    ssmlElements.forEach((element) => {
        const ssmlMarkup = buildSsmlMarkup(element);

        removeSsmlAuthoringAttributes(element);

        if (!ssmlMarkup) return;

        applyReadAloudPayload(element, ssmlMarkup);
    });

    return wrapper.innerHTML;
}