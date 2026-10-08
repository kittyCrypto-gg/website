import MobileDetect from "mobile-detect";

/** Local, bundled device detection shared by site controls and the terminal. */
export function isMobileDevice(): boolean {
    const override = new URLSearchParams(window.location.search).get("isMobile");
    if (override !== null) return override === "true";

    const ua = navigator.userAgent;
    const mdHit = Boolean(new MobileDetect(ua).mobile());
    const touch = navigator.maxTouchPoints > 0;
    const desktop = /\b(Windows NT|Macintosh|X11|Linux x86_64)\b/.test(ua) && !touch;
    return mdHit || !desktop;
}
