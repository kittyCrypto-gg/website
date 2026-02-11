import { forceBookmark } from "./reader";
import * as loader from "./loader";

type ReadAloudButton = Readonly<{
    icon: string;
    action: string;
}>;

type ReadAloudButtons = Readonly<{
    play: ReadAloudButton;
    pause: ReadAloudButton;
    stop: ReadAloudButton;
    next: ReadAloudButton;
    prev: ReadAloudButton;
    restart: ReadAloudButton;
    config: ReadAloudButton;
    hide: ReadAloudButton;
    info: ReadAloudButton;
    jump: ReadAloudButton;
    help: ReadAloudButton;
}>;

type VoiceOption = Readonly<{
    name: string;
    locale: string;
    description: string;
}>;

type SpeechResource = Readonly<{
    speechKey: string;
    region: string;
    regionLocked: boolean;
}>;

type ReadAloudBuffer = Readonly<{
    idx: number;
    audioData: ArrayBuffer;
}>;

type ReadAloudState = {
    paused: boolean;
    pressed: boolean;

    currentParagraphIndex: number;
    currentParagraphId: string | null;
    paragraphs: HTMLElement[];

    synthesizer: SpeechSynthesizer | null;

    lastSpokenText: string;
    voiceName: string;
    speechKey: string;
    serviceRegion: string;
    speechRate: number;

    configVisible: boolean;
    menuVisible: boolean;
    jumpVisible: boolean;

    buffer: ReadAloudBuffer | null;

    currentAudio: HTMLAudioElement | null;
    currentAudioUrl: string | null;

    apiKeyVisible: boolean;
    regionUiVisible: boolean;

    originalMenuDisplay?: string;
};

type RegionProbeResult = Readonly<{
    ok: boolean;
    status: number;
}>;

type RegionResolveReason =
    | "ok"
    | "rate_limited"
    | "not_found"
    | "locked"
    | "cached"
    | "no_key";

type RegionResolveResult = Readonly<{
    region: string | null;
    reason: RegionResolveReason;
}>;

type SpeechSdkNamespace = Readonly<{
    SpeechConfig: Readonly<{
        fromSubscription: (speechKey: string, serviceRegion: string) => SpeechConfig;
    }>;

    SpeechSynthesizer: new (speechConfig: SpeechConfig, audioConfig: null) => SpeechSynthesizer;

    PropertyId: Readonly<{
        SpeechSynthesisOutputFormat: number;
    }>;

    SpeechSynthesisOutputFormat: Readonly<{
        Audio16Khz32KBitRateMonoMp3: number;
    }>;

    ResultReason: Readonly<{
        SynthesizingAudioCompleted: number;
    }>;
}>;

type SpeechConfig = {
    speechSynthesisVoiceName: string;
    setProperty: (propertyId: number, value: number) => void;
};

type SynthesisResult = Readonly<{
    reason: number;
    errorDetails?: string;
    audioData: ArrayBuffer;
}>;

type SpeechSynthesizer = Readonly<{
    speakSsmlAsync: (
        ssml: string,
        onSuccess: (result: SynthesisResult) => void,
        onError: (error: unknown) => void
    ) => void;

    stopSpeakingAsync?: (onStopped: () => void) => void;

    close: () => void;
}>;

type ModalOverlayEl = HTMLDivElement & { __handleEscape?: (event: KeyboardEvent) => void };

