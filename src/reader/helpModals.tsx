import {
    closeOnClick,
    factory,
    type Modal
} from "../modals.ts";
import { render2Mkup } from "../reactHelpers.tsx";
import type {
    ModalCtx,
    ModalDecorator
} from "./types.ts";
import {
    InfoModal,
    LangTipModal,
    ReaderModeTipModal
} from "./views.tsx";

const LANGUAGE_TIP_HIDE_KEY = "languageTooltipsHelpModalHide";
const READER_MODE_TIP_HIDE_KEY = "readerModeHelpModalHide";

let languageTipShown = false;
let languageTipObserver: IntersectionObserver | null = null;
let readerModeTipShown = false;
let readerModeTipObserver: IntersectionObserver | null = null;

function readStoredBoolean(key: string): boolean {
    return localStorage.getItem(key) === "true";
}

function writeStoredBoolean(key: string, value: boolean): void {
    localStorage.setItem(key, value ? "true" : "false");
}

function shouldShowLanguageTip(): boolean {
    if (languageTipShown) return false;
    if (readStoredBoolean(LANGUAGE_TIP_HIDE_KEY)) return false;
    return true;
}

function shouldShowReaderModeTip(): boolean {
    if (readerModeTipShown) return false;
    if (readStoredBoolean(READER_MODE_TIP_HIDE_KEY)) return false;
    return true;
}

function createPersistHideDecorator(key: string): ModalDecorator {
    return {
        mount: (ctx: ModalCtx) => {
            const box = ctx.modalEl.querySelector<HTMLInputElement>(
                "input[type='checkbox']"
            );

            if (!box) return;

            box.checked = readStoredBoolean(key);

            const onChange = (): void => {
                const hidden = box.checked;
                writeStoredBoolean(key, hidden);
                if (hidden) ctx.close();
            };

            box.addEventListener("change", onChange);
            return () => box.removeEventListener("change", onChange);
        }
    };
}

const infoModal: Modal = factory.create({
    id: "kc-reader-info-modal",
    mode: "blocking",
    content: () => render2Mkup(<InfoModal />),
    decorators: [
        closeOnClick("#kc-reader-info-close")
    ]
});

const languageTipModal: Modal = factory.create({
    id: "kc-language-tooltips-help-modal",
    mode: "non-blocking",
    readerModeCompatible: false,
    modalClassName: "did-you-know-tip",
    content: () => render2Mkup(<LangTipModal />),
    closeOnOutsideClick: false,
    decorators: [
        closeOnClick("#kc-language-tooltips-help-close"),
        createPersistHideDecorator(LANGUAGE_TIP_HIDE_KEY)
    ]
});

const readerModeTipModal: Modal = factory.create({
    id: "kc-reader-mode-help-modal",
    mode: "non-blocking",
    readerModeCompatible: false,
    modalClassName: "did-you-know-tip",
    position: {
        target: "#reader-toggle"
    },
    asTextBubble: true,
    content: () => render2Mkup(<ReaderModeTipModal />),
    closeOnOutsideClick: false,
    decorators: [
        closeOnClick("#kc-reader-mode-help-close"),
        createPersistHideDecorator(READER_MODE_TIP_HIDE_KEY)
    ]
});

export function openReaderInfo(): void {
    infoModal.open();
}

function openLanguageTip(): void {
    if (!shouldShowLanguageTip()) return;
    if (languageTipModal.isOpen()) return;

    languageTipModal.open();
    languageTipShown = true;
}

export function initLanguageTipObserver(
    root: Document = document
): void {
    if (!shouldShowLanguageTip()) return;

    const triggers = Array.from(
        root.querySelectorAll("span.tooltip-trigger")
    ).filter(
        (node): node is HTMLSpanElement =>
            node instanceof HTMLSpanElement
    );

    if (triggers.length === 0) return;

    languageTipObserver?.disconnect();
    languageTipObserver = new IntersectionObserver(
        (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;

            openLanguageTip();
            languageTipObserver?.disconnect();
            languageTipObserver = null;
        },
        { threshold: 0.15 }
    );

    for (const trigger of triggers) {
        languageTipObserver.observe(trigger);
    }
}

function openReaderModeTip(): void {
    if (!shouldShowReaderModeTip()) return;
    if (readerModeTipModal.isOpen()) return;

    readerModeTipModal.open();
    readerModeTipShown = true;
}

export function initReaderModeTip(
    button: HTMLButtonElement
): void {
    if (!shouldShowReaderModeTip()) return;

    readerModeTipObserver?.disconnect();
    readerModeTipObserver = new IntersectionObserver(
        (entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;

            openReaderModeTip();
            readerModeTipObserver?.disconnect();
            readerModeTipObserver = null;
        },
        { threshold: 0.15 }
    );

    readerModeTipObserver.observe(button);
}
