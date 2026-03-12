export interface CounterOptions {
    elementId: string;
    target: number;
    durationMs?: number;
}

interface CounterCell {
    cell: HTMLTableCellElement;
    face: HTMLSpanElement;
    currentDigit: number;
    finalDigit: number;
    usesBlur: boolean;
}

interface CounterAnimationEvent {
    timeMs: number;
    cellIndex: number;
    digit: number;
}

interface CounterInstance {
    root: HTMLElement;
    table: HTMLTableElement;
    cells: CounterCell[];
    padLength: number;
    targetValue: number;
    frameId: number | null;
    events: CounterAnimationEvent[];
    eventCursor: number;
}

const DEFAULT_DURATION_MS = 2500;
const MIN_DURATION_MS = 250;
const MAX_PRECISE_STEPS_PER_CELL = 80;
const MIN_VISIBLE_STEP_INTERVAL_MS = 40;
const BLUR_DIGIT_FRAME_MS = 35;

/**
 * Normalises the requested counter value.
 *
 * @param {number} value Raw counter target.
 * @returns {number} A safe non-negative integer.
 */
function sanitiseValue(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }

    return Math.floor(value);
}

/**
 * Calculates how many digits are needed, including the leading zero.
 *
 * @param {number} value Counter target value.
 * @returns {number} Total digit count including the leading zero.
 */
function getPadLength(value: number): number {
    return String(value).length + 1;
}

/**
 * Formats a value with leading zero padding.
 *
 * @param {number} value Counter value to format.
 * @param {number} padLength Total digit count.
 * @returns {string} The padded digit string.
 */
function formatValue(value: number, padLength: number): string {
    return String(value).padStart(padLength, "0");
}

/**
 * Resolves the counter animation duration.
 *
 * @param {number} targetValue Final counter value.
 * @param {number | undefined} durationMs Optional caller-provided duration.
 * @returns {number} Effective animation duration in milliseconds.
 */
function getEffectiveDuration(targetValue: number, durationMs?: number): number {
    if (typeof durationMs === "number") {
        return Math.max(MIN_DURATION_MS, durationMs);
    }

    if (targetValue <= 9) {
        return DEFAULT_DURATION_MS;
    }

    if (targetValue <= 99) {
        return DEFAULT_DURATION_MS;
    }

    if (targetValue <= 999) {
        return DEFAULT_DURATION_MS;
    }

    return DEFAULT_DURATION_MS;
}

/**
 * Computes the place value represented by a given column.
 *
 * @param {number} padLength Total digit count.
 * @param {number} cellIndex Zero-based cell index from left to right.
 * @returns {number} The place value for that column.
 */
function getPlaceValue(padLength: number, cellIndex: number): number {
    const power = padLength - cellIndex - 1;

    return 10 ** power;
}

/**
 * Computes how many visible digit changes a column would perform.
 *
 * @param {number} targetValue Final counter value.
 * @param {number} padLength Total digit count.
 * @param {number} cellIndex Zero-based cell index from left to right.
 * @returns {number} Number of digit changes for that column.
 */
function getDigitChangeCount(targetValue: number, padLength: number, cellIndex: number): number {
    const placeValue = getPlaceValue(padLength, cellIndex);

    return Math.floor(targetValue / placeValue);
}

/**
 * Forces a CSS animation class to restart.
 *
 * @param {HTMLElement} element Element receiving the class.
 * @param {string} className CSS class to restart.
 * @returns {void}
 */
function restartAnimationClass(element: HTMLElement, className: string): void {
    element.classList.remove(className);

    void element.offsetWidth;

    element.classList.add(className);
}

/**
 * Updates a single digit cell and optionally triggers its animation.
 *
 * @param {CounterCell} counterCell Digit cell state.
 * @param {number} digit Next digit to display.
 * @param {string | undefined} animationClass Optional CSS animation class.
 * @param {boolean} forceAnimation Whether animation should run even when the digit is unchanged.
 * @returns {void}
 */
function setCellDigit(
    counterCell: CounterCell,
    digit: number,
    animationClass?: string,
    forceAnimation = false
): void {
    const digitChanged = counterCell.currentDigit !== digit;

    if (digitChanged) {
        counterCell.face.textContent = String(digit);
        counterCell.currentDigit = digit;
    }

    if (!animationClass) {
        return;
    }

    if (!digitChanged && !forceAnimation) {
        return;
    }

    restartAnimationClass(counterCell.cell, animationClass);
}

