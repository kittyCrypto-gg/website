import { isMobileDevice } from "../deviceDetection.ts";

/** Retains the asynchronous API without fetching any external dependency. */
export async function getIsMobile(): Promise<boolean> {
    return isMobileDevice();
}

export function setMobileScale(isMobile: boolean): void {
    const root = document.documentElement;
    root.style.setProperty("--kc-text-scale", isMobile ? "0.65" : "1");
    root.classList.toggle("kc-mobile", isMobile);
}
