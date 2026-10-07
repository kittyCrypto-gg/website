import type { ReactElement } from "react";
import type { fxUIconf } from "./uiFetch.ts";
import * as modals from "./modals.ts";
import { THEME_MODE_CHANGED_EVENT } from "./themeChanger.ts";
import { render2Mkup } from "./reactHelpers.tsx";
import { installMenuToggle } from "./menues.tsx";

type Prefs = Readonly<{
    phosphorEnabled: boolean;
    phosphorOpacity: number;
    scanlinesEnabled: boolean;
    scanlineOpacity: number;
    scanlineSpeed: number;
    textShadowEnabled: boolean;
    textShadowIntensity: number;
}>;

type StoredPrefs = Readonly<Partial<Prefs>>;

type Props = Readonly<{
    prefs: Prefs;
    ui: fxUIconf;
}>;

type Ctx = Readonly<{
    modalEl: HTMLDivElement;
}>;

type ModalDecorator = ReturnType<typeof modals.closeOnClick>;
type ModalCtx = Parameters<NonNullable<ModalDecorator["mount"]>>[0];

const STORAGE_KEY = "kcEffectsPrefs";
const BTN_ID = "effects-toggle";
const MOD_ID = "screen-effects";
const BTN_BOTTOM = "80px";
const EFFECTS_TIP_MODAL_ID = "kc-effects-help-modal";
const EFFECTS_TIP_HIDE_KEY = "effectsHelpModalHide";

const PHOS_OP_MIN = 0;
const PHOS_OP_MAX = 0.12;

const SCAN_OP_MIN = 0;
const SCAN_OP_MAX = 0.3;

const SCAN_SPD_MIN = 0;
const SCAN_SPD_MAX = 100;
const DEF_SCAN_SPD = 90;

const SCAN_MS_MIN = 1;
const SCAN_MS_MAX = 22000;

/*
 * Text-shadow intensity is expressed to the UI as 0..100%.
 * 20% is the base/original strength.
 * The upper range follows a non-linear curve so 100% is intentionally obnoxious.
 */
const TEXT_SHADOW_MIN = 0;
const TEXT_SHADOW_MAX = 100;
const TEXT_SHADOW_DEFAULT_PERCENT = 15;
const TEXT_SHADOW_BASE_PERCENT = 20;
const TEXT_SHADOW_CURVE_EXPONENT = 1.55;

const TEXT_SHADOW_KEYFRAMES_STYLE_ID =
    "effect-crt-text-shadow-keyframes";

const TEXT_SHADOW_FRAME_STEP = 5;
const TEXT_SHADOW_RANDOM_SEED = 0x435254;

const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_STEP = 1;

let defPrefs: Prefs | null = null;
let mod: modals.Modal | null = null;
let syncOn = false;
let uiCfg: fxUIconf | null = null;
let textShadowObserver: MutationObserver | null = null;
let effectsTipShown = false;
let effectsTipObs: IntersectionObserver | null = null;

/**
 * 
 * @param {number} intensity 
 * @returns {void}
 */
function applyTextShadowScale(intensity: number): void {
    const multiplier =
        document.documentElement.classList.contains("dark-mode")
            ? 2.13
            : 1;

    const scale =
        textShadowScale(intensity) *
        multiplier;

    document.documentElement.style.setProperty(
        "--effect-crt-text-shadow-scale",
        cssNum(scale)
    );
}

/**
 * Clamp thing. Keeps slider rubbish in bounds and stops NaN being annoying.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * Pulls a num out of css/storage text.
 * if it cant, just uses fallback and shrugs.
 * @param {string} raw
 * @param {number} fallback
 * @returns {number}
 */
