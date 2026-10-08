import { isMobileDevice } from "../deviceDetection.ts";

/** Backwards-compatible local device detection; no CDN or DOM-ready polling. */
export function checkMobile(): boolean {
    return isMobileDevice();
}
