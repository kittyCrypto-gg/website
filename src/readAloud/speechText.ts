import * as helpers from "../helpers.ts";
import type {
    ReadAloudParagraphSpeech,
    ReadAloudSsmlToken
} from "./types.ts";
import {
    READ_ALOUD_IGNORE_SELECTORS,
    READ_ALOUD_META_ATTR
} from "./config.ts";

export function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'\"]/g, (char) => ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        "\"": "&quot;"
    }[char] ?? char));
}

function safeJsonParse(raw: string): unknown | null {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return null;
    }
}

function normaliseSpace(raw: string): string {
    return raw.replace(/\s+/g, " ").trim();
}

function isUnsafeInlineSsml(ssml: string): boolean {
    const lower = ssml.toLowerCase();
    const blocked = [
        "<speak", "</speak",
        "<voice", "</voice",
        "<prosody", "</prosody",
        "<audio", "</audio"
    ];

    return blocked.some((token) => lower.includes(token));
}

export function textFromReadAloudAttribute(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";

    const parsed = safeJsonParse(trimmed);
    if (parsed === null) return trimmed;
    if (typeof parsed === "string") return parsed.trim();
    if (!helpers.isRecord(parsed)) return trimmed;

    const textRaw = parsed["text"];
    const text = typeof textRaw === "string" ? textRaw.trim() : "";
    if (text) return text;

    const speakRaw = parsed["speak"];
    const speak = typeof speakRaw === "string" ? speakRaw.trim() : "";
    if (speak) return speak;

    return trimmed;
}

function readOverrideFromAttr(
    raw: string
): Readonly<{ kind: "text" | "ssml"; value: string }> | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;

    const parsed = safeJsonParse(trimmed);
    if (parsed === null) return { kind: "text", value: trimmed };
    if (typeof parsed === "string") {
        return { kind: "text", value: parsed.trim() };
    }
    if (!helpers.isRecord(parsed)) {
        return { kind: "text", value: trimmed };
    }

    const ssmlRaw = parsed["ssml"];
    const ssml = typeof ssmlRaw === "string" ? ssmlRaw.trim() : "";

    if (ssml && isUnsafeInlineSsml(ssml)) {
        return { kind: "text", value: trimmed };
    }

    if (ssml) return { kind: "ssml", value: ssml };

    const textRaw = parsed["text"];
    const text = typeof textRaw === "string" ? textRaw.trim() : "";
    if (text) return { kind: "text", value: text };

    const speakRaw = parsed["speak"];
    const speak = typeof speakRaw === "string" ? speakRaw.trim() : "";
    if (speak) return { kind: "text", value: speak };

    return { kind: "text", value: trimmed };
}

function hydrateTooltipMeta(root: HTMLElement): void {
    const renderedTooltips = Array.from(
        root.querySelectorAll<HTMLElement>(".tooltip")
    );

    for (const tooltip of renderedTooltips) {
        const translationEl = tooltip.querySelector<HTMLElement>(
            ".tooltip-content.translation"
        );
        const translationText = normaliseSpace(
            translationEl?.textContent ?? ""
        );
        if (!translationText) continue;

        tooltip.setAttribute(
            READ_ALOUD_META_ATTR,
            JSON.stringify({
                text: translationText,
                kind: "tooltip_translation"
            })
        );
    }

    const rawTooltips = Array.from(
        root.getElementsByTagName("tooltip")
    );

    for (const tooltip of rawTooltips) {
        const contentEl = Array.from(tooltip.children).find(
            (node) => node.tagName.toLowerCase() === "content"
        ) ?? null;
        if (!contentEl) continue;

        const translationAttr = (
            contentEl.getAttribute("translation") ?? ""
        ).trim().toLowerCase();
        if (translationAttr !== "true") continue;

        const translationText = normaliseSpace(
            contentEl.textContent ?? ""
        );
        if (!translationText) continue;

        tooltip.setAttribute(
            READ_ALOUD_META_ATTR,
            JSON.stringify({
                text: translationText,
                kind: "tooltip_translation"
            })
        );
    }
}

function applyMeta(root: HTMLElement): Map<string, ReadAloudSsmlToken> {
    const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(
            `[${READ_ALOUD_META_ATTR}]`
        )
    ).reverse();

    const tokens = new Map<string, ReadAloudSsmlToken>();
    let tokenIndex = 0;

    for (const element of nodes) {
        const raw = element.getAttribute(READ_ALOUD_META_ATTR) ?? "";
        const override = readOverrideFromAttr(raw);
        if (!override) continue;

        if (override.kind === "ssml") {
            const fallbackText = normaliseSpace(
                element.textContent ?? ""
            );
            const token = `__RA_SSML_${tokenIndex}__`;
            tokenIndex += 1;

            tokens.set(token, {
                ssml: override.value,
                fallbackText
            });
            element.textContent = token;
            continue;
        }

        element.textContent = override.value;
    }

    return tokens;
}

export function paragraphSpeech(
    paragraph: HTMLElement | null,
    elemsToIgnore: readonly string[] = READ_ALOUD_IGNORE_SELECTORS
): ReadAloudParagraphSpeech {
    if (!paragraph) return { plainText: "", ssmlBody: null };

    const clone = paragraph.cloneNode(true) as HTMLElement;
    hydrateTooltipMeta(clone);
    const ssmlTokens = applyMeta(clone);

    if (elemsToIgnore.length) {
        clone
            .querySelectorAll(elemsToIgnore.join(", "))
            .forEach((node) => node.remove());
    }

    const withTokens = normaliseSpace(clone.textContent ?? "");
    if (!withTokens) return { plainText: "", ssmlBody: null };
    if (!ssmlTokens.size) {
        return { plainText: withTokens, ssmlBody: null };
    }

    let plainText = withTokens;
    let ssmlBody = escapeXml(withTokens);

    for (const [token, meta] of ssmlTokens) {
        const fallback = meta.fallbackText || "";
        plainText = plainText.split(token).join(fallback);
        ssmlBody = ssmlBody.split(token).join(meta.ssml);
    }

    return {
        plainText: normaliseSpace(plainText),
        ssmlBody
    };
}

export function paragraphPlain(
    paragraph: HTMLElement | null,
    elemsToIgnore: readonly string[] = READ_ALOUD_IGNORE_SELECTORS
): string {
    return paragraphSpeech(
        paragraph,
        elemsToIgnore
    ).plainText;
}

export function buildSSML(
    speech: ReadAloudParagraphSpeech,
    voiceName: string,
    rate: number
): string {
    const rateMap: Record<string, string> = {
        "0.5": "-50%",
        "0.75": "-25%",
        "1": "0%",
        "1.25": "25%",
        "1.5": "50%",
        "1.75": "75%",
        "2": "100%"
    };

    const prosodyRate = rateMap[String(rate)] || "95%";

    return `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
        xmlns:mstts="http://www.w3.org/2001/mstts"
        xml:lang="en-US">
        <voice name="${voiceName}">
          <prosody rate="${prosodyRate}">
            ${speech.ssmlBody ?? escapeXml(speech.plainText)}
          </prosody>
        </voice>
      </speak>
    `;
}