function num(raw: string, fallback: number): number {
    const parsed = Number.parseFloat(raw.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Makes a readable percent string.
 * @param {number} value
 * @returns {string}
 */
function pct(value: number): string {
    return `${Math.round(clamp(value, 0, 100))}%`;
}

/**
 * Small css-safe-ish number formatter.
 * trims float gunk a bit.
 * @param {number} value
 * @returns {string}
 */
function cssNum(value: number): string {
    return String(Number(value.toFixed(3)));
}

/**
 * Maps the 0..100 UI value onto the actual text-shadow multiplier.
 *
 * 20% is deliberately anchored at 1x as the base CRT strength.
 * Above that, the curve ramps increasingly hard so 100% becomes properly
 * obnoxious rather than merely "a bit more RGB".
 *
 * @param {number} intensity
 * @returns {number}
 */
function textShadowScale(intensity: number): number {
    const clampedIntensity = clamp(
        intensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    if (clampedIntensity <= 0) {
        return 0;
    }

    const normalised =
        clampedIntensity /
        TEXT_SHADOW_BASE_PERCENT;

    return Math.pow(
        normalised,
        TEXT_SHADOW_CURVE_EXPONENT
    );
}


/**
 * Creates a deterministic pseudo-random generator.
 * Same seed means the CRT jitter pattern is identical every page load.
 *
 * @param {number} initialSeed
 * @returns {() => number}
 */
function createRandomGenerator(initialSeed: number): () => number {
    let state = initialSeed >>> 0;

    return (): number => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;

        return (state >>> 0) / 4294967296;
    };
}

/**
 * Rounds a number to one decimal place.
 *
 * @param {number} value
 * @returns {number}
 */
function oneDecimal(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Builds the deterministic CRT text-shadow animation.
 *
 * The frame cadence stays at 5%, but the jitter values are generated rather
 * than hand-written. Each multiplier is rounded to one decimal place.
 *
 * The generated frames use the stylesheet's base distance, blur and RGB alpha
 * variables, multiplied by the live intensity scale written by apply().
 *
 * @returns {string}
 */
function buildTextShadowKeyframes(): string {
    const random = createRandomGenerator(TEXT_SHADOW_RANDOM_SEED);
    const frames: string[] = [];

    for (
        let percent = 0;
        percent <= 100;
        percent += TEXT_SHADOW_FRAME_STEP
    ) {
        const jitter = oneDecimal(random());
        const jitterText = jitter.toFixed(1);

        frames.push(`
${String(percent)}% {
  text-shadow:
    calc(
      var(--effect-crt-text-shadow-distance) *
      var(--effect-crt-text-shadow-scale, 1) *
      ${jitterText}
    )
    0
    1px
    rgb(
      0 30 255 /
      calc(
        var(--effect-crt-text-shadow-blue-alpha) *
        var(--effect-crt-text-shadow-scale, 1)
      )
    ),

    calc(
      var(--effect-crt-text-shadow-distance) *
      var(--effect-crt-text-shadow-scale, 1) *
      -${jitterText}
    )
    0
    1px
    rgb(
      255 0 80 /
      calc(
        var(--effect-crt-text-shadow-red-alpha) *
        var(--effect-crt-text-shadow-scale, 1)
      )
    ),

    0
    0
    calc(
      var(--effect-crt-text-shadow-blur) *
      var(--effect-crt-text-shadow-scale, 1)
    );
}`);
    }

    return `
@keyframes effect-crt-text-shadow {
${frames.join("\n\n")}
}
`.trim();
}

/**
 * Builds the deterministic CRT chromatic-aberration animation for SVGs.
 *
 * SVG geometry does not respond to `text-shadow`, so this mirrors the text
 * effect using CSS `filter: drop-shadow()`.
 *
 * The frame cadence and pseudo-random jitter sequence intentionally match
 * `buildTextShadowKeyframes()` so text and SVG graphics distort in sync.
 *
 * The generated frames use the same stylesheet distance and RGB alpha
 * variables, multiplied by the live intensity scale written by apply().
 *
 * @returns {string}
 */
function buildSvgShadowKeyframes(): string {
    const random = createRandomGenerator(TEXT_SHADOW_RANDOM_SEED);
    const frames: string[] = [];

    for (
        let percent = 0;
        percent <= 100;
        percent += TEXT_SHADOW_FRAME_STEP
    ) {
        const jitter = oneDecimal(random());
        const jitterText = jitter.toFixed(1);

        frames.push(`
${String(percent)}% {
  filter:
    drop-shadow(
      calc(
        var(--effect-crt-text-shadow-distance) *
        var(--effect-crt-text-shadow-scale, 1) *
        ${jitterText}
      )
      0
      1px
      rgb(
        0 30 255 /
        calc(
          var(--effect-crt-text-shadow-blue-alpha) *
          var(--effect-crt-text-shadow-scale, 1)
        )
      )
    )

    drop-shadow(
      calc(
        var(--effect-crt-text-shadow-distance) *
        var(--effect-crt-text-shadow-scale, 1) *
        -${jitterText}
      )
      0
      1px
      rgb(
        255 0 80 /
        calc(
          var(--effect-crt-text-shadow-red-alpha) *
          var(--effect-crt-text-shadow-scale, 1)
        )
      )
    );
}`);
    }

    return `
@keyframes effect-crt-svg-shadow {
${frames.join("\n\n")}
}
`.trim();
}


/**
 * Elements whose contents are not ordinary rendered page text.
 */
const TEXT_SHADOW_SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE"
]);

/**
 * Resolves the element that should carry the CRT text-shadow animation
 * for one text node.
 *
 * Animated emoticons use their wrapper so the CRT animation does not
 * overwrite their own blink animation.
 *
 * @param {Node} node
 * @returns {HTMLElement | null}
 */
function textShadowTarget(node: Node): HTMLElement | null {
    if (node.nodeType !== Node.TEXT_NODE) return null;
    if (!(node.nodeValue?.trim())) return null;

    const parent = node.parentElement;
    if (!parent) return null;

    const counterShell = parent.closest(".clicker-counter__face-shell");

    if (counterShell instanceof HTMLElement) {
        return counterShell;
    }

    if (parent.closest("svg")) return null;
    if (TEXT_SHADOW_SKIP_TAGS.has(parent.tagName)) return null;

    const blink = parent.closest(".emoticon-blink");

    return blink instanceof HTMLElement
        ? blink
        : parent;
}

/**
 * Marks one text node for the CRT text-shadow effect.
 *
 * @param {Node} node
 * @returns {void}
 */
function markTextShadowNode(node: Node): void {

    if (node instanceof SVGSVGElement) {
        node.classList.add("text-shadow");
        return;
    }

    const target = textShadowTarget(node);
    if (!target) return;

    target.classList.add("text-shadow");
}

/**
 * Marks all text below one DOM node.
 *
 * @param {Node} root
 * @returns {void}
 */
function markTextShadowTargets(root: Node): void {
    markTextShadowNode(root);

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT |
        NodeFilter.SHOW_ELEMENT
    );

    for (
        let node = walker.nextNode();
        node;
        node = walker.nextNode()
    ) {
        markTextShadowNode(node);
    }
}

