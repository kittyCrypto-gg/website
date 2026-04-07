import type { ReactElement } from "react";
import type { EffectsUiConfig } from "./uiFetch.ts";
import { recreateSingleton } from "./domSingletons.ts";
import { prepareSvgMarkup } from "./icons.tsx";
import { closeOnClick, modals, onModalEvent, type Modal } from "./modals.ts";
import { render2Mkup } from "./reactHelpers.tsx";

type EffectsPrefs = Readonly<{
    phosphorEnabled: boolean;
    phosphorOpacity: number;
    scanlinesEnabled: boolean;
    scanlineOpacity: number;
    scanlineSpeed: number;
}>;

type StoredEffectsPrefs = Readonly<Partial<EffectsPrefs>>;

type EffectsPanelProps = Readonly<{
    prefs: EffectsPrefs;
    ui: EffectsUiConfig;
}>;

const EFFECTS_STORAGE_KEY = "kcEffectsPrefs";
const EFFECTS_BUTTON_ID = "effects-toggle";
const EFFECTS_MODAL_ID = "screen-effects";
const EFFECTS_BUTTON_BOTTOM = "80px";

const PHOSPHOR_OPACITY_MIN = 0;
const PHOSPHOR_OPACITY_MAX = 0.12;

const SCANLINE_OPACITY_MIN = 0;
const SCANLINE_OPACITY_MAX = 0.3;

const SCANLINE_SPEED_MIN = 0;
const SCANLINE_SPEED_MAX = 100;
const DEFAULT_SCANLINE_SPEED = 90;

const SCANLINE_TRAVEL_DURATION_MIN_MS = 1;
const SCANLINE_TRAVEL_DURATION_MAX_MS = 22000;

const SLIDER_PERCENT_MIN = 0;
const SLIDER_PERCENT_MAX = 100;
const SLIDER_PERCENT_STEP = 1;

let defaultPrefs: EffectsPrefs | null = null;
let effectsModal: Modal | null = null;
let storageSyncInstalled = false;
let effectsUiConfig: EffectsUiConfig | null = null;
let buttonIconRequestToken = 0;

/**
 * @param {number} value - Value to clamp.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} Clamped number.
 */
function clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * @param {string} raw - Raw CSS variable or storage text.
 * @param {number} fallback - Fallback number.
 * @returns {number} Parsed number.
 */
