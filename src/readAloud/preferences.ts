import {
    readSpeechResource,
    writeSpeechResource
} from "./speechResource.ts";

export function savePreferredVoice(voiceName: string): void {
    localStorage.setItem(
        "readAloudPreferredVoice",
        voiceName
    );
}

export function saveApiKey(apiKey: string): void {
    const stored = readSpeechResource();
    const region = stored?.region || "";
    const regionLocked = !!stored?.regionLocked;

    writeSpeechResource({
        speechKey: apiKey,
        region,
        regionLocked
    });

    localStorage.setItem(
        "readAloudConfigMenuHidden",
        String(apiKey !== "")
    );
}

export function saveRegion(region: string): void {
    const stored = readSpeechResource();
    const speechKey = stored?.speechKey || "";

    writeSpeechResource({
        speechKey,
        region,
        regionLocked: region !== ""
    });
}

export function saveSpeechRate(rate: number): void {
    localStorage.setItem(
        "readAloudSpeechRate",
        String(rate)
    );
}

export function getSpeechRate(): number {
    return Number.parseFloat(
        localStorage.getItem("readAloudSpeechRate") || ""
    ) || 1.0;
}