/**
 * Handles one DOM mutation.
 *
 * @param {MutationRecord} mutation
 * @returns {void}
 */
function handleTextShadowMutation(mutation: MutationRecord): void {
    if (mutation.type === "characterData") {
        markTextShadowNode(mutation.target);
        return;
    }

    mutation.addedNodes.forEach(markTextShadowTargets);
}

/**
 * Marks existing text and watches for text added later.
 *
 * @returns {void}
 */
function ensureTextShadowTargets(): void {
    markTextShadowTargets(document.body);
    if (textShadowObserver) return;

    textShadowObserver = new MutationObserver((mutations) => {
        mutations.forEach(handleTextShadowMutation);
    });

    textShadowObserver.observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
    });
}

/**
 * Installs the generated CRT text-shadow keyframes once.
 *
 * @returns {void}
 */
function ensureTextShadowKeyframes(): void {
    if (document.getElementById(TEXT_SHADOW_KEYFRAMES_STYLE_ID)) {
        return;
    }

    const styleElement = document.createElement("style");

    styleElement.id = TEXT_SHADOW_KEYFRAMES_STYLE_ID;
    styleElement.textContent = [
        buildTextShadowKeyframes(),
        buildSvgShadowKeyframes()
    ].join("\n\n");

    document.head.appendChild(styleElement);
}

/**
 * Maps opacity to slider percent.
 * @param {number} opacity
 * @param {number} maxOpacity
 * @returns {number}
 */
function opToPct(opacity: number, maxOpacity: number): number {
    if (maxOpacity <= 0) return 0;
    return clamp((clamp(opacity, 0, maxOpacity) / maxOpacity) * 100, 0, 100);
}

/**
 * Maps slider percent back to actual opacity.
 * @param {number} percent
 * @param {number} maxOpacity
 * @returns {number}
 */
function pctToOp(percent: number, maxOpacity: number): number {
    return clamp((clamp(percent, 0, 100) / 100) * maxOpacity, 0, maxOpacity);
}

/**
 * Turns ms into a css duration string.
 * @param {number} value
 * @returns {string}
 */
function ms(value: number): string {
    return `${Math.round(
        clamp(value, SCAN_MS_MIN, SCAN_MS_MAX)
    )}ms`;
}

/**
 * Speed percent to travel duration. Faster speed means less ms, obv.
 * @param {number} speed
 * @returns {number}
 */
function spdToMs(speed: number): number {
    const clampedSpeed = clamp(speed, SCAN_SPD_MIN, SCAN_SPD_MAX);
    if (clampedSpeed <= 0) return SCAN_MS_MAX;

    const progress = (clampedSpeed - 1) / 99;

    return (
        SCAN_MS_MAX -
        progress * (SCAN_MS_MAX - SCAN_MS_MIN)
    );
}

/**
 * Duration back into speed percent.
 * @param {number} durationMs
 * @returns {number}
 */
function msToSpd(durationMs: number): number {
    const clampedDuration = clamp(
        durationMs,
        SCAN_MS_MIN,
        SCAN_MS_MAX
    );

    const progress =
        (SCAN_MS_MAX - clampedDuration) /
        (SCAN_MS_MAX - SCAN_MS_MIN);

    return clamp(1 + progress * 99, SCAN_SPD_MIN, SCAN_SPD_MAX);
}

/**
 * Current ui config getter. Throws if init got skipped somewhere.
 * @returns {fxUIconf}
 */
function ui(): fxUIconf {
    if (!uiCfg) {
        throw new Error("Effects UI config has not been initialised.");
    }

    return uiCfg;
}

/**
 * Reads the css/body defaults as the baseline prefs.
 * @returns {Prefs}
 */