function parseNumber(raw: string, fallback: number): number {
    const parsed = Number.parseFloat(raw.trim());
    return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * @param {number} value - Percentage value from 0 to 100.
 * @returns {string} Readable percentage.
 */
function formatPercent(value: number): string {
    return `${Math.round(clamp(value, 0, 100))}%`;
}

/**
 * @param {number} value - Numeric value.
 * @returns {string} Stable CSS-safe number string.
 */
function formatCssNumber(value: number): string {
    return String(Number(value.toFixed(3)));
}

/**
 * @param {number} opacity - Effect opacity.
 * @param {number} maxOpacity - Maximum opacity for that effect.
 * @returns {number} Slider percentage.
 */
function opacityToSliderPercent(opacity: number, maxOpacity: number): number {
    if (maxOpacity <= 0) return 0;
    return clamp((clamp(opacity, 0, maxOpacity) / maxOpacity) * 100, 0, 100);
}

/**
 * @param {number} percent - Slider percentage.
 * @param {number} maxOpacity - Maximum opacity for that effect.
 * @returns {number} Effect opacity.
 */
function sliderPercentToOpacity(percent: number, maxOpacity: number): number {
    return clamp((clamp(percent, 0, 100) / 100) * maxOpacity, 0, maxOpacity);
}

/**
 * @param {number} value - Duration in milliseconds.
 * @returns {string} CSS duration string.
 */
function formatDurationMs(value: number): string {
    return `${Math.round(
        clamp(value, SCANLINE_TRAVEL_DURATION_MIN_MS, SCANLINE_TRAVEL_DURATION_MAX_MS)
    )}ms`;
}

/**
 * @param {number} speed - Speed percentage from 0 to 100.
 * @returns {number} Travel duration in milliseconds.
 */
function scanlineSpeedToDurationMs(speed: number): number {
    const clampedSpeed = clamp(speed, SCANLINE_SPEED_MIN, SCANLINE_SPEED_MAX);
    if (clampedSpeed <= 0) return SCANLINE_TRAVEL_DURATION_MAX_MS;

    const progress = (clampedSpeed - 1) / 99;

    return (
        SCANLINE_TRAVEL_DURATION_MAX_MS -
        progress * (SCANLINE_TRAVEL_DURATION_MAX_MS - SCANLINE_TRAVEL_DURATION_MIN_MS)
    );
}

/**
 * @param {number} durationMs - Travel duration in milliseconds.
 * @returns {number} Speed percentage from 0 to 100.
 */
function durationMsToScanlineSpeed(durationMs: number): number {
    const clampedDuration = clamp(
        durationMs,
        SCANLINE_TRAVEL_DURATION_MIN_MS,
        SCANLINE_TRAVEL_DURATION_MAX_MS
    );

    const progress =
        (SCANLINE_TRAVEL_DURATION_MAX_MS - clampedDuration) /
        (SCANLINE_TRAVEL_DURATION_MAX_MS - SCANLINE_TRAVEL_DURATION_MIN_MS);

    return clamp(1 + progress * 99, SCANLINE_SPEED_MIN, SCANLINE_SPEED_MAX);
}

/**
 * @returns {EffectsUiConfig} Active UI config.
 */
function getUiConfig(): EffectsUiConfig {
    if (!effectsUiConfig) {
        throw new Error("Effects UI config has not been initialised.");
    }

    return effectsUiConfig;
}

/**
 * @returns {EffectsPrefs} Defaults taken from CSS and current body classes.
 */
function readCssDefaults(): EffectsPrefs {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const body = document.body;

    return {
        phosphorEnabled: !body.classList.contains("effect-disable-phosphor"),
        phosphorOpacity: clamp(
            parseNumber(rootStyle.getPropertyValue("--effect-crt-phosphor-opacity"), 0.02),
            PHOSPHOR_OPACITY_MIN,
            PHOSPHOR_OPACITY_MAX
        ),
        scanlinesEnabled: !body.classList.contains("effect-disable-scanlines"),
        scanlineOpacity: clamp(
            parseNumber(rootStyle.getPropertyValue("--effect-crt-scanline-opacity"), 0.1),
            SCANLINE_OPACITY_MIN,
            SCANLINE_OPACITY_MAX
        ),
        scanlineSpeed: DEFAULT_SCANLINE_SPEED
    };
}

/**
 * @returns {EffectsPrefs} Captured defaults.
 */
function getDefaultPrefs(): EffectsPrefs {
    if (defaultPrefs) return defaultPrefs;
    defaultPrefs = readCssDefaults();
    return defaultPrefs;
}

/**
 * @returns {StoredEffectsPrefs | null} Stored preferences, if valid enough to use.
 */
function readStoredPrefs(): StoredEffectsPrefs | null {
    const raw = localStorage.getItem(EFFECTS_STORAGE_KEY);
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
 * @param {EffectsPrefs} base - Base preference object.
 * @param {StoredEffectsPrefs | null} stored - Stored partial override.
 * @returns {EffectsPrefs} Resolved preferences.
 */
function mergePrefs(base: EffectsPrefs, stored: StoredEffectsPrefs | null): EffectsPrefs {
    if (!stored) return base;

    const phosphorOpacity = clamp(
        stored.phosphorOpacity ?? base.phosphorOpacity,
        PHOSPHOR_OPACITY_MIN,
        PHOSPHOR_OPACITY_MAX
    );
    const scanlineOpacity = clamp(
        stored.scanlineOpacity ?? base.scanlineOpacity,
        SCANLINE_OPACITY_MIN,
        SCANLINE_OPACITY_MAX
    );
    const scanlineSpeed = clamp(
        stored.scanlineSpeed ?? base.scanlineSpeed,
        SCANLINE_SPEED_MIN,
        SCANLINE_SPEED_MAX
    );

    return {
        phosphorEnabled: phosphorOpacity > 0 && (stored.phosphorEnabled ?? base.phosphorEnabled),
        phosphorOpacity,
        scanlinesEnabled: scanlineOpacity > 0 && (stored.scanlinesEnabled ?? base.scanlinesEnabled),
        scanlineOpacity,
        scanlineSpeed
    };
}

/**
 * @returns {EffectsPrefs} Current live preferences as applied in the DOM.
 */
function readLivePrefs(): EffectsPrefs {
    const rootStyle = window.getComputedStyle(document.documentElement);
    const body = document.body;

    const phosphorOpacity = clamp(
        parseNumber(
            rootStyle.getPropertyValue("--effect-crt-phosphor-opacity"),
            getDefaultPrefs().phosphorOpacity
        ),
        PHOSPHOR_OPACITY_MIN,
        PHOSPHOR_OPACITY_MAX
    );

    const scanlineOpacity = clamp(
        parseNumber(
            rootStyle.getPropertyValue("--effect-crt-scanline-opacity"),
            getDefaultPrefs().scanlineOpacity
        ),
        SCANLINE_OPACITY_MIN,
        SCANLINE_OPACITY_MAX
    );

    const scanlineSpeed = body.classList.contains("effect-static-scanlines")
        ? 0
        : durationMsToScanlineSpeed(
            parseNumber(
                rootStyle.getPropertyValue("--effect-crt-scanline-travel-duration"),
                scanlineSpeedToDurationMs(getDefaultPrefs().scanlineSpeed)
            )
        );

    return {
        phosphorEnabled: phosphorOpacity > 0 && !body.classList.contains("effect-disable-phosphor"),
        phosphorOpacity,
        scanlinesEnabled: scanlineOpacity > 0 && !body.classList.contains("effect-disable-scanlines"),
        scanlineOpacity,
        scanlineSpeed
    };
}

/**
 * @returns {EffectsPrefs} Stored preferences merged over defaults.
 */
function readResolvedPrefs(): EffectsPrefs {
    return mergePrefs(getDefaultPrefs(), readStoredPrefs());
}

/**
 * @param {EffectsPrefs} prefs - Preferences to persist.
 * @returns {void} Nothing.
 */
function savePrefs(prefs: EffectsPrefs): void {
    localStorage.setItem(EFFECTS_STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * @param {EffectsPrefs} prefs - Preferences to apply.
 * @returns {void} Nothing.
 */
function applyPrefs(prefs: EffectsPrefs): void {
    document.documentElement.style.setProperty(
        "--effect-crt-phosphor-opacity",
        formatCssNumber(prefs.phosphorOpacity)
    );
    document.documentElement.style.setProperty(
        "--effect-crt-scanline-opacity",
        formatCssNumber(prefs.scanlineOpacity)
    );
    document.documentElement.style.setProperty(
        "--effect-crt-scanline-travel-duration",
        formatDurationMs(scanlineSpeedToDurationMs(prefs.scanlineSpeed))
    );

    document.body.classList.toggle("effect-disable-phosphor", !prefs.phosphorEnabled || prefs.phosphorOpacity <= 0);
    document.body.classList.toggle("effect-disable-scanlines", !prefs.scanlinesEnabled || prefs.scanlineOpacity <= 0);
    document.body.classList.toggle("effect-static-scanlines", prefs.scanlineSpeed <= 0);
}

/**
 * @param {EffectsPrefs} prefs - Preferences to save and apply.
 * @returns {void} Nothing.
 */
function saveAndApplyPrefs(prefs: EffectsPrefs): void {
    savePrefs(prefs);
    applyPrefs(prefs);
}

/**
 * @param {HTMLDivElement} modalEl - Modal root.
 * @param {string} selector - Selector for the checkbox.
 * @param {boolean} checked - Checked state.
 * @returns {void} Nothing.
 */
function syncCheckbox(modalEl: HTMLDivElement, selector: string, checked: boolean): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) return;
    el.checked = checked;
}

/**
 * @param {HTMLDivElement} modalEl - Modal root.
 * @param {string} selector - Selector for the range input.
 * @param {number} value - Slider percentage.
 * @returns {void} Nothing.
 */
function syncRange(modalEl: HTMLDivElement, selector: string, value: number): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLInputElement)) return;
    el.value = String(Math.round(clamp(value, 0, 100)));
}