declare global {
    interface Window {
        SpeechSDK?: SpeechSdkNamespace;

        _speechSDKReadyPromise?: Promise<SpeechSdkNamespace> | null;

        readAloudState: ReadAloudState;

        closeCustomModal?: (modalId: string) => void;
    }
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * @param {string} id - Element id.
 * @returns {HTMLElement | null} HTMLElement if found.
 */
function getEl(id: string): HTMLElement | null {
    const el = document.getElementById(id);
    return el instanceof HTMLElement ? el : null;
}

/**
 * @param {string} selector - CSS selector.
 * @returns {HTMLElement | null} First HTMLElement match.
 */
function queryEl(selector: string): HTMLElement | null {
    const el = document.querySelector(selector);
    return el instanceof HTMLElement ? el : null;
}

class ReadAloudModule {
    #SDK_CDN: string;

    #buttons: ReadAloudButtons;

    #EYE_OPEN_SVG: string;
    #EYE_CLOSED_SVG: string;
    #svgCache: Map<string, string>;

    #VOICES: readonly VoiceOption[];
    #REGIONS: readonly string[];

    #MENU_HTML: string;
    #HELP_MODAL: string;

    #JUMP_VIS_KEY = "readAloudJumpVisible";
    #SPEECH_RESOURCE_KEY = "readAloudSpeechResource";

    #regionResolvePromise: Promise<RegionResolveResult> | null = null;

    #boundShowMenu: () => void;
    #boundReload: () => Promise<void>;
    #boundCloseMenu: () => void;
    #boundMenuVis: () => void;

    #menuResizeObserver: ResizeObserver | null = null;
    #onControlsDetach: ((e: Event) => void) | null = null;

    constructor() {
        this.#SDK_CDN =
            "https://kittycrypto.gg/external?src=https://cdn.jsdelivr.net/npm/microsoft-cognitiveservices-speech-sdk@1.44.0/distrib/browser/microsoft.cognitiveservices.speech.sdk.bundle.js";

        this.#buttons = {
            play: { icon: "▶️", action: "Start Read Aloud" },
            pause: { icon: "⏸️", action: "Pause Read Aloud" },
            stop: { icon: "⏹️", action: "Stop Read Aloud" },
            next: { icon: "⏩", action: "Next Paragraph" },
            prev: { icon: "⏪", action: "Previous Paragraph" },
            restart: { icon: "⏮️", action: "Restart" },
            config: { icon: "⚙️", action: "Configure Read Aloud" },
            hide: { icon: "👁️", action: "Hides Read Aloud menu" },
            info: { icon: "ℹ️", action: "Show Info" },
            jump: { icon: "🧭", action: "Show or hide jump to paragraph" },
            help: { icon: "❓", action: "Help" }
        };

        this.#EYE_OPEN_SVG = "../images/eyeopen.svg";
        this.#EYE_CLOSED_SVG = "../images/eyeclosed.svg";
        this.#svgCache = new Map<string, string>();

        this.#VOICES = [
            { name: "en-US-JennyNeural", locale: "en-US", description: "American English (US), Female, Jenny (default)" },
            { name: "en-US-AriaNeural", locale: "en-US", description: "American English (US), Female, Aria" },
            { name: "en-GB-SoniaNeural", locale: "en-GB", description: "British English (UK), Female, Sonia" },
            { name: "en-GB-LibbyNeural", locale: "en-GB", description: "British English (UK), Female, Libby" },
            { name: "en-AU-NatashaNeural", locale: "en-AU", description: "Australian English (AU), Female, Natasha" },
            { name: "en-CA-ClaraNeural", locale: "en-CA", description: "Canadian English (CA), Female, Clara" },
            { name: "en-IN-NeerjaNeural", locale: "en-IN", description: "Indian English (IN), Female, Neerja" },
            { name: "en-NZ-MollyNeural", locale: "en-NZ", description: "New Zealand English (NZ), Female, Molly" },
            { name: "en-IE-EmilyNeural", locale: "en-IE", description: "Irish English (IE), Female, Emily" },
            { name: "en-ZA-LeahNeural", locale: "en-ZA", description: "South African English (ZA), Female, Leah" }
        ] as const;

        this.#REGIONS = [
            "eastus", "eastus2", "southcentralus", "westus2", "westus3",
            "australiaeast", "southeastasia", "northeurope", "swedencentral",
            "uksouth", "westeurope", "centralus", "northcentralus",
            "westus", "southafricanorth", "centralindia", "eastasia",
            "japaneast", "japanwest", "koreacentral", "canadacentral",
            "francecentral", "germanywestcentral", "norwayeast", "switzerlandnorth",
            "uaenorth", "brazilsouth"
        ] as const;

        this.#MENU_HTML = `
            <span id="read-aloud-close" class="read-aloud-close-button" title="Close menu">❌</span>
            <div class="read-aloud-header"> Read Aloud </div>
            <div class="read-aloud-controls">
                <div class="read-aloud-fields">
                <button id="read-aloud-region-toggle" title="Set region manually">🌍</button>
                <div class="read-aloud-apikey-wrap">
                    <input id="read-aloud-apikey" type="password" placeholder="Azure Speech API Key" class="read-aloud-control" />
                    <div
                    class="read-aloud-apikey-eye"
                    role="button"
                    tabindex="0"
                    aria-label="Show API key"
                    title="Show API key"
                    ></div>
                </div>
                <div id="read-aloud-region-wrap" class="read-aloud-apikey-wrap" style="display:none">
                    <input
                    id="read-aloud-region-input"
                    type="text"
                    placeholder="Region (e.g. uksouth)"
                    class="read-aloud-control"
                    list="read-aloud-region-list"
                    autocomplete="off"
                    autocapitalize="none"
                    spellcheck="false"
                    />
                </div>
                <datalist id="read-aloud-region-list">
                    ${this.#REGIONS.map((r) => `<option value="${r}"></option>`).join("")}
                </datalist>
                <select id="read-aloud-voice" class="read-aloud-control">
                    ${this.#VOICES.map((v) => `<option value="${v.name}">${v.description}</option>`).join("")}
                </select>
                <select id="read-aloud-rate" class="read-aloud-control">
                    ${[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => `<option value="${rate}">${rate}x</option>`).join("")}
                </select>
                </div>
                <div class="read-aloud-buttons">
                <button id="read-aloud-toggle-playpause" title="${this.#buttons.play.action}">${this.#buttons.play.icon}</button>
                <button id="read-aloud-prev" title="${this.#buttons.prev.action}">${this.#buttons.prev.icon}</button>
                <button id="read-aloud-next" title="${this.#buttons.next.action}">${this.#buttons.next.icon}</button>
                <button id="read-aloud-stop" title="${this.#buttons.stop.action}">${this.#buttons.stop.icon}</button>
                <button id="read-aloud-restart" title="${this.#buttons.restart.action}">${this.#buttons.restart.icon}</button>
                <button id="read-aloud-info" title="${this.#buttons.info.action}">${this.#buttons.info.icon}</button>
                <button id="read-aloud-hide" class="menu-crossed" title="${this.#buttons.hide.action}">${this.#buttons.hide.icon}</button>
                <button id="read-aloud-config" class="menu-crossed" title="${this.#buttons.config.action}">${this.#buttons.config.icon}</button>
                <button id="read-aloud-jump-toggle" class="menu-crossed" title="${this.#buttons.jump.action}">${this.#buttons.jump.icon}</button>
                <button id="read-aloud-help" title="${this.#buttons.help.action}">${this.#buttons.help.icon}</button>
                <div class="read-aloud-jump">
                    <input
                    id="read-aloud-jump-input"
                    class="read-aloud-jump-input"
                    type="number"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    min="1"
                    step="1"
                    placeholder="¶ #"
                    title="Paragraph number"
                    />
                    <button id="read-aloud-jump-go" title="Jump to paragraph">✅</button>
                </div>
                </div>
            </div>
        `;

        this.#HELP_MODAL = `
            <div class="modal-header">
                <h2>Azure Speech Service Read Aloud Help</h2>
            </div>
            <div class="modal-content">
                <ul>
                <li>To use this feature, you need an Azure Speech API key and region.</li>
                <li>Get your API key <a href="https://portal.azure.com/" target="_blank" rel="noopener">here</a>.</li>
                <li>Paste your API key in the field.</li>
                <li>Select your region and preferred voice.</li>
                <li>Use the play button to start.</li>
                </ul>
                <p>
                For further help, see the
                <a href="https://learn.microsoft.com/en-gb/azure/ai-services/speech-service/" target="_blank" rel="noopener">official docs</a>.
                </p>
                <p class="modal-note">
                <b>Note:</b> KittyCrypto.gg will <u>NOT</u> store your API key or region server-side. It is saved only in your browser's local storage.<br>
                See the full implementation on
                <a href="https://github.com/kittyCrypto-gg/kittycrypto/blob/main/scripts/readAloud.js" target="_blank" rel="noopener">GitHub</a>.
                </p>
                <p class="modal-note">
                <b>Note:</b> Click anywhere outside this modal to close it.<br>
                You can also press <kbd>Esc</kbd> to close it.
                </p>
            </div>
        `;

        this.#boundShowMenu = () => this.showMenu();
        this.#boundReload = async () => this.reloadReadAloud();
        this.#boundCloseMenu = () => {
            void this.__closeMenu();
        };
        this.#boundMenuVis = () => this.__toggleVis();

        window.readAloudState = {
            paused: true,
            pressed: false,
            currentParagraphIndex: 0,
            currentParagraphId: null,
            paragraphs: [],
            synthesizer: null,
            lastSpokenText: "",
            voiceName: this.#VOICES[0].name,
            speechKey: "",
            serviceRegion: "",
            speechRate: 1.0,
            configVisible: false,
            menuVisible: true,
            jumpVisible: true,
            buffer: null,
            currentAudio: null,
            currentAudioUrl: null,
            apiKeyVisible: false,
            regionUiVisible: false,
            originalMenuDisplay: undefined
        };

        this.#onControlsDetach = (e: Event) => {
            const ev = e as CustomEvent<{ detached: boolean }>;
            const detached = !!ev.detail?.detached;
            this.__positionMenu(detached);
        };

        window.addEventListener("reader:controls-detached", this.#onControlsDetach);
    }

    /**
     * @returns {() => void} Handler that shows the menu.
     */
    getMenuHndlr(): () => void {
        return this.#boundShowMenu;
    }

    /**
     * @returns {() => Promise<void>} Handler that refreshes paragraph list.
     */
    getReloadHndlr(): () => Promise<void> {
        return this.#boundReload;
    }

    /**
     * @returns {Promise<SpeechSdkNamespace>} Speech SDK namespace.
     */
    async __sdkReady(): Promise<SpeechSdkNamespace> {
        if (window.SpeechSDK) return window.SpeechSDK;
        if (window._speechSDKReadyPromise) return window._speechSDKReadyPromise;

        window._speechSDKReadyPromise = (async () => {
            await loader.loadScript(this.#SDK_CDN);

            if (!window.SpeechSDK) {
                throw new Error("SpeechSDK loaded but not available on window");
            }

            return window.SpeechSDK;
        })().catch((err: unknown) => {
            window._speechSDKReadyPromise = null;
            throw err;
        });

        return window._speechSDKReadyPromise;
    }

    /**
     * @param {string} path - SVG file path.
     * @returns {Promise<string>} Raw SVG markup.
     */
    async __getSvgMarkup(path: string): Promise<string> {
        const cached = this.#svgCache.get(path);
        if (cached) return cached;

        const res = await fetch(path, { cache: "force-cache" });
        if (!res.ok) throw new Error(`Failed to load SVG: ${path}`);

        const svg = await res.text();
        this.#svgCache.set(path, svg);
        return svg;
    }

    /**
     * @param {HTMLInputElement | null} apikeyInput - API key input.
     * @param {HTMLElement | null} apikeyEye - Eye button container.
     * @param {boolean} visible - Whether to show the key.
     * @returns {Promise<void>} Resolves once UI is updated.
     */
    async __applyApiKeyVisibility(
        apikeyInput: HTMLInputElement | null,
        apikeyEye: HTMLElement | null,
        visible: boolean
    ): Promise<void> {
        if (!apikeyInput || !apikeyEye) return;

        apikeyInput.type = visible ? "text" : "password";
        window.readAloudState.apiKeyVisible = visible;

        const willShow = !visible;

        apikeyEye.setAttribute("aria-label", willShow ? "Show API key" : "Hide API key");
        apikeyEye.setAttribute("title", willShow ? "Show API key" : "Hide API key");

        apikeyEye.replaceChildren();

        const src = willShow ? this.#EYE_OPEN_SVG : this.#EYE_CLOSED_SVG;

        try {
            const raw = await this.__getSvgMarkup(src);

            const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
            const svg = doc.querySelector("svg");
            if (!svg) throw new Error("Invalid SVG");

            svg.querySelectorAll("foreignObject").forEach((n) => n.remove());

            apikeyEye.appendChild(document.importNode(svg, true));
        } catch {
            apikeyEye.textContent = willShow ? "🙊" : "🙈";
        }
    }

    /**
     * @param {string} unsafe - Text to escape.
     * @returns {string} Escaped XML.
     */
    __escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, (c) => ({
            "<": "&lt;",
            ">": "&gt;",
            "&": "&amp;",
            "'": "&apos;",
            '"': "&quot;"
        }[c] ?? c));
    }

    /**
     * @param {number} ms - Sleep duration.
     * @returns {Promise<void>} Resolves after timeout.
     */
    __sleep(ms: number): Promise<void> {
        return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    }

    /**
     * @returns {SpeechResource | null} Stored speech resource or null.
     */
    __readSpeechResource(): SpeechResource | null {
        const raw = localStorage.getItem(this.#SPEECH_RESOURCE_KEY);
        if (!raw) return null;

        try {
            const parsedUnknown: unknown = JSON.parse(raw);
            if (!isRecord(parsedUnknown)) return null;

            const speechKey = typeof parsedUnknown.speechKey === "string" ? parsedUnknown.speechKey : "";
            const region = typeof parsedUnknown.region === "string" ? parsedUnknown.region : "";
            const regionLocked = typeof parsedUnknown.regionLocked === "boolean" ? parsedUnknown.regionLocked : false;

            return { speechKey, region, regionLocked };
        } catch {
            return null;
        }
    }

    /**
     * @param {Partial<SpeechResource> | null | undefined} next - Next values.
     * @returns {void} Nothing.
     */
    __writeSpeechResource(next: Partial<SpeechResource> | null | undefined): void {
        const safe = {
            speechKey: String(next?.speechKey || ""),
            region: String(next?.region || ""),
            regionLocked: Boolean(next?.regionLocked),
            updatedAt: Date.now()
        };

        localStorage.setItem(this.#SPEECH_RESOURCE_KEY, JSON.stringify(safe));
    }

    /**
     * @returns {void} Nothing.
     */
    __migrateResource(): void {
        const already = this.__readSpeechResource();
        if (already) return;

        const legacyKey = localStorage.getItem("readAloudSpeechApiKey") || "";
        const legacyRegion = localStorage.getItem("readAloudSpeechRegion") || "";

        if (!legacyKey && !legacyRegion) return;

        this.__writeSpeechResource({
            speechKey: legacyKey,
            region: legacyRegion,
            regionLocked: legacyRegion !== ""
        });

        localStorage.removeItem("readAloudSpeechApiKey");
        localStorage.removeItem("readAloudSpeechRegion");
    }

    /**
     * @param {string} speechKey - Azure subscription key.
     * @param {string} region - Candidate region.
     * @returns {Promise<RegionProbeResult>} Probe result.
     */
    async __probeRegionForKey(speechKey: string, region: string): Promise<RegionProbeResult> {
        if (!speechKey || !region) return { ok: false, status: 0 };

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 3500);

        try {
            const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;
            const res = await fetch(url, {
                method: "GET",
                headers: { "Ocp-Apim-Subscription-Key": speechKey },
                signal: controller.signal
            });

            return { ok: res.ok, status: res.status };
        } catch {
            return { ok: false, status: 0 };
        } finally {
            window.clearTimeout(timeout);
        }
    }

    /**
     * @param {string} speechKey - Azure subscription key.
     * @param {string} preferredRegion - Preferred region.
     * @returns {Promise<RegionResolveResult>} Resolved region or failure reason.
     */
    async __resolveRegionForKey(speechKey: string, preferredRegion: string): Promise<RegionResolveResult> {
        const regions = this.#REGIONS.slice();
        const ordered = preferredRegion
            ? [preferredRegion, ...regions.filter((r) => r !== preferredRegion)]
            : regions;

        for (const region of ordered) {
            const probe = await this.__probeRegionForKey(speechKey, region);

            if (probe.status === 429) {
                return { region: null, reason: "rate_limited" };
            }

            if (probe.ok) {
                return { region, reason: "ok" };
            }

            await this.__sleep(140);
        }

        return { region: null, reason: "not_found" };
    }

    /**
     * @param {string} speechKey - Azure subscription key.
     * @param {string} preferredRegion - Cached preferred region.
     * @returns {Promise<RegionResolveResult>} Resolved region or failure reason.
     */
    async __ensureRegionForKey(speechKey: string, preferredRegion: string): Promise<RegionResolveResult> {
        if (!speechKey) return { region: null, reason: "no_key" };
        if (this.#regionResolvePromise) return this.#regionResolvePromise;

        this.#regionResolvePromise = (async () => {
            const result = await this.__resolveRegionForKey(speechKey, preferredRegion);
            return result;
        })().finally(() => {
            this.#regionResolvePromise = null;
        });

        return this.#regionResolvePromise;
    }

    /**
     * @param {HTMLElement | null} paragraph - Paragraph wrapper.
     * @returns {string} Plain text for speech.
     */
    __getParagraphPlainText(paragraph: HTMLElement | null): string {
        if (!paragraph) return "";

        const clone = paragraph.cloneNode(true) as HTMLElement;

        clone.querySelectorAll(".reader-paragraph-num, .bookmark-emoji").forEach((n) => n.remove());

        return (clone.textContent || "").replace(/\s+/g, " ").trim();
    }

    /**
     * @param {string} text - Text content.
     * @param {string} voiceName - Voice name.
     * @param {number} rate - Rate multiplier.
     * @returns {string} SSML markup.
     */
    __buildSSML(text: string, voiceName: string, rate: number): string {
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
                    ${this.__escapeXml(text)}
                </prosody>
                </voice>
            </speak>
        `;
    }

    /**
     * @param {boolean} visible - Whether to show region input.
     * @returns {void} Nothing.
     */
    __setRegionUiVisible(visible: boolean): void {
        const wrap = getEl("read-aloud-region-wrap");
        const btn = getEl("read-aloud-region-toggle");
        const fields = queryEl("#read-aloud-menu .read-aloud-fields");
        const apikeyWrap = queryEl("#read-aloud-menu .read-aloud-apikey-wrap");
        const regionInput = document.getElementById("read-aloud-region-input");

        if (!wrap || !btn || !fields || !apikeyWrap) return;
        if (!(regionInput instanceof HTMLInputElement)) return;

        if (visible) {
            wrap.style.display = "flex";
            wrap.appendChild(btn);
            btn.classList.add("read-aloud-apikey-eye");
            btn.setAttribute("title", "Hide region input");
            window.readAloudState.regionUiVisible = true;
            regionInput.focus();
            return;
        }

        wrap.style.display = "none";
        btn.classList.remove("read-aloud-apikey-eye");
        btn.setAttribute("title", "Set region manually");
        fields.insertBefore(btn, apikeyWrap);
        window.readAloudState.regionUiVisible = false;
    }

    /**
     * @returns {Promise<boolean>} True if handled and user was guided, else false.
     */
    async __handleRuntimeSpeakFailure(): Promise<boolean> {
        const state = window.readAloudState;
        if (!state.speechKey || !state.serviceRegion) return false;

        const stored = this.__readSpeechResource();
        if (!stored?.regionLocked) return false;

        const probe = await this.__probeRegionForKey(state.speechKey, state.serviceRegion);

        if (probe.status === 0) return false;

        if (probe.status === 429) {
            window.alert("Azure region check was rate limited. Please try again in a moment.");
            return true;
        }

        if (probe.ok) return false;

        window.alert(
            "Your Azure Speech region does not work with this API key. Check what you entered. " +
            "If you clear the region and press Play, the app will try to detect it automatically."
        );

        this.__toggleCnfg(true);
        this.__setRegionUiVisible(true);
        return true;
    }

    /**
     * @param {boolean} detached - Whether reader controls are detached.
     * @returns {void} Nothing.
     */
    __positionMenu(detached: boolean): void {
        const menu = getEl("read-aloud-menu");
        if (!menu) return;

        if (!detached) {
            menu.style.top = "0";
            menu.style.bottom = "";
            menu.style.transform = "translateX(-50%)";
            return;
        }

        const updateBottomAnchor = (): void => {
            const h = menu.offsetHeight;
            menu.style.top = `calc(100vh - ${h}px)`;
            menu.style.bottom = "";
            menu.style.transform = "translateX(-50%)";
        };

        updateBottomAnchor();

        if (!this.#menuResizeObserver) {
            this.#menuResizeObserver = new ResizeObserver(updateBottomAnchor);
            this.#menuResizeObserver.observe(menu);
        }
    }

    /**
     * @returns {void} Nothing.
     */
    showMenu(): void {
        window.readAloudState.pressed = true;

        const toggleBtn = getEl("read-aloud-toggle");
        if (toggleBtn) {
            const disableLabel = toggleBtn.getAttribute("data-disable") || "";
            toggleBtn.textContent = disableLabel;
            toggleBtn.classList.add("active");
            toggleBtn.removeEventListener("click", this.#boundShowMenu);
            toggleBtn.addEventListener("click", this.#boundCloseMenu);
        }

        const menu = getEl("read-aloud-menu");
        if (!menu) {
            console.error("Read Aloud menu element not found in DOM");
            return;
        }

        if (menu.style.display === "flex") return;

        menu.innerHTML = this.#MENU_HTML;
        menu.style.display = "flex";

        this.__migrateResource();

        const apikeyInputEl = document.getElementById("read-aloud-apikey");
        const apikeyEyeEl = document.querySelector("#read-aloud-menu .read-aloud-apikey-eye");
        const regionToggleBtnEl = document.getElementById("read-aloud-region-toggle");
        const regionWrapEl = document.getElementById("read-aloud-region-wrap");
        const regionInputEl = document.getElementById("read-aloud-region-input");
        const fieldsWrapEl = document.querySelector("#read-aloud-menu .read-aloud-fields");
        const apikeyWrapEl = document.querySelector("#read-aloud-menu .read-aloud-apikey-wrap");
        const voiceDropdownEl = document.getElementById("read-aloud-voice");
        const rateDropdownEl = document.getElementById("read-aloud-rate");
        const playPauseBtnEl = document.getElementById("read-aloud-toggle-playpause");
        const stopBtnEl = document.getElementById("read-aloud-stop");
        const prevBtnEl = document.getElementById("read-aloud-prev");
        const nextBtnEl = document.getElementById("read-aloud-next");
        const restartBtnEl = document.getElementById("read-aloud-restart");
        const configBtnEl = document.getElementById("read-aloud-config");
        const hideBtnEl = document.getElementById("read-aloud-hide");
        const infoBtnEl = document.getElementById("read-aloud-info");
        const helpBtnEl = document.getElementById("read-aloud-help");
        const jumpToggleBtnEl = document.getElementById("read-aloud-jump-toggle");
        const jumpWrapEl = document.querySelector(".read-aloud-jump");
        const jumpInputEl = document.getElementById("read-aloud-jump-input");
        const jumpGoBtnEl = document.getElementById("read-aloud-jump-go");

        if (!(apikeyInputEl instanceof HTMLInputElement)) return;
        if (!(apikeyEyeEl instanceof HTMLElement)) return;
        if (!(regionToggleBtnEl instanceof HTMLElement)) return;
        if (!(regionWrapEl instanceof HTMLElement)) return;
        if (!(regionInputEl instanceof HTMLInputElement)) return;
        if (!(fieldsWrapEl instanceof HTMLElement)) return;
        if (!(apikeyWrapEl instanceof HTMLElement)) return;
        if (!(voiceDropdownEl instanceof HTMLSelectElement)) return;
        if (!(rateDropdownEl instanceof HTMLSelectElement)) return;

        if (!(playPauseBtnEl instanceof HTMLButtonElement)) return;
        if (!(stopBtnEl instanceof HTMLButtonElement)) return;
        if (!(prevBtnEl instanceof HTMLButtonElement)) return;
        if (!(nextBtnEl instanceof HTMLButtonElement)) return;
        if (!(restartBtnEl instanceof HTMLButtonElement)) return;
        if (!(configBtnEl instanceof HTMLButtonElement)) return;
        if (!(hideBtnEl instanceof HTMLButtonElement)) return;
        if (!(infoBtnEl instanceof HTMLButtonElement)) return;
        if (!(helpBtnEl instanceof HTMLButtonElement)) return;
        if (!(jumpToggleBtnEl instanceof HTMLButtonElement)) return;
        if (!(jumpWrapEl instanceof HTMLElement)) return;
        if (!(jumpInputEl instanceof HTMLInputElement)) return;
        if (!(jumpGoBtnEl instanceof HTMLButtonElement)) return;

        const menuElements = {
            apikeyInput: apikeyInputEl,
            apikeyEye: apikeyEyeEl,
            regionToggleBtn: regionToggleBtnEl,
            regionWrap: regionWrapEl,
            regionInput: regionInputEl,
            fieldsWrap: fieldsWrapEl,
            apikeyWrap: apikeyWrapEl,
            voiceDropdown: voiceDropdownEl,
            rateDropdown: rateDropdownEl,
            playPauseBtn: playPauseBtnEl,
            stopBtn: stopBtnEl,
            prevBtn: prevBtnEl,
            nextBtn: nextBtnEl,
            restartBtn: restartBtnEl,
            configBtn: configBtnEl,
            hideBtn: hideBtnEl,
            infoBtn: infoBtnEl,
            helpBtn: helpBtnEl,
            jumpToggleBtn: jumpToggleBtnEl,
            jumpWrap: jumpWrapEl,
            jumpInput: jumpInputEl,
            jumpGoBtn: jumpGoBtnEl
        };

        const stored = this.__readSpeechResource();
        menuElements.apikeyInput.value = stored?.speechKey || "";
        menuElements.regionInput.value = stored?.region || "";
        menuElements.regionInput.style.paddingRight = "44px";

        const savedJumpVis = localStorage.getItem(this.#JUMP_VIS_KEY);
        const jumpVisible = savedJumpVis == null ? true : savedJumpVis === "true";
        this.__toggleJump(jumpVisible);

        void this.__applyApiKeyVisibility(
            menuElements.apikeyInput,
            menuElements.apikeyEye,
            !!window.readAloudState.apiKeyVisible
        );

        /**
         * @returns {void} Nothing.
         */
        const toggleApiKeyVisibility = (): void => {
            const visibleNow = menuElements.apikeyInput.type === "text";
            void this.__applyApiKeyVisibility(
                menuElements.apikeyInput,
                menuElements.apikeyEye,
                !visibleNow
            );
        };

        menuElements.apikeyEye.addEventListener("click", toggleApiKeyVisibility);

        menuElements.apikeyEye.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            toggleApiKeyVisibility();
        });

        this.__toggleCnfg(
            !localStorage.getItem("readAloudConfigMenuHidden") ||
                localStorage.getItem("readAloudConfigMenuHidden") === "false"
                ? true
                : window.readAloudState.configVisible
        );

        this.__setRegionUiVisible(!!window.readAloudState.regionUiVisible);

        menuElements.regionToggleBtn.addEventListener("click", () => {
            const next = !window.readAloudState.regionUiVisible;
            this.__setRegionUiVisible(next);
        });

        menuElements.regionInput.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const raw = menuElements.regionInput.value.trim().toLowerCase();
            this.__saveRegion(raw);
            this.__setRegionUiVisible(false);
        });

        menuElements.voiceDropdown.value =
            localStorage.getItem("readAloudPreferredVoice") || this.#VOICES[0].name;

        menuElements.rateDropdown.value = this.__getSpeechRate().toString();

        menuElements.apikeyInput.addEventListener("input", (e: Event) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement)) return;
            this.__saveApiKey(t.value.trim());
        });

        menuElements.playPauseBtn.addEventListener("click", async () => {
            const state = window.readAloudState;

            if (!state.paused) {
                menuElements.playPauseBtn.textContent = this.#buttons.play.icon;
                await this.__pause();
                return;
            }

            const speechKey = menuElements.apikeyInput.value.trim();
            const voiceName = menuElements.voiceDropdown.value;

            state.speechKey = speechKey;
            state.voiceName = voiceName;

            if (!speechKey) {
                menuElements.playPauseBtn.textContent = this.#buttons.play.icon;
                window.alert("Please enter your Azure Speech API key.");
                return;
            }

            const storedBefore = this.__readSpeechResource();
            const storedKey = storedBefore?.speechKey || "";
            let storedRegion = storedBefore?.region || "";
            let storedRegionLocked = !!storedBefore?.regionLocked;

            if (storedKey !== speechKey) {
                this.__writeSpeechResource({
                    speechKey,
                    region: storedRegion,
                    regionLocked: storedRegionLocked
                });
            }

            const typedRegion = menuElements.regionInput.value.trim().toLowerCase();
            const userEditingRegion = !!state.regionUiVisible;

            if (userEditingRegion && typedRegion === "") {
                storedRegion = "";
                storedRegionLocked = false;
                this.__writeSpeechResource({ speechKey, region: "", regionLocked: false });
            }

            const typedOverride = userEditingRegion && typedRegion !== "" && typedRegion !== storedRegion;
            const hasLockedRegion = typedOverride || (storedRegionLocked && storedRegion !== "");
            const lockedRegion = typedOverride ? typedRegion : storedRegion;

            const canReuseCached = !hasLockedRegion && storedKey === speechKey && storedRegion !== "";

            const regionDetectModalId = "readaloud-region-detect-modal";
            const regionDetectHtml = `
                <div class="modal-header">
                <h2>Detecting Azure region…</h2>
                </div>
                <div class="modal-content">
                <p>Checking regions for your API key. This can take a few seconds.</p>
                <p class="modal-note">Press <kbd>Esc</kbd> to close this message.</p>
                </div>
            `;

            const shouldDetect = !hasLockedRegion && !canReuseCached;

            let resolved: RegionResolveResult;

            try {
                if (shouldDetect) {
                    this.__openCustomModal(regionDetectHtml, regionDetectModalId);
                    document.documentElement.classList.add("cursor-wait");
                }

                resolved = hasLockedRegion
                    ? { region: lockedRegion, reason: "locked" }
                    : canReuseCached
                        ? { region: storedRegion, reason: "cached" }
                        : await this.__ensureRegionForKey(speechKey, storedRegion);
            } finally {
                if (shouldDetect) {
                    this.__closeCustomModal(regionDetectModalId);
                    document.documentElement.classList.remove("cursor-wait");
                }
            }

            if (!resolved.region) {
                menuElements.playPauseBtn.textContent = this.#buttons.play.icon;

                window.alert(
                    resolved.reason === "rate_limited"
                        ? "Region check was rate limited. Please use the 🌍 button and enter your region manually, then try again."
                        : "Could not find a working region for this key. Please use the 🌍 button and enter your region manually."
                );

                this.__toggleCnfg(true);
                this.__setRegionUiVisible(true);
                return;
            }

            state.serviceRegion = resolved.region;
            menuElements.regionInput.value = resolved.region;

            this.__writeSpeechResource({
                speechKey,
                region: resolved.region,
                regionLocked: hasLockedRegion
            });

            menuElements.playPauseBtn.textContent = this.#buttons.pause.icon;

            if (!state.paragraphs.length) {
                await this.__readAloud(speechKey, state.serviceRegion, voiceName);
                return;
            }

            await this.__resume();
        });

        menuElements.stopBtn.addEventListener("click", async () => {
            menuElements.playPauseBtn.textContent = this.#buttons.play.icon;
            await this.__clear();
        });

        menuElements.infoBtn.addEventListener("click", () => {
            const info = Object.entries(this.#buttons)
                .map(([, val]) => `${val.icon} - ${val.action}`)
                .join("\n");
            window.alert(`Read Aloud Menu Buttons:\n\n${info}`);
        });

        menuElements.helpBtn.addEventListener("click", () => {
            this.__openCustomModal(this.#HELP_MODAL, "readaloud-help-modal");
        });

        menuElements.prevBtn.addEventListener("click", async () => {
            await this.__prevParagraph();
        });

        menuElements.nextBtn.addEventListener("click", async () => {
            await this.__nextParagraph();
        });

        menuElements.restartBtn.addEventListener("click", async () => {
            await this.__restartAll();
        });

        menuElements.configBtn.addEventListener("click", () => {
            this.__toggleCnfg();
        });

        menuElements.hideBtn.addEventListener("click", () => {
            this.__toggleVis();
        });

        menuElements.jumpToggleBtn.addEventListener("click", () => {
            this.__toggleJump();
        });

        /**
         * @returns {Promise<void>} Resolves after jump attempt.
         */
        const doJump = async (): Promise<void> => {
            const raw = menuElements.jumpInput.value.trim();
            if (!raw) return;

            const paragraphNumber = Number.parseInt(raw, 10);
            if (!Number.isFinite(paragraphNumber) || paragraphNumber <= 0) return;

            await this.__jumpToParagraphNumber(paragraphNumber);
        };

        menuElements.jumpGoBtn.addEventListener("click", async () => {
            await doJump();
        });

        menuElements.jumpInput.addEventListener("keydown", async (e: KeyboardEvent) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            await doJump();
        });

        menuElements.rateDropdown.addEventListener("change", async (e: Event) => {
            const t = e.target;
            if (!(t instanceof HTMLSelectElement)) return;

            const rate = Number.parseFloat(t.value);
            if (!Number.isFinite(rate)) return;

            window.readAloudState.speechRate = rate;
            this.__saveSpeechRate(rate);

            const state = window.readAloudState;
            const idx = state.currentParagraphIndex;

            await this.__clearBuffer(state, idx).catch((err: unknown) => {
                console.error("[Change Rate] Error clearing Read Aloud buffer:", err);
            });
        });

        menuElements.voiceDropdown.addEventListener("change", async (e: Event) => {
            const t = e.target;
            if (!(t instanceof HTMLSelectElement)) return;

            this.__savePreferredVoice(t.value);

            const voiceName = t.value;
            window.readAloudState.voiceName = voiceName;

            const state = window.readAloudState;
            const idx = state.currentParagraphIndex;

            await this.__clearBuffer(state, idx).catch((err: unknown) => {
                console.error("[Change Voice] Error clearing Read Aloud buffer:", err);
            });
        });

        window.readAloudState.speechRate = this.__getSpeechRate();

        this.__enableNav();

        getEl("read-aloud-close")?.addEventListener("click", () => {
            this.#boundCloseMenu();
        });

        const fields = queryEl(".read-aloud-fields");
        if (fields) fields.style.display = window.readAloudState.configVisible ? "flex" : "none";

        const controls = queryEl(".reader-controls-top");
        this.__positionMenu(!!controls && controls.classList.contains("is-detached"));
    }

    /**
     * @returns {void} Nothing.
     */
    __enableNav(): void {
        if (!("mediaSession" in navigator)) return;

        navigator.mediaSession.setActionHandler("play", async () => {
            await this.__resume();
        });

        navigator.mediaSession.setActionHandler("pause", async () => {
            await this.__pause();
        });

        navigator.mediaSession.setActionHandler("previoustrack", async () => {
            await this.__prevParagraph();
        });

        navigator.mediaSession.setActionHandler("nexttrack", async () => {
            await this.__nextParagraph();
        });
    }

    /**
     * @param {boolean | null} forceValue - Forced value or null to toggle.
     * @returns {boolean} New config visibility.
     */
    __toggleCnfg(forceValue: boolean | null = null): boolean {
        const fields = queryEl(".read-aloud-fields");
        const configBtn = getEl("read-aloud-config");
        if (!fields) return false;

        const newValue = forceValue !== null
            ? !!forceValue
            : !window.readAloudState.configVisible;

        fields.style.display = newValue ? "flex" : "none";
        if (configBtn) configBtn.classList.toggle("menu-crossed", newValue);

        window.readAloudState.configVisible = newValue;
        localStorage.setItem("readAloudConfigVisible", String(newValue));
        localStorage.setItem("readAloudConfigMenuHidden", String(!newValue));

        return newValue;
    }

    /**
     * @param {boolean | null} forceValue - Forced value or null to toggle.
     * @returns {boolean} New jump visibility.
     */
    __toggleJump(forceValue: boolean | null = null): boolean {
        const jumpWrap = queryEl(".read-aloud-jump");
        const btn = getEl("read-aloud-jump-toggle");
        if (!jumpWrap || !btn) return false;

        const current = window.readAloudState.jumpVisible;
        const newValue = forceValue !== null ? !!forceValue : !current;

        jumpWrap.style.display = newValue ? "flex" : "none";
        btn.classList.toggle("menu-crossed", newValue);

        window.readAloudState.jumpVisible = newValue;
        localStorage.setItem(this.#JUMP_VIS_KEY, String(newValue));

        return newValue;
    }

    /**
     * @returns {void} Nothing.
     */
    __toggleVis(): void {
        const menu = getEl("read-aloud-menu");
        const toggleBtn = getEl("read-aloud-toggle");
        if (!menu || !toggleBtn) return;

        if (!window.readAloudState.originalMenuDisplay) {
            const computed = window.getComputedStyle(menu).display;
            window.readAloudState.originalMenuDisplay = menu.style.display || computed || "flex";
        }

        if (window.readAloudState.menuVisible) {
            menu.style.display = "none";
            window.readAloudState.menuVisible = false;

            toggleBtn.textContent = toggleBtn.getAttribute("data-enable") || "";
            toggleBtn.classList.remove("active");
            toggleBtn.classList.add("menu-eye");

            toggleBtn.removeEventListener("click", this.#boundCloseMenu);
            toggleBtn.addEventListener("click", this.#boundMenuVis);
            return;
        }

        menu.style.display = window.readAloudState.originalMenuDisplay || "flex";
        window.readAloudState.menuVisible = true;

        toggleBtn.textContent = toggleBtn.getAttribute("data-disable") || "";
        toggleBtn.classList.add("active");
        toggleBtn.classList.remove("menu-eye");

        toggleBtn.removeEventListener("click", this.#boundMenuVis);
        toggleBtn.addEventListener("click", this.#boundCloseMenu);
    }

    /**
     * @returns {Promise<void>} Resolves after restart attempt.
     */
    async __restartAll(): Promise<void> {
        const state = window.readAloudState;
        state.paused = true;

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();

        if (!state.paragraphs.length) return;

        state.currentParagraphIndex = 0;
        state.currentParagraphId = state.paragraphs[0] ? state.paragraphs[0].id : null;

        state.paused = false;
        await this.__speakP(0);
    }

    /**
     * @returns {Promise<void>} Resolves when menu is closed and speech paused.
     */
    async __closeMenu(): Promise<void> {
        const menu = getEl("read-aloud-menu");
        if (!menu) return;

        const toggleBtn = getEl("read-aloud-toggle");
        if (toggleBtn) {
            toggleBtn.textContent = toggleBtn.getAttribute("data-enable") || "";
            toggleBtn.classList.remove("active");
            toggleBtn.removeEventListener("click", this.#boundCloseMenu);
            toggleBtn.addEventListener("click", this.#boundShowMenu);
        }

        menu.style.display = "none";

        const playPauseBtn = getEl("read-aloud-toggle-playpause");
        if (playPauseBtn) playPauseBtn.textContent = this.#buttons.play.icon;

        window.readAloudState.pressed = false;

        menu.style.left = "50%";
        menu.style.top = "0";
        menu.style.transform = "translateX(-50%)";

        await this.__pause();
    }

    /**
     * @param {string} speechKey - Azure subscription key.
     * @param {string} serviceRegion - Azure region.
     * @param {string} voiceName - Voice name.
     * @param {string} tag - Container tag name.
     * @param {string} id - Container id.
     * @param {string} className - Container class.
     * @param {string | null} startFromId - Optional paragraph id to start from.
     * @returns {Promise<void>} Resolves after starting speech.
     */
    async __readAloud(
        speechKey: string,
        serviceRegion: string,
        voiceName: string = this.#VOICES[0].name,
        tag: string = "article",
        id: string = "reader",
        className: string = "reader-container",
        startFromId: string | null = null
    ): Promise<void> {
        await this.__sdkReady();

        let selector = tag;
        if (id) selector += `#${id}`;
        if (className) selector += `.${className}`;

        const container = document.querySelector(selector);
        if (!(container instanceof HTMLElement)) {
            console.error(`Element not found: ${selector}`);
            return;
        }

        const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".reader-bookmark"));
        if (!paragraphs.length) {
            console.error("No paragraphs found for read aloud.");
            return;
        }

        const startIdx = this.__startIndex(paragraphs, startFromId);

        window.readAloudState.paused = false;
        window.readAloudState.currentParagraphIndex = startIdx;
        window.readAloudState.currentParagraphId = paragraphs[startIdx] ? paragraphs[startIdx].id : null;
        window.readAloudState.paragraphs = paragraphs;
        window.readAloudState.voiceName = voiceName;
        window.readAloudState.speechKey = speechKey;
        window.readAloudState.serviceRegion = serviceRegion;

        await this.__speakP(startIdx);
    }

    /**
     * @param {readonly HTMLElement[]} paragraphs - Paragraph elements.
     * @param {string | null} startFromId - Optional paragraph id.
     * @returns {number} Starting index.
     */
    __startIndex(paragraphs: readonly HTMLElement[], startFromId: string | null): number {
        if (startFromId) {
            const idx = paragraphs.findIndex((p) => p.id === startFromId);
            if (idx >= 0) return idx;
        }

        const saved = localStorage.getItem("readAloudAudioPosition");
        if (!saved) return 0;

        let savedObjUnknown: unknown;
        try {
            savedObjUnknown = JSON.parse(saved);
        } catch {
            return 0;
        }

        if (!isRecord(savedObjUnknown)) return 0;

        const paragraphId = typeof savedObjUnknown.paragraphId === "string" ? savedObjUnknown.paragraphId : null;
        if (paragraphId) {
            const idxSaved = paragraphs.findIndex((p) => p.id === paragraphId);
            if (idxSaved >= 0) return idxSaved;
        }

        const paragraphIndex = typeof savedObjUnknown.paragraphIndex === "number" ? savedObjUnknown.paragraphIndex : -1;
        if (paragraphIndex >= 0 && paragraphIndex < paragraphs.length) return paragraphIndex;

        return 0;
    }

    /**
     * @param {number} idx - Paragraph index.
     * @returns {Promise<void>} Resolves after the paragraph pipeline completes.
     */
    async __speakP(idx: number): Promise<void> {
        const state = window.readAloudState;
        if (state.paused || idx >= state.paragraphs.length) return;

        if (
            state.currentParagraphIndex !== undefined &&
            state.currentParagraphIndex !== idx &&
            state.paragraphs[state.currentParagraphIndex]
        ) {
            this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);
        }

        const paragraph = state.paragraphs[idx] ?? null;
        this.__highlightP(paragraph);
        this.__scrollToP(paragraph);

        const plainText = this.__getParagraphPlainText(paragraph);
        if (!plainText) {
            await this.__speakP(idx + 1);
            return;
        }

        if ("mediaSession" in navigator) {
            const params = new URLSearchParams(window.location.search);
            const rawStory = params.get("story") || "";
            const chapter = params.get("chapter") || "";

            const storyName = decodeURIComponent(rawStory).split("/").pop() || "Unknown Story";
            const chapterName = `Chapter ${chapter}`;
            const artist = window.location.origin;

            navigator.mediaSession.metadata = new MediaMetadata({
                title: plainText.slice(0, 60),
                artist,
                album: storyName,
                // @ts-ignore
                track: chapterName,
                artwork: []
            });
        }

        if (!state.speechKey || !state.serviceRegion) {
            window.alert("Please enter your Azure Speech API key. The region will be detected automatically, or you can set it with 🌍.");
            return;
        }

        const sdk = window.SpeechSDK;
        if (!sdk) {
            window.alert("Speech SDK is not loaded. Please check your connection or script includes.");
            return;
        }

        state.currentParagraphIndex = idx;
        state.currentParagraphId = paragraph ? paragraph.id : null;
        state.lastSpokenText = plainText;

        localStorage.setItem("readAloudAudioPosition", JSON.stringify({
            paragraphId: state.currentParagraphId,
            paragraphIndex: state.currentParagraphIndex
        }));

        if (state.currentParagraphId) forceBookmark(state.currentParagraphId);

        try {
            let audioData: ArrayBuffer | null;

            if (state.buffer && state.buffer.idx === idx) {
                audioData = state.buffer.audioData;
                state.buffer = null;
            } else {
                audioData = await this.__bufferPAudio(idx, true);
            }

            if (idx + 1 < state.paragraphs.length) {
                void this.__bufferPAudio(idx + 1, false);
            }

            if (!audioData) {
                await this.__speakP(idx + 1);
                return;
            }

            await this.__playAudioBlob(audioData);

            if (!state.paused) {
                await this.__speakP(idx + 1);
            }
        } catch (error: unknown) {
            const handled = await this.__handleRuntimeSpeakFailure();
            if (!handled) {
                window.alert("Read Aloud stopped due to a connection issue.");
            }
            await this.__pause();
        }
    }

    /**
     * @param {number} idx - Paragraph index.
     * @param {boolean} blocking - If true, return audioData. If false, cache into state.buffer.
     * @returns {Promise<ArrayBuffer | null>} Audio data or null if skipped.
     */
    async __bufferPAudio(idx: number, blocking: boolean = false): Promise<ArrayBuffer | null> {
        const state = window.readAloudState;
        if (idx >= state.paragraphs.length) return null;

        const paragraph = state.paragraphs[idx] ?? null;
        const plainText = this.__getParagraphPlainText(paragraph);
        if (!plainText) return null;

        const sdk = await this.__sdkReady();
        const ssml = this.__buildSSML(plainText, state.voiceName, state.speechRate);

        const speechConfig = sdk.SpeechConfig.fromSubscription(state.speechKey, state.serviceRegion);
        speechConfig.speechSynthesisVoiceName = state.voiceName;
        speechConfig.setProperty(
            sdk.PropertyId.SpeechSynthesisOutputFormat,
            sdk.SpeechSynthesisOutputFormat.Audio16Khz32KBitRateMonoMp3
        );

        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);

        return new Promise<ArrayBuffer>((resolve, reject) => {
            synthesizer.speakSsmlAsync(
                ssml,
                (result) => {
                    synthesizer.close();

                    if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
                        reject(new Error(result.errorDetails || "Speech synthesis failed"));
                        return;
                    }

                    if (!blocking) {
                        window.readAloudState.buffer = { idx, audioData: result.audioData };
                    }

                    resolve(result.audioData);
                },
                (error) => {
                    synthesizer.close();
                    reject(error);
                }
            );
        });
    }

    /**
     * @param {ArrayBuffer} audioData - MP3 data.
     * @returns {Promise<void>} Resolves when playback ends.
     */
    async __playAudioBlob(audioData: ArrayBuffer): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const state = window.readAloudState;

            const audioBlob = new Blob([audioData], { type: "audio/mp3" });
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);

            state.currentAudio = audio;
            state.currentAudioUrl = audioUrl;

            let settled = false;

            /**
             * @returns {void} Nothing.
             */
            const cleanup = (): void => {
                if (state.currentAudio === audio) state.currentAudio = null;

                if (state.currentAudioUrl === audioUrl) {
                    URL.revokeObjectURL(audioUrl);
                    state.currentAudioUrl = null;
                    return;
                }

                URL.revokeObjectURL(audioUrl);
            };

            audio.onpause = () => {
                const wasInterrupted = !audio.ended && !state.paused;
                if (wasInterrupted) void this.__pause();
            };

            audio.onended = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };

            audio.onerror = (e) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(e);
            };

            audio.play().catch((err: unknown) => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(err);
            });
        });
    }

    /**
     * @returns {Promise<void>} Resolves when paused and state saved.
     */
    async __pause(): Promise<void> {
        const state = window.readAloudState;
        state.paused = true;

        if (state.currentAudio) state.currentAudio.pause();

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        await this.__stopAsync();

        localStorage.setItem("readAloudAudioPosition", JSON.stringify({
            paragraphId: state.currentParagraphId,
            paragraphIndex: state.currentParagraphIndex
        }));

        const playPauseBtn = getEl("read-aloud-toggle-playpause");
        if (!playPauseBtn) return;

        playPauseBtn.textContent = this.#buttons.play.icon;
        playPauseBtn.title = this.#buttons.play.action;
    }

    /**
     * @returns {Promise<void>} Resolves after resuming speech.
     */
    async __resume(): Promise<void> {
        const state = window.readAloudState;
        state.paused = false;

        const idx = state.currentParagraphIndex || 0;
        await this.__speakP(idx);
    }

    /**
     * @returns {Promise<void>} Resolves after clearing session state.
     */
    async __clear(): Promise<void> {
        const state = window.readAloudState;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        state.currentParagraphIndex = 0;
        state.currentParagraphId = state.paragraphs[0] ? state.paragraphs[0].id : null;
        state.paused = true;

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        localStorage.removeItem("readAloudAudioPosition");
    }

    /**
     * @returns {Promise<void>} Resolves after stopping any active synthesizer/audio.
     */
    async __stopAsync(): Promise<void> {
        const state = window.readAloudState;

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        if (state.currentAudioUrl) {
            URL.revokeObjectURL(state.currentAudioUrl);
            state.currentAudioUrl = null;
        }

        const synth = state.synthesizer;
        if (synth?.stopSpeakingAsync) {
            await new Promise<void>((resolve) => {
                synth.stopSpeakingAsync?.(() => {
                    synth.close();
                    state.synthesizer = null;
                    resolve();
                });
            });
            return;
        }

        if (synth) {
            synth.close();
            state.synthesizer = null;
        }
    }

    /**
     * @param {HTMLElement | null} paragraph - Paragraph to highlight.
     * @returns {void} Nothing.
     */
    __highlightP(paragraph: HTMLElement | null): void {
        window.readAloudState.paragraphs.forEach((p) => {
            p.classList.remove("read-aloud-active", "read-aloud-fadeout");
        });

        if (!paragraph) return;

        paragraph.classList.add("read-aloud-active");
        paragraph.classList.remove("read-aloud-fadeout");
    }

    /**
     * @param {HTMLElement | null} paragraph - Paragraph to fade out.
     * @returns {void} Nothing.
     */
    __FOHighlight(paragraph: HTMLElement | null): void {
        if (!paragraph) return;

        paragraph.classList.add("read-aloud-fadeout");
        window.setTimeout(() => {
            paragraph.classList.remove("read-aloud-active", "read-aloud-fadeout");
        }, 600);
    }

    /**
     * @param {HTMLElement | null} paragraph - Paragraph to scroll into view.
     * @returns {void} Nothing.
     */
    __scrollToP(paragraph: HTMLElement | null): void {
        if (!paragraph) return;

        paragraph.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    }

    /**
     * @returns {Promise<void>} Resolves after moving to next paragraph.
     */
    async __nextParagraph(): Promise<void> {
        const state = window.readAloudState;
        if (!state.paragraphs.length) return;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        state.paused = true;

        let idx = state.currentParagraphIndex;
        idx = idx < state.paragraphs.length - 1 ? idx + 1 : 0;

        state.currentParagraphIndex = idx;
        state.currentParagraphId = state.paragraphs[idx].id;

        this.__highlightP(state.paragraphs[idx]);
        this.__scrollToP(state.paragraphs[idx]);

        state.paused = false;
        await this.__clearBuffer(state, idx);
    }

    /**
     * @returns {Promise<void>} Resolves after moving to previous paragraph.
     */
    async __prevParagraph(): Promise<void> {
        const state = window.readAloudState;
        if (!state.paragraphs.length) return;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        state.paused = true;

        let idx = state.currentParagraphIndex;
        idx = idx > 0 ? idx - 1 : state.paragraphs.length - 1;

        state.currentParagraphIndex = idx;
        state.currentParagraphId = state.paragraphs[idx].id;

        this.__highlightP(state.paragraphs[idx]);
        this.__scrollToP(state.paragraphs[idx]);

        state.paused = false;
        await this.__clearBuffer(state, idx);
    }

    /**
     * @param {number} paragraphNumber - 1-based paragraph number.
     * @returns {Promise<void>} Resolves after jump attempt.
     */
    async __jumpToParagraphNumber(paragraphNumber: number): Promise<void> {
        await this.reloadReadAloud();
        const state = window.readAloudState;

        if (!state.paragraphs || state.paragraphs.length === 0) return;

        const idx = paragraphNumber - 1;
        if (idx < 0 || idx >= state.paragraphs.length) return;

        const wasPlaying = !state.paused;

        this.__FOHighlight(state.paragraphs[state.currentParagraphIndex]);

        if (state.currentAudio) {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
            state.currentAudio = null;
        }

        await this.__stopAsync();
        state.buffer = null;

        state.currentParagraphIndex = idx;
        state.currentParagraphId = state.paragraphs[idx].id;

        localStorage.setItem("readAloudAudioPosition", JSON.stringify({
            paragraphId: state.currentParagraphId,
            paragraphIndex: state.currentParagraphIndex
        }));

        this.__highlightP(state.paragraphs[idx]);
        this.__scrollToP(state.paragraphs[idx]);

        if (state.currentParagraphId) forceBookmark(state.currentParagraphId);

        if (!wasPlaying) {
            state.paused = true;
            const playPauseBtn = getEl("read-aloud-toggle-playpause");
            if (playPauseBtn) playPauseBtn.textContent = this.#buttons.play.icon;
            return;
        }

        state.paused = false;
        await this.__speakP(idx);
    }

    /**
     * @param {ReadAloudState} state - Read aloud state.
     * @param {number | null | undefined} idx - Optional index to speak from.
     * @returns {Promise<void>} Resolves after buffer is cleared and playback continues if needed.
     */
    async __clearBuffer(state: ReadAloudState, idx: number | null | undefined): Promise<void> {
        const pausedState = state.paused;
        state.buffer = null;
        await this.__stopAsync();
        state.paused = pausedState;

        if (state.paused) return;

        const nextIdx = idx == null ? (state.currentParagraphIndex ?? 0) : idx;
        await this.__speakP(nextIdx);
    }

    /**
     * @param {string} voiceName - Voice name.
     * @returns {void} Nothing.
     */
    __savePreferredVoice(voiceName: string): void {
        localStorage.setItem("readAloudPreferredVoice", voiceName);
    }

    /**
     * @param {string} apiKey - API key.
     * @returns {void} Nothing.
     */
    __saveApiKey(apiKey: string): void {
        const stored = this.__readSpeechResource();
        const region = stored?.region || "";
        const regionLocked = !!stored?.regionLocked;

        this.__writeSpeechResource({ speechKey: apiKey, region, regionLocked });
        localStorage.setItem("readAloudConfigMenuHidden", String(apiKey !== ""));
    }

    /**
     * @param {string} region - Region string.
     * @returns {void} Nothing.
     */
    __saveRegion(region: string): void {
        const stored = this.__readSpeechResource();
        const speechKey = stored?.speechKey || "";
        const regionLocked = region !== "";

        this.__writeSpeechResource({ speechKey, region, regionLocked });
    }

    /**
     * @param {number} rate - Rate multiplier.
     * @returns {void} Nothing.
     */
    __saveSpeechRate(rate: number): void {
        localStorage.setItem("readAloudSpeechRate", String(rate));
    }

    /**
     * @returns {number} Speech rate.
     */
    __getSpeechRate(): number {
        return Number.parseFloat(localStorage.getItem("readAloudSpeechRate") || "") || 1.0;
    }

    /**
     * @param {string} html - Modal HTML.
     * @param {string} modalId - Modal id.
     * @returns {void} Nothing.
     */
    __openCustomModal(html: string, modalId: string): void {
        const overlayId = `modal-overlay-${modalId}`;

        if (document.getElementById(modalId)) return;
        if (document.getElementById(overlayId)) return;

        const overlay = document.createElement("div") as ModalOverlayEl;
        overlay.id = overlayId;
        overlay.className = "modal-overlay";

        const modal = document.createElement("div");
        modal.id = modalId;
        modal.className = "modal";
        modal.innerHTML = html;

        document.body.classList.add("no-scroll");

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        window.closeCustomModal = (id: string): void => this.__closeCustomModal(id);

        overlay.addEventListener("click", (event: MouseEvent) => {
            if (event.target !== overlay) return;
            this.__closeCustomModal(modalId);
        });

        /**
         * @param {KeyboardEvent} event - Keydown event.
         * @returns {void} Nothing.
         */
        const handleEscape = (event: KeyboardEvent): void => {
            if (event.key !== "Escape") return;
            this.__closeCustomModal(modalId);
        };

        overlay.__handleEscape = handleEscape;
        document.addEventListener("keydown", handleEscape);
    }

    /**
     * @param {string} modalId - Modal id.
     * @returns {void} Nothing.
     */
    __closeCustomModal(modalId: string): void {
        const overlayId = `modal-overlay-${modalId}`;

        const modal = document.getElementById(modalId);
        const overlay =
            document.getElementById(overlayId) ||
            (modal ? (modal.closest(".modal-overlay") as HTMLElement | null) : null);

        if (!(overlay instanceof HTMLDivElement)) return;

        const overlayEl = overlay as ModalOverlayEl;

        const handleEscape = overlayEl.__handleEscape;
        if (handleEscape) document.removeEventListener("keydown", handleEscape);

        overlayEl.remove();

        const remaining = document.querySelectorAll(".modal-overlay, #modal-overlay").length;
        if (remaining) return;

        document.body.classList.remove("no-scroll");
    }

    /**
     * @returns {Promise<void>} Resolves after refreshing paragraph list.
     */
    async reloadReadAloud(): Promise<void> {
        const container = document.querySelector("article#reader, main, article");
        if (!(container instanceof HTMLElement)) return;

        const paragraphs = Array.from(container.querySelectorAll<HTMLElement>(".reader-bookmark"));
        if (paragraphs.length <= 0) return;

        window.readAloudState.paragraphs = paragraphs;
        window.readAloudState.currentParagraphIndex = 0;
        window.readAloudState.currentParagraphId = paragraphs[0]?.id || null;
    }
}

const RAM = new ReadAloudModule();

export const showMenu = RAM.getMenuHndlr();
export const reload = RAM.getReloadHndlr();