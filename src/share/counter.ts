export interface CounterOptions {
    elementId: string;
    target: number;
    durationMs?: number;
}

interface Cell {
    cell: HTMLTableCellElement;
    face: HTMLSpanElement;
    currentDigit: number;
    finalDigit: number;
    usesBlur: boolean;
}

interface Ev {
    timeMs: number;
    cellIndex: number;
    digit: number;
}

interface Inst {
    root: HTMLElement;
    table: HTMLTableElement;
    cells: Cell[];
    padLength: number;
    targetValue: number;
    frameId: number | null;
    events: Ev[];
    eventCursor: number;
}

const DEF_DUR_MS = 2500;
const MIN_DUR_MS = 250;
const MAX_PRECISE_STEPS_PER_CELL = 80;
const MIN_VISIBLE_STEP_INTERVAL_MS = 40;
const BLUR_DIGIT_FRAME_MS = 35;

const COUNTER_CREDIT_TEXT = "programmed by\u00A0";
const COUNTER_CREDIT_NAME = "kitty crow";
const COUNTER_CREDIT_URL = "https://kittycrow.dev";

/**
 * Makes the target safe enough to use.
 * Negative or weird values just become 0.
 * @param {number} value
 * @returns {number}
 */
function sanVal(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }

    return Math.floor(value);
}

/**
 * How many digits we need, with the leading zero slot too.
 * @param {number} value
 * @returns {number}
 */
function padLen(value: number): number {
    return String(value).length + 1;
}

/**
 * Pads a number out into the final digit string.
 * @param {number} value
 * @param {number} length
 * @returns {string}
 */
function fmtVal(value: number, length: number): string {
    return String(value).padStart(length, "0");
}

/**
 * Picks the runtime duration.
 * if caller gives one we clamp it a bit, otherwise default and done.
 * @param {number} _targetValue
 * @param {number | undefined} durationMs
 * @returns {number}
 */
function durMs(_targetValue: number, durationMs?: number): number {
    if (typeof durationMs === "number") {
        return Math.max(MIN_DUR_MS, durationMs);
    }

    return DEF_DUR_MS;
}

/**
 * Place value for a column.
 * leftmost gets the biggest one obv.
 * @param {number} length
 * @param {number} cellIndex
 * @returns {number}
 */
function placeVal(length: number, cellIndex: number): number {
    const power = length - cellIndex - 1;

    return 10 ** power;
}

/**
 * Counts how many visible changes one column would do.
 * @param {number} targetValue
 * @param {number} length
 * @param {number} cellIndex
 * @returns {number}
 */
function changeCnt(targetValue: number, length: number, cellIndex: number): number {
    const value = placeVal(length, cellIndex);

    return Math.floor(targetValue / value);
}

/**
 * Forces a css anim class to restart.
 * old browser trick, still useful somehow.
 * @param {HTMLElement} element
 * @param {string} className
 * @returns {void}
 */
function restartAnim(element: HTMLElement, className: string): void {
    element.classList.remove(className);

    void element.offsetWidth;

    element.classList.add(className);
}

/**
 * Sets one digit and maybe kicks its animation too.
 * @param {Cell} cell
 * @param {number} digit
 * @param {string | undefined} animCls
 * @param {boolean} forceAnim
 * @returns {void}
 */
function setDig(
    cell: Cell,
    digit: number,
    animCls?: string,
    forceAnim = false
): void {
    const changed = cell.currentDigit !== digit;

    if (changed) {
        cell.face.textContent = String(digit);
        cell.currentDigit = digit;
    }

    if (!animCls) {
        return;
    }

    if (!changed && !forceAnim) {
        return;
    }

    restartAnim(cell.cell, animCls);
}

/**
 * Builds the table dom and cell state.
 * @param {number} length
 * @param {number} targetValue
 * @returns {{ table: HTMLTableElement; cells: Cell[] }}
 */