/**
 * @param {HTMLDivElement} modalEl - Modal root.
 * @param {string} selector - Selector for the output element.
 * @param {number} value - Percentage value.
 * @returns {void} Nothing.
 */
function syncOutput(modalEl: HTMLDivElement, selector: string, value: number): void {
    const el = modalEl.querySelector(selector);
    if (!(el instanceof HTMLOutputElement) && !(el instanceof HTMLElement)) return;
    el.textContent = formatPercent(value);
}

/**
 * @param {HTMLDivElement} modalEl - Modal root.
 * @param {EffectsPrefs} prefs - Preferences to reflect in the modal.
 * @returns {void} Nothing.
 */
function syncModalUi(modalEl: HTMLDivElement, prefs: EffectsPrefs): void {
    const phosphorPercent = opacityToSliderPercent(prefs.phosphorOpacity, PHOSPHOR_OPACITY_MAX);
    const scanlinePercent = opacityToSliderPercent(prefs.scanlineOpacity, SCANLINE_OPACITY_MAX);
    const scanlineSpeed = clamp(prefs.scanlineSpeed, SCANLINE_SPEED_MIN, SCANLINE_SPEED_MAX);

    syncCheckbox(modalEl, "#effects-phosphor-enabled", !prefs.phosphorEnabled || phosphorPercent === 0);
    syncCheckbox(modalEl, "#effects-scanlines-enabled", !prefs.scanlinesEnabled || scanlinePercent === 0);

    syncRange(modalEl, "#effects-phosphor-opacity", phosphorPercent);
    syncRange(modalEl, "#effects-scanline-opacity", scanlinePercent);
    syncRange(modalEl, "#effects-scanline-speed", scanlineSpeed);

    syncOutput(modalEl, "#effects-phosphor-opacity-value", phosphorPercent);
    syncOutput(modalEl, "#effects-scanline-opacity-value", scanlinePercent);
    syncOutput(modalEl, "#effects-scanline-speed-value", scanlineSpeed);
}

