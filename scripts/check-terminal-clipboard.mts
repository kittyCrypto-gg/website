import assert from "node:assert/strict";
import {
    attachTerminalClipboard,
    type ClipboardAccess,
    type ClipboardTerminal
} from "../src/terminal/clipboard.ts";

let keyHandler: ((event: KeyboardEvent) => boolean) | undefined;
let selection = "line one\nline two";
let focusCount = 0;
const pasted: string[] = [];
const written: string[] = [];
let clipboardText = "pasted from browser";
const term: ClipboardTerminal = {
    attachCustomKeyEventHandler(handler) { keyHandler = handler; },
    hasSelection: () => selection.length > 0,
    getSelection: () => selection,
    paste(value) { pasted.push(value); },
    focus() { focusCount++; }
};
const clipboard: ClipboardAccess = {
    async writeText(value) { written.push(value); },
    async readText() { return clipboardText; }
};
const element = new EventTarget() as HTMLElement;
const detach = attachTerminalClipboard(term, element, clipboard);
assert.ok(keyHandler, "xterm keyboard handler was not registered");

function key(
    character: string,
    options: { ctrl?: boolean; shift?: boolean; type?: string; repeat?: boolean } = {}
): { handled: boolean; prevented: boolean } {
    let prevented = false;
    const event = {
        type: options.type ?? "keydown",
        code: character === "c" ? "KeyC" : character === "v" ? "KeyV" : "KeyA",
        key: character,
        ctrlKey: options.ctrl ?? true,
        shiftKey: options.shift ?? true,
        altKey: false,
        metaKey: false,
        repeat: options.repeat ?? false,
        preventDefault: () => { prevented = true; }
    } as KeyboardEvent;
    return { handled: keyHandler!(event), prevented };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

assert.deepEqual(key("c"), { handled: false, prevented: true });
assert.deepEqual(written, ["line one\nline two"], "Ctrl+Shift+C did not copy selected text");

key("c", { type: "keyup" });
key("c", { repeat: true });
assert.equal(written.length, 1, "One keypress copied more than once");

selection = "";
key("c");
assert.equal(written.length, 1, "Copy without a selection should be ignored");

assert.deepEqual(key("c", { shift: false }), { handled: true, prevented: false },
    "Ordinary Ctrl+C must still reach the guest");
assert.deepEqual(key("a"), { handled: true, prevented: false },
    "Unrelated shortcuts must still reach the guest");

assert.deepEqual(key("v"), { handled: false, prevented: true });
await settle();
assert.deepEqual(pasted, ["pasted from browser"], "Ctrl+Shift+V did not paste into xterm");
assert.equal(focusCount, 1, "Pasting must return focus to xterm");

key("v", { type: "keyup" });
key("v", { repeat: true });
await settle();
assert.equal(pasted.length, 1, "Paste was repeated for keyup or autorepeat");

clipboardText = "right-click clipboard";
const rightClick = Object.assign(new Event("contextmenu", {
    bubbles: true,
    cancelable: true
}), { button: 2 });
element.dispatchEvent(rightClick);
assert.ok(rightClick.defaultPrevented, "Right-click did not suppress the context menu");
await settle();
assert.deepEqual(pasted, ["pasted from browser", "right-click clipboard"],
    "Right-click must paste via xterm rather than print clipboard contents");

const nonRightClick = Object.assign(new Event("contextmenu", {
    cancelable: true
}), { button: 0 });
element.dispatchEvent(nonRightClick);
assert.ok(!nonRightClick.defaultPrevented, "Non-right-click context menu was blocked");
await settle();
assert.equal(pasted.length, 2);

detach();
assert.deepEqual(key("v"), { handled: true, prevented: false },
    "Detached shortcuts must no longer intercept guest input");
element.dispatchEvent(Object.assign(new Event("contextmenu", { cancelable: true }), {
    button: 2
}));
await settle();
assert.equal(pasted.length, 2, "Clipboard listener survived terminal disposal");

// A pending clipboard read must not inject input after disposal.
let resolveRead: ((text: string) => void) | undefined;
const delayed: ClipboardAccess = {
    async writeText() {},
    readText() {
        return new Promise<string>(resolve => { resolveRead = resolve; });
    }
};
const delayedElement = new EventTarget() as HTMLElement;
const disposeDelayed = attachTerminalClipboard(term, delayedElement, delayed);
key("v");
disposeDelayed();
resolveRead?.("must not paste");
await settle();
assert.equal(pasted.length, 2, "Clipboard read pasted into a disposed terminal");

console.log("[terminal clipboard] Right-click paste, Ctrl+Shift+C/V and cleanup passed.");
