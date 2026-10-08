import * as helpers from "../helpers.ts";

async function loadMobileDetect(): Promise<void> {
    const sources = [
        "https://kittycrow.dev/external?src=https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.js",
        "https://cdn.jsdelivr.net/npm/mobile-detect@1.4.5/mobile-detect.js"
    ];

    for (const src of sources) {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        document.body.appendChild(script);

        await new Promise<void>((resolve) => {
            script.onload = () => resolve();
            script.onerror = () => resolve();
        });

        if (window.MobileDetect) return;
        script.remove();
    }
}

export async function checkMobile(): Promise<boolean> {
    while (document.readyState === "loading") {
        await helpers.nextFrame();
    }

    if (!window.MobileDetect) await loadMobileDetect();

    const Ctor = window.MobileDetect;
    if (!Ctor) return false;

    const md = new Ctor(window.navigator.userAgent);
    return !!md.mobile();
}

function injectScript(src: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(
            `script[src="${src}"]`
        );

        if (existing) {
            resolve();
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(
            new Error("Failed to load script: " + src)
        );
        document.head.appendChild(script);
    });
}

function injectCssLink(href: string): void {
    const existing = document.querySelector<HTMLLinkElement>(
        `link[href="${href}"]`
    );

    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

export async function ensureXtermLoaded(): Promise<void> {
    const hasTerminal = typeof window.Terminal !== "undefined";
    const hasFit = typeof window.FitAddon !== "undefined";

    injectCssLink(
        "https://cdn.jsdelivr.net/npm/xterm/css/xterm.css"
    );

    if (!hasTerminal) {
        await injectScript(
            "https://cdn.jsdelivr.net/npm/xterm/lib/xterm.js"
        );
    }

    if (!hasFit) {
        await injectScript(
            "https://cdn.jsdelivr.net/npm/xterm-addon-fit/lib/xterm-addon-fit.js"
        );
    }
}