/**
 * @returns {void} Nothing.
 */
function syncOpenModalFromLivePrefs(): void {
    const session = modals.getOpenSession(EFFECTS_MODAL_ID);
    if (!session) return;
    syncModalUi(session.modalEl, readLivePrefs());
}

/**
 * @param {HTMLButtonElement} button - Button to update.
 * @param {string} emoji - Emoji fallback.
 * @returns {void} Nothing.
 */
function applyEmojiButtonIcon(button: HTMLButtonElement, emoji: string): void {
    button.replaceChildren();
    button.textContent = emoji;
}

/**
 * @param {string} src - SVG source path.
 * @returns {Promise<string | null>} Prepared SVG markup or null on failure.
 */
async function tryLoadSvgMarkup(src: string): Promise<string | null> {
    try {
        const response = await fetch(src, { cache: "force-cache" });

        if (!response.ok) {
            return null;
        }

        const rawSvg = await response.text();
        return prepareSvgMarkup(rawSvg, "effects-toggle-button__svg");
    } catch {
        return null;
    }
}

/**
 * @param {HTMLButtonElement} button - Button to update.
 * @param {EffectsUiConfig} ui - Effects UI config.
 * @returns {Promise<void>} Resolves when the icon has been applied.
 */
async function applyButtonIcon(button: HTMLButtonElement, ui: EffectsUiConfig): Promise<void> {
    const requestToken = ++buttonIconRequestToken;

    if (!ui.iconPath) {
        applyEmojiButtonIcon(button, ui.icon);
        return;
    }

    const markup = await tryLoadSvgMarkup(ui.iconPath);

    if (requestToken !== buttonIconRequestToken) {
        return;
    }

    if (!markup) {
        applyEmojiButtonIcon(button, ui.icon);
        return;
    }

    const wrapper = document.createElement("span");
    wrapper.className = "effects-toggle-button__icon";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = markup;

    button.replaceChildren(wrapper);
}

/**
 * @param {EffectsUiConfig} ui - Effects UI config.
 * @param {HTMLButtonElement} button - Button to update.
 * @returns {void} Nothing.
 */
function applyButtonUi(ui: EffectsUiConfig, button: HTMLButtonElement): void {
    button.title = ui.title;
    button.setAttribute("aria-label", ui.title);
    button.style.bottom = EFFECTS_BUTTON_BOTTOM;

    void applyButtonIcon(button, ui);
}

