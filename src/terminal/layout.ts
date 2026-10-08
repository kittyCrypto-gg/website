import * as helpers from "../helpers.ts";
import type {
    FollowState,
    ScrollTrackingController,
    XtermTerminal
} from "./types.ts";

export async function waitForTerminalTextarea(
    term: XtermTerminal
): Promise<HTMLTextAreaElement> {
    const root = term.element;

    if (!(root instanceof HTMLElement)) {
        throw new Error("Terminal root element is not available");
    }

    const findTextarea = (): HTMLTextAreaElement | null => {
        return root.querySelector<HTMLTextAreaElement>(
            "textarea.xterm-helper-textarea"
        ) || root.querySelector<HTMLTextAreaElement>("textarea") || null;
    };

    const existing = findTextarea();
    existing?.setAttribute("id", "terminal-helper-textarea");
    if (existing) return existing;

    return new Promise<HTMLTextAreaElement>((resolve) => {
        const observer = new MutationObserver(() => {
            const textarea = findTextarea();
            if (!(textarea instanceof HTMLTextAreaElement)) return;

            observer.disconnect();
            textarea.setAttribute("id", "terminal-helper-textarea");
            resolve(textarea);
        });

        observer.observe(root, { childList: true, subtree: true });
    });
}

export function raf2(fn: () => void): void {
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(fn);
    });
}

export function firstExistingEl(
    ids: readonly string[]
): HTMLElement | null {
    for (const id of ids) {
        const el = helpers.getEl(id);
        if (el) return el;
    }

    return null;
}

export function attachSafeResizeFitting(
    fitNow: () => void
): () => void {
    const onResize = (): void => raf2(fitNow);
    window.addEventListener("resize", onResize);

    const viewport = window.visualViewport ?? null;
    const onViewportResize = viewport
        ? (): void => raf2(fitNow)
        : null;

    if (viewport && onViewportResize) {
        viewport.addEventListener("resize", onViewportResize);
    }

    return (): void => {
        window.removeEventListener("resize", onResize);

        if (viewport && onViewportResize) {
            viewport.removeEventListener(
                "resize",
                onViewportResize
            );
        }
    };
}

export function attachTerminalResizeObserver(
    observedEl: HTMLElement,
    fitNow: () => void
): () => void {
    if (typeof ResizeObserver === "undefined") {
        return (): void => undefined;
    }

    const observer = new ResizeObserver(() => {
        raf2(fitNow);
    });

    observer.observe(observedEl);

    return (): void => {
        observer.disconnect();
    };
}

export function attachScrollTracking(
    term: XtermTerminal,
    followState: FollowState
): ScrollTrackingController {
    let viewport: HTMLElement | null = null;
    let programmatic = false;

    const resolveViewport = (): HTMLElement | null => {
        const root = term.element ?? null;
        if (!root) return null;

        const found = root.querySelector(".xterm-viewport");
        if (found instanceof HTMLElement) viewport = found;

        return viewport;
    };

    const atBottom = (candidate: HTMLElement): boolean => {
        return candidate.scrollTop + candidate.clientHeight >=
            candidate.scrollHeight - 2;
    };

    const scrollToBottom = (): void => {
        programmatic = true;
        term.scrollToBottom();

        window.requestAnimationFrame(() => {
            programmatic = false;
        });
    };

    const maybeScroll = (): void => {
        if (!followState.value) return;
        scrollToBottom();
    };

    const forceFollowAndScroll = (): void => {
        followState.value = true;
        scrollToBottom();
    };

    const wire = (): boolean => {
        const candidate = resolveViewport();
        if (!candidate) return false;
        if (candidate.dataset.scrollWired === "true") return true;

        candidate.dataset.scrollWired = "true";
        candidate.addEventListener("scroll", () => {
            if (programmatic) return;
            followState.value = atBottom(candidate);
        });

        return true;
    };

    if (!wire()) raf2(() => void wire());

    return {
        scrollToBottom,
        maybeScroll,
        forceFollowAndScroll
    };
}
