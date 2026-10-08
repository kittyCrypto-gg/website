import * as helpers from "../helpers.ts";
import {
    READ_ALOUD_REGIONS,
    SPEECH_RESOURCE_KEY
} from "./config.ts";
import type {
    RegionProbeResult,
    RegionResolveResult,
    SpeechResource
} from "./types.ts";

export function readSpeechResource(): SpeechResource | null {
    const raw = localStorage.getItem(SPEECH_RESOURCE_KEY);
    if (!raw) return null;

    try {
        const parsedUnknown: unknown = JSON.parse(raw);
        if (!helpers.isRecord(parsedUnknown)) return null;

        const speechKey = typeof parsedUnknown.speechKey === "string"
            ? parsedUnknown.speechKey
            : "";
        const region = typeof parsedUnknown.region === "string"
            ? parsedUnknown.region
            : "";
        const regionLocked = typeof parsedUnknown.regionLocked === "boolean"
            ? parsedUnknown.regionLocked
            : false;

        return { speechKey, region, regionLocked };
    } catch {
        return null;
    }
}

export function writeSpeechResource(
    next: Partial<SpeechResource> | null | undefined
): void {
    const safe = {
        speechKey: String(next?.speechKey || ""),
        region: String(next?.region || ""),
        regionLocked: Boolean(next?.regionLocked),
        updatedAt: Date.now()
    };

    localStorage.setItem(
        SPEECH_RESOURCE_KEY,
        JSON.stringify(safe)
    );
}

export function migrateSpeechResource(): void {
    if (readSpeechResource()) return;

    const legacyKey =
        localStorage.getItem("readAloudSpeechApiKey") || "";
    const legacyRegion =
        localStorage.getItem("readAloudSpeechRegion") || "";

    if (!legacyKey && !legacyRegion) return;

    writeSpeechResource({
        speechKey: legacyKey,
        region: legacyRegion,
        regionLocked: legacyRegion !== ""
    });

    localStorage.removeItem("readAloudSpeechApiKey");
    localStorage.removeItem("readAloudSpeechRegion");
}

function sleep(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

export async function probeRegionForKey(
    speechKey: string,
    region: string
): Promise<RegionProbeResult> {
    if (!speechKey || !region) {
        return { ok: false, status: 0 };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(
        () => controller.abort(),
        3500
    );

    try {
        const url =
            "https://" +
            region +
            ".tts.speech.microsoft.com/cognitiveservices/voices/list";

        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Ocp-Apim-Subscription-Key": speechKey
            },
            signal: controller.signal
        });

        return {
            ok: response.ok,
            status: response.status
        };
    } catch {
        return { ok: false, status: 0 };
    } finally {
        window.clearTimeout(timeout);
    }
}

export async function resolveRegionForKey(
    speechKey: string,
    preferredRegion: string
): Promise<RegionResolveResult> {
    const regions = READ_ALOUD_REGIONS.slice();
    const ordered = preferredRegion
        ? [
            preferredRegion,
            ...regions.filter(
                (region) => region !== preferredRegion
            )
        ]
        : regions;

    for (const region of ordered) {
        const probe = await probeRegionForKey(
            speechKey,
            region
        );

        if (probe.status === 429) {
            return {
                region: null,
                reason: "rate_limited"
            };
        }

        if (probe.ok) {
            return { region, reason: "ok" };
        }

        await sleep(140);
    }

    return {
        region: null,
        reason: "not_found"
    };
}