/**
 * Builds the counter table structure.
 *
 * @param {number} padLength Total digit count.
 * @param {number} targetValue Final counter value.
 * @returns {{ table: HTMLTableElement; cells: CounterCell[] }} Table and cell state.
 */
function createCounterTable(
    padLength: number,
    targetValue: number
): { table: HTMLTableElement; cells: CounterCell[] } {
    const table = document.createElement("table");
    const row = document.createElement("tr");
    const cells: CounterCell[] = [];
    const finalDigits = formatValue(targetValue, padLength);

    table.className = "clicker-counter";

    for (let index = 0; index < padLength; index += 1) {
        const cell = document.createElement("td");
        const windowElement = document.createElement("div");
        const face = document.createElement("span");

        cell.className = "clicker-counter__cell";
        windowElement.className = "clicker-counter__window";
        face.className = "clicker-counter__face";
        face.textContent = "0";

        windowElement.appendChild(face);
        cell.appendChild(windowElement);
        row.appendChild(cell);

        cells.push({
            cell,
            face,
            currentDigit: 0,
            finalDigit: Number.parseInt(finalDigits[index], 10),
            usesBlur: false
        });
    }

    table.appendChild(row);

    return { table, cells };
}

/**
 * Chooses whether each digit should use precise carry animation or blur mode.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @param {number} durationMs Total animation duration in milliseconds.
 * @returns {void}
 */
function assignCellAnimationModes(instance: CounterInstance, durationMs: number): void {
    for (let cellIndex = 0; cellIndex < instance.cells.length; cellIndex += 1) {
        const changeCount = getDigitChangeCount(instance.targetValue, instance.padLength, cellIndex);

        if (changeCount === 0) {
            instance.cells[cellIndex].usesBlur = false;
            continue;
        }

        const stepIntervalMs = durationMs / changeCount;
        const hasTooManySteps = changeCount > MAX_PRECISE_STEPS_PER_CELL;
        const isTooFastToRead = stepIntervalMs < MIN_VISIBLE_STEP_INTERVAL_MS;

        instance.cells[cellIndex].usesBlur = hasTooManySteps || isTooFastToRead;
    }
}

/**
 * Precomputes all precise carry events for non-blurred columns.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @param {number} durationMs Total animation duration in milliseconds.
 * @returns {CounterAnimationEvent[]} Sorted timeline of digit changes.
 */
function buildAnimationEvents(instance: CounterInstance, durationMs: number): CounterAnimationEvent[] {
    const events: CounterAnimationEvent[] = [];

    if (instance.targetValue === 0) {
        return events;
    }

    for (let cellIndex = 0; cellIndex < instance.cells.length; cellIndex += 1) {
        const counterCell = instance.cells[cellIndex];

        if (counterCell.usesBlur) {
            continue;
        }

        const placeValue = getPlaceValue(instance.padLength, cellIndex);
        const changeCount = Math.floor(instance.targetValue / placeValue);

        for (let stepIndex = 1; stepIndex <= changeCount; stepIndex += 1) {
            const reachedValue = stepIndex * placeValue;

            events.push({
                timeMs: durationMs * (reachedValue / instance.targetValue),
                cellIndex,
                digit: stepIndex % 10
            });
        }
    }

    events.sort((left, right) => {
        if (left.timeMs === right.timeMs) {
            return right.cellIndex - left.cellIndex;
        }

        return left.timeMs - right.timeMs;
    });

    return events;
}

/**
 * Applies all precise carry events that should have happened by the current time.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @param {number} elapsedMs Elapsed animation time in milliseconds.
 * @returns {void}
 */
function updatePreciseCells(instance: CounterInstance, elapsedMs: number): void {
    while (instance.eventCursor < instance.events.length) {
        const event = instance.events[instance.eventCursor];

        if (event.timeMs > elapsedMs) {
            return;
        }

        const counterCell = instance.cells[event.cellIndex];

        counterCell.cell.classList.remove("is-blur-spinning");
        setCellDigit(counterCell, event.digit, "is-spinning", true);

        instance.eventCursor += 1;
    }
}

/**
 * Updates blurred columns while the counter is rolling.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @param {number} elapsedMs Elapsed animation time in milliseconds.
 * @returns {void}
 */
