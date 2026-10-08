/** Layout callbacks are supplied by RSS rendering after the feed arrives. */
export type CodeBlockLayoutHooks = Readonly<{
    recalculateContentHeight: (content: HTMLElement) => void;
    adjustScrollHeight: () => void;
    queuePostHeight: (post: HTMLElement) => void;
}>;

let codeGroupIndex = 0;
let layoutHooks: CodeBlockLayoutHooks | null = null;

export function registerCodeBlockLayout(hooks: CodeBlockLayoutHooks): void {
    layoutHooks = hooks;
}

export function nextCodeGroupIndex(): number {
    codeGroupIndex += 1;
    return codeGroupIndex;
}

export function currentCodeGroupIndex(): number {
    return codeGroupIndex;
}

/**
 * Updates surrounding post layout after code height changes.
 * @param {HTMLDivElement} frame
 * @returns {void}
 */
export function qCodeGroupLayout(frame: HTMLDivElement): void {
    const content = frame.closest(".rss-post-content");

    window.requestAnimationFrame(() => {
        if (content instanceof HTMLElement) {
            layoutHooks?.recalculateContentHeight(content);
        }

        layoutHooks?.adjustScrollHeight();
    });
}
