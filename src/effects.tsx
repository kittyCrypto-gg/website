import type { ReactElement } from "react";
import type { EffectsUiConfig } from "./uiFetch.ts";
import { recreateSingleton } from "./domSingletons.ts";
import { prepareSvgMarkup } from "./icons.tsx";
import { closeOnClick, modals, onModalEvent, type Modal } from "./modals.ts";
import { render2Mkup } from "./reactHelpers.tsx";

type Prefs = Readonly<{
    phosphorEnabled: boolean;
    phosphorOpacity: number;
    scanlinesEnabled: boolean;
    scanlineOpacity: number;
    scanlineSpeed: number;
}>;

type StoredPrefs = Readonly<Partial<Prefs>>;

type Props = Readonly<{
    prefs: Prefs;
    ui: EffectsUiConfig;
}>;

type Ctx = Readonly<{
    modalEl: HTMLDivElement;
}>;

const STORAGE_KEY = "kcEffectsPrefs";
const BTN_ID = "effects-toggle";
const MOD_ID = "screen-effects";
const BTN_BOTTOM = "80px";

const PHOS_OP_MIN = 0;
const PHOS_OP_MAX = 0.12;

const SCAN_OP_MIN = 0;
const SCAN_OP_MAX = 0.3;

const SCAN_SPD_MIN = 0;
const SCAN_SPD_MAX = 100;
const DEF_SCAN_SPD = 90;

const SCAN_MS_MIN = 1;
const SCAN_MS_MAX = 22000;

const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_STEP = 1;

let defPrefs: Prefs | null = null;
let mod: Modal | null = null;
let syncOn = false;
let uiCfg: EffectsUiConfig | null = null;
let iconReqTok = 0;

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
 * @returns {EffectsUiConfig}
 */