/**
 * @param {EffectsPanelProps} props - Panel props.
 * @returns {ReactElement} Modal content.
 */
function EffectsPanel(props: EffectsPanelProps): ReactElement {
    const text = props.ui.modal;
    const phosphorPercent = opacityToSliderPercent(props.prefs.phosphorOpacity, PHOSPHOR_OPACITY_MAX);
    const scanlinePercent = opacityToSliderPercent(props.prefs.scanlineOpacity, SCANLINE_OPACITY_MAX);
    const scanlineSpeed = clamp(props.prefs.scanlineSpeed, SCANLINE_SPEED_MIN, SCANLINE_SPEED_MAX);

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
                            <output id="effects-phosphor-opacity-value">{formatPercent(phosphorPercent)}</output>
                        </div>

                        <input
                            id="effects-phosphor-opacity"
                            type="range"
                            min={String(SLIDER_PERCENT_MIN)}
                            max={String(SLIDER_PERCENT_MAX)}
                            step={String(SLIDER_PERCENT_STEP)}
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
                            <output id="effects-scanline-opacity-value">{formatPercent(scanlinePercent)}</output>
                        </div>

                        <input
                            id="effects-scanline-opacity"
                            type="range"
                            min={String(SLIDER_PERCENT_MIN)}
                            max={String(SLIDER_PERCENT_MAX)}
                            step={String(SLIDER_PERCENT_STEP)}
                            defaultValue={String(Math.round(scanlinePercent))}
                        />

                        <p className="effects-modal__hint">{text.scanlinesHint}</p>
                    </div>

                    <div className="effects-modal__control">
                        <div className="effects-modal__control-meta">
                            <label htmlFor="effects-scanline-speed">{text.scanlineSpeedLabel}</label>
                            <output id="effects-scanline-speed-value">{formatPercent(scanlineSpeed)}</output>
                        </div>

                        <input
                            id="effects-scanline-speed"
                            type="range"
                            min={String(SCANLINE_SPEED_MIN)}
                            max={String(SCANLINE_SPEED_MAX)}
                            step={String(SLIDER_PERCENT_STEP)}
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
 * @returns {string} Rendered modal HTML.
 */
function renderEffectsModal(): string {
    return render2Mkup(<EffectsPanel prefs={readLivePrefs()} ui={getUiConfig()} />);
}

/**
 * @returns {Modal} Singleton modal instance.
 */
function ensureEffectsModal(): Modal {
    if (effectsModal) return effectsModal;

    effectsModal = modals.create({
        id: EFFECTS_MODAL_ID,
        mode: "blocking",
        window: true,
        modalClassName: "effects-modal",
        content: renderEffectsModal,
        decorators: [
            closeOnClick("[data-effects-close]"),

            onModalEvent("#effects-phosphor-enabled", "change", (ev, ctx) => {
                const target = ev.currentTarget;
                if (!(target instanceof HTMLInputElement)) return;

                const livePrefs = readLivePrefs();
                const nextOpacity = target.checked
                    ? 0
                    : livePrefs.phosphorOpacity > 0
                        ? livePrefs.phosphorOpacity
                        : getDefaultPrefs().phosphorOpacity;

                const next: EffectsPrefs = {
                    ...livePrefs,
                    phosphorEnabled: !target.checked,
                    phosphorOpacity: nextOpacity
                };

                saveAndApplyPrefs(next);
                syncModalUi(ctx.modalEl, next);
            }),

            onModalEvent("#effects-scanlines-enabled", "change", (ev, ctx) => {
                const target = ev.currentTarget;
                if (!(target instanceof HTMLInputElement)) return;

                const livePrefs = readLivePrefs();
                const nextOpacity = target.checked
                    ? 0
                    : livePrefs.scanlineOpacity > 0
                        ? livePrefs.scanlineOpacity
                        : getDefaultPrefs().scanlineOpacity;

                const next: EffectsPrefs = {
                    ...livePrefs,
                    scanlinesEnabled: !target.checked,
                    scanlineOpacity: nextOpacity
                };

                saveAndApplyPrefs(next);
                syncModalUi(ctx.modalEl, next);
            }),

            onModalEvent("#effects-phosphor-opacity", "input", (ev, ctx) => {
                const target = ev.currentTarget;
                if (!(target instanceof HTMLInputElement)) return;

                const percent = clamp(
                    Number.parseFloat(target.value),
                    SLIDER_PERCENT_MIN,
                    SLIDER_PERCENT_MAX
                );
                const opacity = sliderPercentToOpacity(percent, PHOSPHOR_OPACITY_MAX);

                const next: EffectsPrefs = {
                    ...readLivePrefs(),
                    phosphorEnabled: percent > 0,
                    phosphorOpacity: opacity
                };

                saveAndApplyPrefs(next);
                syncModalUi(ctx.modalEl, next);
            }),

            onModalEvent("#effects-scanline-opacity", "input", (ev, ctx) => {
                const target = ev.currentTarget;
                if (!(target instanceof HTMLInputElement)) return;

                const percent = clamp(
                    Number.parseFloat(target.value),
                    SLIDER_PERCENT_MIN,
                    SLIDER_PERCENT_MAX
                );
                const opacity = sliderPercentToOpacity(percent, SCANLINE_OPACITY_MAX);

                const next: EffectsPrefs = {
                    ...readLivePrefs(),
                    scanlinesEnabled: percent > 0,
                    scanlineOpacity: opacity
                };

                saveAndApplyPrefs(next);
                syncModalUi(ctx.modalEl, next);
            }),

            onModalEvent("#effects-scanline-speed", "input", (ev, ctx) => {
                const target = ev.currentTarget;
                if (!(target instanceof HTMLInputElement)) return;

                const speed = clamp(
                    Number.parseFloat(target.value),
                    SCANLINE_SPEED_MIN,
                    SCANLINE_SPEED_MAX
                );

                const next: EffectsPrefs = {
                    ...readLivePrefs(),
                    scanlineSpeed: speed
                };

                saveAndApplyPrefs(next);
                syncModalUi(ctx.modalEl, next);
            }),

            onModalEvent("#effects-reset", "click", (_ev, ctx) => {
                const defaults = getDefaultPrefs();
                const next: EffectsPrefs = {
                    phosphorEnabled: true,
                    phosphorOpacity: defaults.phosphorOpacity,
                    scanlinesEnabled: true,
                    scanlineOpacity: defaults.scanlineOpacity,
                    scanlineSpeed: defaults.scanlineSpeed
                };

                saveAndApplyPrefs(next);
                syncModalUi(ctx.modalEl, next);
            })
        ]
    });

    return effectsModal;
}

/**
 * @returns {void} Nothing.
 */
function openEffectsModal(): void {
    const modal = ensureEffectsModal();
    modal.setContent(renderEffectsModal());
    modal.open();
}

/**
 * @returns {void} Nothing.
 */
function ensureStorageSync(): void {
    if (storageSyncInstalled) return;
    storageSyncInstalled = true;

    window.addEventListener("storage", (event: StorageEvent) => {
        if (event.key !== EFFECTS_STORAGE_KEY) return;
        applyPrefs(readResolvedPrefs());
        syncOpenModalFromLivePrefs();
    });
}

/**
 * Creates the floating CRT effects button, applies saved preferences,
 * and wires the effects modal.
 *
 * @param {EffectsUiConfig} ui - Effects UI strings and icon config.
 * @returns {void} Nothing.
 */
export function initEffectsControls(ui: EffectsUiConfig): void {
    effectsUiConfig = ui;

    getDefaultPrefs();
    applyPrefs(readResolvedPrefs());

    const buttonNode = recreateSingleton(
        EFFECTS_BUTTON_ID,
        () => document.createElement("button"),
        document
    );

    if (!(buttonNode instanceof HTMLButtonElement)) return;

    buttonNode.classList.add("theme-toggle-button", "effects-toggle-button");
    buttonNode.type = "button";
    buttonNode.onclick = () => openEffectsModal();

    applyButtonUi(ui, buttonNode);

    if (buttonNode.parentElement !== document.body) {
        document.body.appendChild(buttonNode);
    }

    if (effectsModal?.isOpen()) {
        effectsModal.setContent(renderEffectsModal());
    }

    ensureStorageSync();
}