function mkTable(
    length: number,
    targetValue: number
): { table: HTMLTableElement; cells: Cell[] } {
    const table = document.createElement("table");
    const row = document.createElement("tr");
    const cells: Cell[] = [];
    const finalDigits = fmtVal(targetValue, length);

    table.className = "clicker-counter";

    for (let index = 0; index < length; index += 1) {
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
 * Builds the visible credit line.
 * @returns {HTMLSpanElement}
 */
function mkCredit(): HTMLSpanElement {
    const credit = document.createElement("span");
    const link = document.createElement("a");

    credit.className = "clicker-counter__credit";
    credit.appendChild(document.createTextNode(COUNTER_CREDIT_TEXT));

    link.href = COUNTER_CREDIT_URL;
    link.textContent = COUNTER_CREDIT_NAME;
    link.target = "_blank";
    link.rel = "noopener noreferrer";

    credit.appendChild(link);

    return credit;
}

/**
 * Decides which cells get proper carries and which ones just blur-spin.
 * @param {Inst} inst
 * @param {number} durationMs
 * @returns {void}
 */
function setModes(inst: Inst, durationMs: number): void {
    for (let cellIndex = 0; cellIndex < inst.cells.length; cellIndex += 1) {
        const count = changeCnt(inst.targetValue, inst.padLength, cellIndex);

        if (count === 0) {
            inst.cells[cellIndex].usesBlur = false;
            continue;
        }

        const stepIntervalMs = durationMs / count;
        const tooMany = count > MAX_PRECISE_STEPS_PER_CELL;
        const tooFast = stepIntervalMs < MIN_VISIBLE_STEP_INTERVAL_MS;

        inst.cells[cellIndex].usesBlur = tooMany || tooFast;
    }
}

/**
 * Precomputes the exact carry events for the non-blur cells.
 * @param {Inst} inst
 * @param {number} durationMs
 * @returns {Ev[]}
 */
function mkEvents(inst: Inst, durationMs: number): Ev[] {
    const events: Ev[] = [];

    if (inst.targetValue === 0) {
        return events;
    }

    for (let cellIndex = 0; cellIndex < inst.cells.length; cellIndex += 1) {
        const cell = inst.cells[cellIndex];
        if (cell.usesBlur) continue;

        const value = placeVal(inst.padLength, cellIndex);
        const count = Math.floor(inst.targetValue / value);

        for (let stepIndex = 1; stepIndex <= count; stepIndex += 1) {
            const reachedValue = stepIndex * value;

            events.push({
                timeMs: durationMs * (reachedValue / inst.targetValue),
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
 * Applies all precise events that should already have happened.
 * @param {Inst} inst
 * @param {number} elapsedMs
 * @returns {void}
 */
function stepPrecise(inst: Inst, elapsedMs: number): void {
    while (inst.eventCursor < inst.events.length) {
        const event = inst.events[inst.eventCursor];

        if (event.timeMs > elapsedMs) {
            return;
        }

        const cell = inst.cells[event.cellIndex];

        cell.cell.classList.remove("is-blur-spinning");
        setDig(cell, event.digit, "is-spinning", true);

        inst.eventCursor += 1;
    }
}

/**
 * Updates the blur-spin columns while the thing is rolling.
 * @param {Inst} inst
 * @param {number} elapsedMs
 * @returns {void}
 */
function stepBlur(inst: Inst, elapsedMs: number): void {
    const blurStep = Math.floor(elapsedMs / BLUR_DIGIT_FRAME_MS);

    for (let cellIndex = 0; cellIndex < inst.cells.length; cellIndex += 1) {
        const cell = inst.cells[cellIndex];
        if (!cell.usesBlur) continue;

        const rollingDigit = (blurStep + (inst.cells.length - cellIndex) * 3) % 10;

        cell.cell.classList.add("is-blur-spinning");
        setDig(cell, rollingDigit);
    }
}

/**
 * Lands every cell on the final digit.
 * @param {Inst} inst
 * @returns {void}
 */
function finish(inst: Inst): void {
    for (let cellIndex = 0; cellIndex < inst.cells.length; cellIndex += 1) {
        const cell = inst.cells[cellIndex];
        const animCls = cell.usesBlur ? "is-landing" : "is-spinning";

        cell.cell.classList.remove("is-blur-spinning");
        setDig(cell, cell.finalDigit, animCls, cell.usesBlur);
    }
}

/**
 * Runs the animation right now.
 * @param {Inst} inst
 * @param {number} durationMs
 * @returns {void}
 */
function runAnim(inst: Inst, durationMs: number): void {
    if (inst.targetValue === 0) {
        finish(inst);
        return;
    }

    inst.events = mkEvents(inst, durationMs);
    inst.eventCursor = 0;

    const startTime = performance.now();

    /**
     * One animation frame tick.
     * @param {number} now
     * @returns {void}
     */
    const tick = (now: number): void => {
        const elapsedMs = Math.min(durationMs, now - startTime);

        stepPrecise(inst, elapsedMs);
        stepBlur(inst, elapsedMs);

        if (elapsedMs < durationMs) {
            inst.frameId = window.requestAnimationFrame(tick);
            return;
        }

        finish(inst);
        inst.frameId = null;
    };

    inst.frameId = window.requestAnimationFrame(tick);
}

/**
 * Waits until the counter is visible before starting it.
 * if IntersectionObserver doesnt exist we just run it straight away.
 * @param {Inst} inst
 * @param {number} durationMs
 * @returns {void}
 */
function runWhenVis(inst: Inst, durationMs: number): void {
    if (typeof window.IntersectionObserver !== "function") {
        runAnim(inst, durationMs);
        return;
    }

    /**
     * Starts once the host is actually on screen.
     * @param {IntersectionObserverEntry[]} entries
     * @param {IntersectionObserver} obs
     * @returns {void}
     */
    const onInt = (entries: IntersectionObserverEntry[], obs: IntersectionObserver): void => {
        for (const entry of entries) {
            if (!entry.isIntersecting) {
                continue;
            }

            obs.unobserve(inst.root);
            obs.disconnect();
            runAnim(inst, durationMs);
            return;
        }
    };

    const observer = new IntersectionObserver(onInt, {
        threshold: 0.2
    });

    observer.observe(inst.root);
}

/**
 * Clears the host before we rebuild the table.
 * @param {HTMLElement} root
 * @returns {void}
 */
function clear(root: HTMLElement): void {
    root.textContent = "";
}

/**
 * Builds one counter instance and puts it into the host.
 * @param {HTMLElement} root
 * @param {number} targetValue
 * @param {number} durationMs
 * @returns {Inst}
 */
function mkCounter(root: HTMLElement, targetValue: number, durationMs: number): Inst {
    const length = padLen(targetValue);
    const { table, cells } = mkTable(length, targetValue);

    clear(root);
    root.append(table, mkCredit());

    const inst: Inst = {
        root,
        table,
        cells,
        padLength: length,
        targetValue,
        frameId: null,
        events: [],
        eventCursor: 0
    };

    setModes(inst, durationMs);

    return inst;
}

/**
 * Renders a clicker-style counter into a host element by id.
 * Starts once it comes into view.
 * @param {CounterOptions} options
 * @returns {void}
 */
export function renderCounter(options: CounterOptions): void {
    const root = document.getElementById(options.elementId);

    if (!(root instanceof HTMLElement)) {
        throw new Error(`Counter element with id "${options.elementId}" was not found.`);
    }

    root.classList.add("counter");

    const targetValue = sanVal(options.target);
    const durationMs = durMs(targetValue, options.durationMs);
    const inst = mkCounter(root, targetValue, durationMs);

    runWhenVis(inst, durationMs);
}