function readCss(): Prefs {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const body = document.body;

    return {
        phosphorEnabled: !body.classList.contains("effect-disable-phosphor"),
        phosphorOpacity: clamp(
            num(rootStyle.getPropertyValue("--effect-crt-phosphor-opacity"), 0.02),
            PHOS_OP_MIN,
            PHOS_OP_MAX
        ),
        scanlinesEnabled: !body.classList.contains("effect-disable-scanlines"),
        scanlineOpacity: clamp(
            num(rootStyle.getPropertyValue("--effect-crt-scanline-opacity"), 0.1),
            SCAN_OP_MIN,
            SCAN_OP_MAX
        ),
        scanlineSpeed: DEF_SCAN_SPD,
        textShadowEnabled: !body.classList.contains("effect-disable-text-shadow"),
        textShadowIntensity: clamp(
            num(
                rootStyle.getPropertyValue("--effect-crt-text-shadow-intensity"),
                TEXT_SHADOW_DEFAULT_PERCENT
            ),
            TEXT_SHADOW_MIN,
            TEXT_SHADOW_MAX
        )
    };
}

/**
 * Memoised defaults getter.
 * @returns {Prefs}
 */
function defs(): Prefs {
    if (defPrefs) return defPrefs;
    defPrefs = readCss();
    return defPrefs;
}

/**
 * Reads saved prefs from storage if they look sane enough.
 * @returns {StoredPrefs | null}
 */
function stored(): StoredPrefs | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

        const record = parsed as Record<string, unknown>;

        return {
            phosphorEnabled:
                typeof record.phosphorEnabled === "boolean" ? record.phosphorEnabled : undefined,
            phosphorOpacity:
                typeof record.phosphorOpacity === "number" ? record.phosphorOpacity : undefined,
            scanlinesEnabled:
                typeof record.scanlinesEnabled === "boolean" ? record.scanlinesEnabled : undefined,
            scanlineOpacity:
                typeof record.scanlineOpacity === "number" ? record.scanlineOpacity : undefined,
            scanlineSpeed:
                typeof record.scanlineSpeed === "number" ? record.scanlineSpeed : undefined,
            textShadowEnabled:
                typeof record.textShadowEnabled === "boolean" ? record.textShadowEnabled : undefined,
            textShadowIntensity:
                typeof record.textShadowIntensity === "number"
                    ? record.textShadowIntensity
                    : undefined
        };
    } catch {
        return null;
    }
}

/**
 * Merges stored prefs over base prefs, with clamping and the enable/opacity coupling.
 * bit fiddly but its fine.
 * @param {Prefs} base
 * @param {StoredPrefs | null} fromStore
 * @returns {Prefs}
 */
function merge(base: Prefs, fromStore: StoredPrefs | null): Prefs {
    if (!fromStore) return base;

    const phosphorOpacity = clamp(
        fromStore.phosphorOpacity ?? base.phosphorOpacity,
        PHOS_OP_MIN,
        PHOS_OP_MAX
    );
    const scanlineOpacity = clamp(
        fromStore.scanlineOpacity ?? base.scanlineOpacity,
        SCAN_OP_MIN,
        SCAN_OP_MAX
    );
    const scanlineSpeed = clamp(
        fromStore.scanlineSpeed ?? base.scanlineSpeed,
        SCAN_SPD_MIN,
        SCAN_SPD_MAX
    );
    const textShadowIntensity = clamp(
        fromStore.textShadowIntensity ?? base.textShadowIntensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );
    const textShadowEnabled =
        textShadowIntensity > 0 &&
        (fromStore.textShadowEnabled ?? base.textShadowEnabled);

    return {
        phosphorEnabled: phosphorOpacity > 0 && (fromStore.phosphorEnabled ?? base.phosphorEnabled),
        phosphorOpacity,
        scanlinesEnabled: scanlineOpacity > 0 && (fromStore.scanlinesEnabled ?? base.scanlinesEnabled),
        scanlineOpacity,
        scanlineSpeed,
        textShadowEnabled,
        textShadowIntensity
    };
}

/**
 * Reads whats currently live in the DOM right now.
 * @returns {Prefs}
 */
function live(): Prefs {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const body = document.body;
    const base = defs();

    const phosphorOpacity = clamp(
        num(
            rootStyle.getPropertyValue("--effect-crt-phosphor-opacity"),
            base.phosphorOpacity
        ),
        PHOS_OP_MIN,
        PHOS_OP_MAX
    );

    const scanlineOpacity = clamp(
        num(
            rootStyle.getPropertyValue("--effect-crt-scanline-opacity"),
            base.scanlineOpacity
        ),
        SCAN_OP_MIN,
        SCAN_OP_MAX
    );

    const scanlineSpeed = body.classList.contains("effect-static-scanlines")
        ? 0
        : msToSpd(
            num(
                rootStyle.getPropertyValue("--effect-crt-scanline-travel-duration"),
                spdToMs(base.scanlineSpeed)
            )
        );

    const textShadowIntensity = clamp(
        num(
            rootStyle.getPropertyValue("--effect-crt-text-shadow-intensity"),
            base.textShadowIntensity
        ),
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );
    const textShadowEnabled =
        textShadowIntensity > 0 &&
        !body.classList.contains("effect-disable-text-shadow");

    return {
        phosphorEnabled: phosphorOpacity > 0 && !body.classList.contains("effect-disable-phosphor"),
        scanlinesEnabled: scanlineOpacity > 0 && !body.classList.contains("effect-disable-scanlines"),
        phosphorOpacity,
        scanlineOpacity,
        scanlineSpeed,
        textShadowEnabled,
        textShadowIntensity
    };
}