function updateBlurredCells(instance: CounterInstance, elapsedMs: number): void {
    const blurStep = Math.floor(elapsedMs / BLUR_DIGIT_FRAME_MS);

    for (let cellIndex = 0; cellIndex < instance.cells.length; cellIndex += 1) {
        const counterCell = instance.cells[cellIndex];

        if (!counterCell.usesBlur) {
            continue;
        }

        const rollingDigit = (blurStep + (instance.cells.length - cellIndex) * 3) % 10;

        counterCell.cell.classList.add("is-blur-spinning");
        setCellDigit(counterCell, rollingDigit);
    }
}

/**
 * Lands all digits on their final values.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @returns {void}
 */
function finaliseCounter(instance: CounterInstance): void {
    for (let cellIndex = 0; cellIndex < instance.cells.length; cellIndex += 1) {
        const counterCell = instance.cells[cellIndex];
        const animationClass = counterCell.usesBlur ? "is-landing" : "is-spinning";

        counterCell.cell.classList.remove("is-blur-spinning");
        setCellDigit(counterCell, counterCell.finalDigit, animationClass, counterCell.usesBlur);
    }
}

/**
 * Runs the counter animation immediately.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @param {number} durationMs Total animation duration in milliseconds.
 * @returns {void}
 */
function animateCounter(instance: CounterInstance, durationMs: number): void {
    if (instance.targetValue === 0) {
        finaliseCounter(instance);
        return;
    }

    instance.events = buildAnimationEvents(instance, durationMs);
    instance.eventCursor = 0;

    const startTime = performance.now();

    const tick = (now: number): void => {
        const elapsedMs = Math.min(durationMs, now - startTime);

        updatePreciseCells(instance, elapsedMs);
        updateBlurredCells(instance, elapsedMs);

        if (elapsedMs < durationMs) {
            instance.frameId = window.requestAnimationFrame(tick);
            return;
        }

        finaliseCounter(instance);
        instance.frameId = null;
    };

    instance.frameId = window.requestAnimationFrame(tick);
}

/**
 * Starts the counter only when its host enters the viewport.
 *
 * @param {CounterInstance} instance Counter instance state.
 * @param {number} durationMs Total animation duration in milliseconds.
 * @returns {void}
 */
function animateCounterWhenVisible(instance: CounterInstance, durationMs: number): void {
    if (typeof window.IntersectionObserver !== "function") {
        animateCounter(instance, durationMs);
        return;
    }

    const observer = new IntersectionObserver(
        (entries, activeObserver) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) {
                    continue;
                }

                activeObserver.unobserve(instance.root);
                activeObserver.disconnect();
                animateCounter(instance, durationMs);
                return;
            }
        },
        {
            threshold: 0.2
        }
    );

    observer.observe(instance.root);
}

/**
 * Clears the current host contents.
 *
 * @param {HTMLElement} root Counter host element.
 * @returns {void}
 */
function clearRoot(root: HTMLElement): void {
    root.textContent = "";
}

/**
 * Builds a counter instance and injects it into the host element.
 *
 * @param {HTMLElement} root Counter host element.
 * @param {number} targetValue Final counter value.
 * @param {number} durationMs Total animation duration in milliseconds.
 * @returns {CounterInstance} Prepared counter instance.
 */
function buildCounter(root: HTMLElement, targetValue: number, durationMs: number): CounterInstance {
    const padLength = getPadLength(targetValue);
    const { table, cells } = createCounterTable(padLength, targetValue);

    clearRoot(root);
    root.appendChild(table);

    const instance: CounterInstance = {
        root,
        table,
        cells,
        padLength,
        targetValue,
        frameId: null,
        events: [],
        eventCursor: 0
    };

    assignCellAnimationModes(instance, durationMs);

    return instance;
}

/**
 * Renders a clicker-style counter into a specific element by id.
 * The counter starts animating only when it enters the viewport.
 *
 * @param {CounterOptions} options Counter configuration.
 * @returns {void}
 */
export function renderCounter(options: CounterOptions): void {
    const root = document.getElementById(options.elementId);

    if (!(root instanceof HTMLElement)) {
        throw new Error(`Counter element with id "${options.elementId}" was not found.`);
    }

    root.classList.add("counter");

    const targetValue = sanitiseValue(options.target);
    const durationMs = getEffectiveDuration(targetValue, options.durationMs);
    const instance = buildCounter(root, targetValue, durationMs);

    animateCounterWhenVisible(instance, durationMs);
}