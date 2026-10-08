const HOME_PATH_RE = /^\/(?:index\.html)?$/;

const WEBRING_STYLE_URL = "https://webring.nekoweb.org/onionring.css";
const WEBRING_VARIABLES_URL = "https://webring.nekoweb.org/onionring-variables.js";
const WEBRING_WIDGET_URL = "https://webring.nekoweb.org/onionring-widget.js";

let webringBooted = false;

function loadStylesheetOnce(url: string): Promise<HTMLLinkElement> {
    const existing = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
        .find((link) => link.href === new URL(url, document.baseURI).href);
    if (existing) return Promise.resolve(existing);

    return new Promise<HTMLLinkElement>((resolve, reject) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = url;
        link.addEventListener("load", () => resolve(link), { once: true });
        link.addEventListener("error", () => reject(new Error(`Failed to load stylesheet ${url}`)), { once: true });
        document.head.appendChild(link);
    });
}

async function loadWebring(): Promise<void> {
    if (webringBooted) return;
    webringBooted = true;

    const [{ loadScript }] = await Promise.all([
        import("../loader.ts"),
        loadStylesheetOnce(WEBRING_STYLE_URL)
    ]);

    await loadScript(WEBRING_VARIABLES_URL);
    await loadScript(WEBRING_WIDGET_URL);
}

function bootWebring(): void {
    const root = document.getElementById("nekowebring");
    if (!(root instanceof HTMLElement)) return;

    if (!("IntersectionObserver" in window)) {
        void loadWebring();
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (!visible) return;
        observer.disconnect();
        void loadWebring();
    }, { rootMargin: "400px 0px" });

    observer.observe(root);
}

type VisitsModule = Readonly<{
    renderVisits: (options: Readonly<{
        scope: "overall" | "page";
        metric: "visits" | "uniqueVisitors";
        target: string;
    }>) => Promise<unknown>;
}>;

function afterFirstPaint(task: () => void): void {
    requestAnimationFrame(() => {
        requestAnimationFrame(task);
    });
}

function has(selector: string): boolean {
    return document.querySelector(selector) !== null;
}

function bootVisitLogger(): void {
    void import("../visitLogger.ts");
}

async function bootVisitCounters(): Promise<void> {
    const hasVisits = document.getElementById("visits-count") !== null;
    const hasUnique = document.getElementById("unique-visits-count") !== null;
    if (!hasVisits && !hasUnique) return;

    const visits = await import("../visits.ts") as VisitsModule;
    const home = HOME_PATH_RE.test(window.location.pathname);
    const tasks: Promise<unknown>[] = [];

    if (hasVisits) {
        tasks.push(visits.renderVisits({
            scope: home ? "overall" : "page",
            metric: "visits",
            target: "visits-count"
        }));
    }

    if (hasUnique) {
        tasks.push(visits.renderVisits({
            scope: home ? "overall" : "page",
            metric: "uniqueVisitors",
            target: "unique-visits-count"
        }));
    }

    await Promise.all(tasks);
}

function bootComments(): void {
    if (!has("#comments, #comments-box")) return;
    void import("../comments.ts");
}

function bootGithub(): void {
    const root = document.getElementById("commits-outer-shell");
    if (!(root instanceof HTMLElement)) return;

    const loadTracker = (): void => {
        void import("../github.tsx").catch((error: unknown) => {
            console.error("GitHub tracker failed to load:", error);
        });
    };

    if (!("IntersectionObserver" in window)) {
        loadTracker();
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadTracker();
    }, { threshold: 0 });

    observer.observe(root);
}

function bootRss(): void {
    if (!has(".blog-wrapper, #resources-wrapper")) return;
    void import("../rss.tsx");
}

function bootSocials(): void {
    if (!has(".socials-segment__grid")) return;
    void import("../socials.ts");
}

async function bootAboutTategaki(): Promise<void> {
    const container = document.querySelector(".jp-about");
    if (!(container instanceof HTMLElement)) return;

    try {
        const [tategaki, response] = await Promise.all([
            import("../tategaki.tsx"),
            fetch("./data/aboutme-jp.xml", { cache: "no-store" })
        ]);

        if (!response.ok) {
            throw new Error(`Failed to fetch ./data/aboutme-jp.xml (status ${response.status})`);
        }

        const xmlText = await response.text();
        const xmlDoc = new DOMParser().parseFromString(xmlText, "application/xml");
        const parseError = xmlDoc.querySelector("parsererror");
        if (parseError) throw new Error("Invalid XML in ./data/aboutme-jp.xml");

        const tategakiNode = xmlDoc.querySelector("tategaki");
        if (!(tategakiNode instanceof Element)) throw new Error("Missing <tategaki> root in ./data/aboutme-jp.xml");

        const tategakiXml = tategaki.serialisNde(tategakiNode);
        if (!tategakiXml) throw new Error("Could not serialise <tategaki> node");

        container.innerHTML = tategaki.replaceTategaki(tategakiXml);
        container.classList.add("jp-about--tategaki");
    } catch (error: unknown) {
        console.error("Failed to render aboutme-jp.xml", error);
    }
}

function bootProgressiveFeatures(): void {
    bootVisitLogger();
    void bootVisitCounters();
    bootComments();
    bootGithub();
    bootRss();
    bootSocials();
    bootWebring();
    void bootAboutTategaki();
}

export function startProgressivePageBoot(): void {
    afterFirstPaint(bootProgressiveFeatures);
}