/**
 * Defaults + stored prefs.
 * @returns {Prefs}
 */
function resolved(): Prefs {
    return merge(defs(), stored());
}

/**
 * Saves prefs to localStorage.
 * @param {Prefs} prefs
 * @returns {void}
 */
function save(prefs: Prefs): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Applies prefs into css vars and body classes and the whole lot.
 * @param {Prefs} prefs
 * @returns {void}
 */
function apply(prefs: Prefs): void {
    document.documentElement.style.setProperty(
        "--effect-crt-phosphor-opacity",
        cssNum(prefs.phosphorOpacity)
    );
    document.documentElement.style.setProperty(
        "--effect-crt-scanline-opacity",
        cssNum(prefs.scanlineOpacity)
    );
    document.documentElement.style.setProperty(
        "--effect-crt-scanline-travel-duration",
        ms(spdToMs(prefs.scanlineSpeed))
    );

    const textShadowIntensity = clamp(
        prefs.textShadowIntensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    document.documentElement.style.setProperty(
        "--effect-crt-text-shadow-intensity",
        cssNum(textShadowIntensity)
    );
    applyTextShadowScale(textShadowIntensity);

    document.body.classList.toggle(
        "effect-disable-phosphor",
        !prefs.phosphorEnabled || prefs.phosphorOpacity <= 0
    );
    document.body.classList.toggle(
        "effect-disable-scanlines",
        !prefs.scanlinesEnabled || prefs.scanlineOpacity <= 0
    );
    document.body.classList.toggle("effect-static-scanlines", prefs.scanlineSpeed <= 0);
    document.body.classList.toggle(
        "effect-disable-text-shadow",
        !prefs.textShadowEnabled || textShadowIntensity <= 0
    );
}

/**
 * Save then apply. tiny wrapper but keeps the call sites nicer.
 * @param {Prefs} prefs
 * @returns {void}
 */
function commit(prefs: Prefs): void {
    save(prefs);
    apply(prefs);
}

/**
 * Syncs a checkbox in the modal.
 * @param {HTMLDivElement} modalEl
 * @param {string} selector
 * @param {boolean} checked
 * @returns {void}
 */
function syncChk(modalEl: HTMLDivElement, selector: string, checked: boolean): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) return;
    el.checked = checked;
}

/**
 * Syncs a range input.
 * @param {HTMLDivElement} modalEl
 * @param {string} selector
 * @param {number} value
 * @returns {void}
 */
function syncRng(modalEl: HTMLDivElement, selector: string, value: number): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) return;
    el.value = String(Math.round(clamp(value, 0, 100)));
}

/**
 * Syncs one little output label.
 * @param {HTMLDivElement} modalEl
 * @param {string} selector
 * @param {number} value
 * @returns {void}
 */
function syncOut(modalEl: HTMLDivElement, selector: string, value: number): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLOutputElement) && !(el instanceof HTMLElement)) return;
    el.textContent = pct(value);
}

/**
 * Reflects prefs into the currently open modal controls.
 * @param {HTMLDivElement} modalEl
 * @param {Prefs} prefs
 * @returns {void}
 */
