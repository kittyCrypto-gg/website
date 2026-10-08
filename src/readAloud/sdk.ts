import * as loader from "../loader.ts";
import { SPEECH_SDK_CDN } from "./config.ts";
import type { SpeechSdkNamespace } from "./types.ts";

export async function speechSdkReady(): Promise<SpeechSdkNamespace> {
    if (window.SpeechSDK) return window.SpeechSDK;
    if (window._speechSDKReadyPromise) return window._speechSDKReadyPromise;

    window._speechSDKReadyPromise = (async () => {
        await loader.loadScript(SPEECH_SDK_CDN);

        if (!window.SpeechSDK) {
            throw new Error(
                "SpeechSDK loaded but not available on window"
            );
        }

        return window.SpeechSDK;
    })().catch((error: unknown) => {
        window._speechSDKReadyPromise = null;
        throw error;
    });

    return window._speechSDKReadyPromise;
}