function ui(): EffectsUiConfig {
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
        scanlineSpeed: DEF_SCAN_SPD
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
                typeof record.scanlineSpeed === "number" ? record.scanlineSpeed : undefined
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

    return {
        phosphorEnabled: phosphorOpacity > 0 && (fromStore.phosphorEnabled ?? base.phosphorEnabled),
        phosphorOpacity,
        scanlinesEnabled: scanlineOpacity > 0 && (fromStore.scanlinesEnabled ?? base.scanlinesEnabled),
        scanlineOpacity,
        scanlineSpeed
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

    return {
        phosphorEnabled: phosphorOpacity > 0 && !body.classList.contains("effect-disable-phosphor"),
        scanlinesEnabled: scanlineOpacity > 0 && !body.classList.contains("effect-disable-scanlines"),
        phosphorOpacity,
        scanlineOpacity,
        scanlineSpeed
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

    document.body.classList.toggle(
        "effect-disable-phosphor",
        !prefs.phosphorEnabled || prefs.phosphorOpacity <= 0
    );
    document.body.classList.toggle(
        "effect-disable-scanlines",
        !prefs.scanlinesEnabled || prefs.scanlineOpacity <= 0
    );
    document.body.classList.toggle("effect-static-scanlines", prefs.scanlineSpeed <= 0);
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

    syncChk(modalEl, "#effects-phosphor-enabled", !prefs.phosphorEnabled || phosphorPercent === 0);
    syncChk(modalEl, "#effects-scanlines-enabled", !prefs.scanlinesEnabled || scanlinePercent === 0);

    syncRng(modalEl, "#effects-phosphor-opacity", phosphorPercent);
    syncRng(modalEl, "#effects-scanline-opacity", scanlinePercent);
    syncRng(modalEl, "#effects-scanline-speed", scanlineSpeed);

    syncOut(modalEl, "#effects-phosphor-opacity-value", phosphorPercent);
    syncOut(modalEl, "#effects-scanline-opacity-value", scanlinePercent);
    syncOut(modalEl, "#effects-scanline-speed-value", scanlineSpeed);
}

/**
 * If the modal is open, updates it from the live prefs.
 * @returns {void}
 */
function syncOpen(): void {
    const session = modals.getOpenSession(MOD_ID);
    if (!session) return;
    syncMod(session.modalEl, live());
}

/**
 * Fallback icon when svg fails or doesnt exist.
 * @param {HTMLButtonElement} button
 * @param {string} emoji
 * @returns {void}
 */
function emojiIcon(button: HTMLButtonElement, emoji: string): void {
    button.replaceChildren();
    button.textContent = emoji;
}

/**
 * Tries to fetch and prep svg markup for the floating button.
 * @param {string} src
 * @returns {Promise<string | null>}
 */
async function loadSvg(src: string): Promise<string | null> {
    try {
        const response = await fetch(src, { cache: "force-cache" });
        if (!response.ok) return null;

        const rawSvg = await response.text();
        return prepareSvgMarkup(rawSvg, "effects-toggle-button__svg");
    } catch {
        return null;
    }
}

/**
 * Applies either the svg icon or the emoji fallback.
 * @param {HTMLButtonElement} button
 * @param {EffectsUiConfig} nextUi
 * @returns {Promise<void>}
 */
async function setBtnIcon(button: HTMLButtonElement, nextUi: EffectsUiConfig): Promise<void> {
    const requestToken = ++iconReqTok;

    if (!nextUi.iconPath) {
        emojiIcon(button, nextUi.icon);
        return;
    }

    const markup = await loadSvg(nextUi.iconPath);
    if (requestToken !== iconReqTok) return;

    if (!markup) {
        emojiIcon(button, nextUi.icon);
        return;
    }

    const wrapper = document.createElement("span");
    wrapper.className = "effects-toggle-button__icon";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = markup;

    button.replaceChildren(wrapper);
}

/**
 * Applies title/aria/icon stuff to the floating button.
 * @param {EffectsUiConfig} nextUi
 * @param {HTMLButtonElement} button
 * @returns {void}
 */
function setBtnUi(nextUi: EffectsUiConfig, button: HTMLButtonElement): void {
    button.title = nextUi.title;
    button.setAttribute("aria-label", nextUi.title);
    button.style.bottom = BTN_BOTTOM;

    void setBtnIcon(button, nextUi);
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
        scanlineSpeed: base.scanlineSpeed
    };

    commit(next);
    syncMod(ctx.modalEl, next);
};

/**
 * Creates the modal singleton on first use.
 * @returns {Modal}
 */
function ensureMod(): Modal {
    if (mod) return mod;

    mod = modals.create({
        id: MOD_ID,
        mode: "blocking",
        window: true,
        modalClassName: "effects-modal",
        content: rndrMod,
        decorators: [
            closeOnClick("[data-effects-close]"),
            onModalEvent("#effects-phosphor-enabled", "change", onPhosTgl),
            onModalEvent("#effects-scanlines-enabled", "change", onScanTgl),
            onModalEvent("#effects-phosphor-opacity", "input", onPhosOp),
            onModalEvent("#effects-scanline-opacity", "input", onScanOp),
            onModalEvent("#effects-scanline-speed", "input", onScanSpd),
            onModalEvent("#effects-reset", "click", onReset)
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

    window.addEventListener("storage", onStore);
}

/**
 * Creates the floating CRT effects button, applies saved preferences,
 * and wires the effects modal.
 * @param {EffectsUiConfig} nextUi
 * @returns {void}
 */
export function initEffectsControls(nextUi: EffectsUiConfig): void {
    uiCfg = nextUi;

    defs();
    apply(resolved());

    const buttonNode = recreateSingleton(
        BTN_ID,
        () => document.createElement("button"),
        document
    );

    if (!(buttonNode instanceof HTMLButtonElement)) return;

    /**
     * Button click opens the modal. tiny wrapper but whatever.
     * @returns {void}
     */
    const onClick = (): void => {
        openMod();
    };

    buttonNode.classList.add("theme-toggle-button", "effects-toggle-button");
    buttonNode.type = "button";
    buttonNode.onclick = onClick;

    setBtnUi(nextUi, buttonNode);

    if (buttonNode.parentElement !== document.body) {
        document.body.appendChild(buttonNode);
    }

    if (mod?.isOpen()) {
        mod.setContent(rndrMod());
    }

    ensureSync();
}