function syncMod(modalEl: HTMLDivElement, prefs: Prefs): void {
    const phosphorPercent = opToPct(prefs.phosphorOpacity, PHOS_OP_MAX);
    const scanlinePercent = opToPct(prefs.scanlineOpacity, SCAN_OP_MAX);
    const scanlineSpeed = clamp(prefs.scanlineSpeed, SCAN_SPD_MIN, SCAN_SPD_MAX);
    const textShadowIntensity = clamp(
        prefs.textShadowIntensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    syncChk(modalEl, "#effects-text-shadow-enabled", !prefs.textShadowEnabled || textShadowIntensity === 0);
    syncChk(modalEl, "#effects-phosphor-enabled", !prefs.phosphorEnabled || phosphorPercent === 0);
    syncChk(modalEl, "#effects-scanlines-enabled", !prefs.scanlinesEnabled || scanlinePercent === 0);

    syncRng(modalEl, "#effects-phosphor-opacity", phosphorPercent);
    syncRng(modalEl, "#effects-scanline-opacity", scanlinePercent);
    syncRng(modalEl, "#effects-scanline-speed", scanlineSpeed);
    syncRng(modalEl, "#effects-text-shadow-intensity", textShadowIntensity);

    syncOut(modalEl, "#effects-phosphor-opacity-value", phosphorPercent);
    syncOut(modalEl, "#effects-scanline-opacity-value", scanlinePercent);
    syncOut(modalEl, "#effects-scanline-speed-value", scanlineSpeed);
    syncOut(modalEl, "#effects-text-shadow-intensity-value", textShadowIntensity);
}

/**
 * If the modal is open, updates it from the live prefs.
 * @returns {void}
 */
function syncOpen(): void {
    const session = modals.factory.getOpenSession(MOD_ID);
    if (!session) return;
    syncMod(session.modalEl, live());
}

/**
 * Little react panel for the modal.
 * @param {Props} props
 * @returns {ReactElement}
 */
function Panel(props: Props): ReactElement {
    const text = props.ui.modal;
    const phosphorPercent = opToPct(props.prefs.phosphorOpacity, PHOS_OP_MAX);
    const scanlinePercent = opToPct(props.prefs.scanlineOpacity, SCAN_OP_MAX);
    const scanlineSpeed = clamp(props.prefs.scanlineSpeed, SCAN_SPD_MIN, SCAN_SPD_MAX);
    const textShadowIntensity = clamp(
        props.prefs.textShadowIntensity,
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    return (
        <>
            <div className="effects-modal__header">
                <div>
                    <h2 className="effects-modal__title">{text.title}</h2>
                    <p className="effects-modal__lead">{text.lead}</p>
                </div>

                {/* <button
          type="button"
          className="effects-modal__close"
          data-effects-close=""
          title={text.closeTitle}
          aria-label={text.closeTitle}
        >
          ✕
        </button> */}
            </div>

            <div className="effects-modal__grid">
                <section className="effects-modal__section">
                    <div className="effects-modal__section-heading">
                        <h3>Text distortion</h3>
                        <p>Controls the animated RGB separation applied to text and SVG graphics.</p>
                    </div>

                    <label className="effects-modal__toggle" htmlFor="effects-text-shadow-enabled">
                        <input
                            id="effects-text-shadow-enabled"
                            type="checkbox"
                            defaultChecked={!props.prefs.textShadowEnabled || textShadowIntensity === 0}
                        />
                        <span>Disable text distortion</span>
                    </label>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-text-shadow-intensity">{text.intensityLabel}</label>
                            <output id="effects-text-shadow-intensity-value">
                                <span>&nbsp;</span>{pct(textShadowIntensity)}
                            </output>
                        </div>

                        <input
                            id="effects-text-shadow-intensity"
                            type="range"
                            min={String(TEXT_SHADOW_MIN)}
                            max={String(TEXT_SHADOW_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(textShadowIntensity))}
                        />

                        <p className="effects-modal__hint">
                            15% is the default strength. 20% is the original base CRT strength. The upper range ramps aggressively, with 100% deliberately excessive.
                        </p>
                    </div>
                </section>

                <section className="effects-modal__section">
                    <div className="effects-modal__section-heading">
                        <h3>{text.phosphorTitle}</h3>
                        <p>{text.phosphorDescription}</p>
                    </div>

                    <label className="effects-modal__toggle" htmlFor="effects-phosphor-enabled">
                        <input
                            id="effects-phosphor-enabled"
                            type="checkbox"
                            defaultChecked={!props.prefs.phosphorEnabled || phosphorPercent === 0}
                        />
                        <span>{text.phosphorToggle}</span>
                    </label>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-phosphor-opacity">{text.intensityLabel}</label>
                            <output id="effects-phosphor-opacity-value"><span>&nbsp;</span>{pct(phosphorPercent)}</output>
                        </div>

                        <input
                            id="effects-phosphor-opacity"
                            type="range"
                            min={String(SLIDER_MIN)}
                            max={String(SLIDER_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(phosphorPercent))}
                        />

                        <p className="effects-modal__hint">{text.phosphorHint}</p>
                    </div>
                </section>

                <section className="effects-modal__section">
                    <div className="effects-modal__section-heading">
                        <h3>{text.scanlinesTitle}</h3>
                        <p>{text.scanlinesDescription}</p>
                    </div>

                    <label className="effects-modal__toggle" htmlFor="effects-scanlines-enabled">
                        <input
                            id="effects-scanlines-enabled"
                            type="checkbox"
                            defaultChecked={!props.prefs.scanlinesEnabled || scanlinePercent === 0}
                        />
                        <span>{text.scanlinesToggle}</span>
                    </label>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-scanline-opacity">{text.intensityLabel}</label>
                            <output id="effects-scanline-opacity-value"><span>&nbsp;</span>{pct(scanlinePercent)}</output>
                        </div>

                        <input
                            id="effects-scanline-opacity"
                            type="range"
                            min={String(SLIDER_MIN)}
                            max={String(SLIDER_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(scanlinePercent))}
                        />

                        <p className="effects-modal__hint">{text.scanlinesHint}</p>
                    </div>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-scanline-speed">{text.scanlineSpeedLabel}</label>
                            <output id="effects-scanline-speed-value"><span>&nbsp;</span>{pct(scanlineSpeed)}</output>
                        </div>

                        <input
                            id="effects-scanline-speed"
                            type="range"
                            min={String(SCAN_SPD_MIN)}
                            max={String(SCAN_SPD_MAX)}
                            step={String(SLIDER_STEP)}
                            defaultValue={String(Math.round(scanlineSpeed))}
                        />

                        <p className="effects-modal__hint">{text.scanlineSpeedHint}</p>
                    </div>
                </section>
            </div>

            <div className="effects-modal__footer">
                <button type="button" id="effects-reset">
                    {text.reset}
                </button>

                <button type="button" data-effects-close="" data-intent="primary">
                    {text.done}
                </button>
            </div>
        </>
    );
}

/**
 * Renders the modal html string from the current live prefs.
 * @returns {string}
 */
function rndrMod(): string {
    return render2Mkup(<Panel prefs={live()} ui={ui()} />);
}

/**
 * Handles phosphor toggle checkbox.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onPhosTgl = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const cur = live();
    const nextOpacity = target.checked
        ? 0
        : cur.phosphorOpacity > 0
            ? cur.phosphorOpacity
            : defs().phosphorOpacity;

    const next: Prefs = {
        ...cur,
        phosphorEnabled: !target.checked,
        phosphorOpacity: nextOpacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles scanline toggle checkbox.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onScanTgl = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const cur = live();
    const nextOpacity = target.checked
        ? 0
        : cur.scanlineOpacity > 0
            ? cur.scanlineOpacity
            : defs().scanlineOpacity;

    const next: Prefs = {
        ...cur,
        scanlinesEnabled: !target.checked,
        scanlineOpacity: nextOpacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles phosphor opacity slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onPhosOp = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const percent = clamp(
        Number.parseFloat(target.value),
        SLIDER_MIN,
        SLIDER_MAX
    );
    const opacity = pctToOp(percent, PHOS_OP_MAX);

    const next: Prefs = {
        ...live(),
        phosphorEnabled: percent > 0,
        phosphorOpacity: opacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles scanline opacity slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onScanOp = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const percent = clamp(
        Number.parseFloat(target.value),
        SLIDER_MIN,
        SLIDER_MAX
    );
    const opacity = pctToOp(percent, SCAN_OP_MAX);

    const next: Prefs = {
        ...live(),
        scanlinesEnabled: percent > 0,
        scanlineOpacity: opacity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles scanline speed slider.
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onScanSpd = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const speed = clamp(
        Number.parseFloat(target.value),
        SCAN_SPD_MIN,
        SCAN_SPD_MAX
    );

    const next: Prefs = {
        ...live(),
        scanlineSpeed: speed
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles the text-distortion disable toggle.
 *
 * Disabling preserves the current slider value so the user's preferred
 * strength is restored when the effect is enabled again.
 *
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onTextShadowTgl = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const cur = live();
    const nextIntensity =
        cur.textShadowIntensity > 0
            ? cur.textShadowIntensity
            : defs().textShadowIntensity;

    const next: Prefs = {
        ...cur,
        textShadowEnabled: !target.checked,
        textShadowIntensity: nextIntensity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Handles CRT text-distortion intensity.
 *
 * Controls the shared chromatic-aberration strength applied to rendered
 * text and SVG graphics.
 *
 * @param {Event} ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onTextShadowIntensity = (ev: Event, ctx: Ctx): void => {
    const target = ev.currentTarget;
    if (!(target instanceof HTMLInputElement)) return;

    const intensity = clamp(
        Number.parseFloat(target.value),
        TEXT_SHADOW_MIN,
        TEXT_SHADOW_MAX
    );

    const next: Prefs = {
        ...live(),
        textShadowEnabled: intensity > 0,
        textShadowIntensity: intensity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Reset button handler. Goes back to the css-ish defaults.
 * @param {Event} _ev
 * @param {Ctx} ctx
 * @returns {void}
 */
const onReset = (_ev: Event, ctx: Ctx): void => {
    const base = defs();
    const next: Prefs = {
        phosphorEnabled: true,
        phosphorOpacity: base.phosphorOpacity,
        scanlinesEnabled: true,
        scanlineOpacity: base.scanlineOpacity,
        scanlineSpeed: base.scanlineSpeed,
        textShadowEnabled: true,
        textShadowIntensity: base.textShadowIntensity
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Creates the modal singleton on first use.
 * @returns {modals.Modal}
 */
function ensureMod(): modals.Modal {
    if (mod) return mod;

    mod = modals.factory.create({
        id: MOD_ID,
        mode: "blocking",
        window: true,
        modalClassName: "effects-modal",
        content: rndrMod,
        decorators: [
            modals.closeOnClick("[data-effects-close]"),
            modals.onModalEvent("#effects-text-shadow-enabled", "change", onTextShadowTgl),
            modals.onModalEvent("#effects-phosphor-enabled", "change", onPhosTgl),
            modals.onModalEvent("#effects-scanlines-enabled", "change", onScanTgl),
            modals.onModalEvent("#effects-phosphor-opacity", "input", onPhosOp),
            modals.onModalEvent("#effects-scanline-opacity", "input", onScanOp),
            modals.onModalEvent("#effects-scanline-speed", "input", onScanSpd),
            modals.onModalEvent(
                "#effects-text-shadow-intensity",
                "input",
                onTextShadowIntensity
            ),
            modals.onModalEvent("#effects-reset", "click", onReset)
        ]
    });

    return mod;
}

/**
 * Opens the effects modal and refreshes its content first.
 * @returns {void}
 */
function openMod(): void {
    const modal = ensureMod();
    modal.setContent(rndrMod());
    modal.open();
}

/**
 * Installs the storage event sync once.
 * @returns {void}
 */
function ensureSync(): void {
    if (syncOn) return;
    syncOn = true;

    /**
     * Keeps tabs/windows in sync when storage changes elsewhere.
     * @param {StorageEvent} event
     * @returns {void}
     */
    const onStore = (event: StorageEvent): void => {
        if (event.key !== STORAGE_KEY) return;
        apply(resolved());
        syncOpen();
    };

    const onThemeModeChange = (): void => {
        applyTextShadowScale(live().textShadowIntensity);
    };

    document.addEventListener(
        THEME_MODE_CHANGED_EVENT,
        onThemeModeChange
    );

    window.addEventListener("storage", onStore);
}


/**
 * Small non-blocking helper matching the reader's existing "Did you know?"
 * tip behaviour.
 *
 * @returns {ReactElement}
 */
function EffectsTipModal(): ReactElement {
    return (
        <>
            <div className="modal-header">
                <h3>Did you know?</h3>
            </div>

            <div className="modal-content">
                <p>
                    Effects too distracting? Disable or soften them using the CRT effects button.
                </p>

                <label className="kc-checkbox-row">
                    <input id="kc-effects-help-hide" type="checkbox" />
                    <span>Do not show this tip again</span>
                </label>

                <div className="kc-modal-actions">
                    <button
                        id="kc-effects-help-close"
                        type="button"
                        style={{ display: "block", margin: "0 auto" }}
                    >
                        Close
                    </button>
                </div>

                <p className="modal-note">You can close this window with <kbd>Esc</kbd>.</p>
            </div>
        </>
    );
}

/**
 * @returns {boolean}
 */
function showEffectsTip(): boolean {
    if (effectsTipShown) return false;
    if (localStorage.getItem(EFFECTS_TIP_HIDE_KEY) === "true") return false;
    return true;
}

const EFFECTS_TIP_MODAL_HTML = (): string => render2Mkup(<EffectsTipModal />);

const persistEffectsTipHide: ModalDecorator = {
    mount: (ctx: ModalCtx) => {
        const box = ctx.modalEl.querySelector("#kc-effects-help-hide");
        if (!(box instanceof HTMLInputElement)) return;

        box.checked = localStorage.getItem(EFFECTS_TIP_HIDE_KEY) === "true";

        const onChange = (): void => {
            localStorage.setItem(
                EFFECTS_TIP_HIDE_KEY,
                box.checked ? "true" : "false"
            );

            if (box.checked) ctx.close();
        };

        box.addEventListener("change", onChange);
        return () => box.removeEventListener("change", onChange);
    }
};

const effectsTipModal = modals.factory.create({
    id: EFFECTS_TIP_MODAL_ID,
    mode: "non-blocking",
    readerModeCompatible: false,
    content: EFFECTS_TIP_MODAL_HTML,
    closeOnOutsideClick: false,
    decorators: [
        modals.closeOnClick("#kc-effects-help-close"),
        persistEffectsTipHide
    ]
});

/**
 * @returns {void}
 */
function openEffectsTip(): void {
    if (!showEffectsTip()) return;
    if (effectsTipModal.isOpen()) return;

    effectsTipModal.open();
    effectsTipShown = true;
}

/**
 * Reuses the reader tip's visibility-trigger pattern for the fixed effects
 * button.
 *
 * @param {HTMLButtonElement} button
 * @returns {void}
 */
function initEffectsTip(button: HTMLButtonElement): void {
    if (!showEffectsTip()) return;

    effectsTipObs?.disconnect();

    effectsTipObs = new IntersectionObserver(
        (entries: IntersectionObserverEntry[]) => {
            const anyVisible = entries.some((entry) => entry.isIntersecting);
            if (!anyVisible) return;

            openEffectsTip();

            effectsTipObs?.disconnect();
            effectsTipObs = null;
        },
        { threshold: 0.15 }
    );

    effectsTipObs.observe(button);
}


/**
 * Creates the floating CRT effects button, applies saved preferences,
 * and wires the effects modal. Button plumbing is delegated to
 * `installMenuToggle` so every floating-modal toggle behaves the same.
 * @param {fxUIconf} nextUi
 * @returns {void}
 */
export function initEffectsControls(nextUi: fxUIconf): void {
    uiCfg = nextUi;

    ensureTextShadowTargets();
    ensureTextShadowKeyframes();

    defs();
    apply(resolved());

    const effectsToggle = installMenuToggle({
        id: BTN_ID,
        bottom: BTN_BOTTOM,
        cfg: nextUi,
        classes: ["theme-toggle-button", "effects-toggle-button"],
        icon: {
            size: 32,
            wrapperClass: "effects-toggle-button__icon",
            svgClass: "effects-toggle-button__svg"
        },
        openModal: openMod
    });

    initEffectsTip(effectsToggle.button);

    if (mod?.isOpen()) {
        mod.setContent(rndrMod());
    }

    ensureSync();
}