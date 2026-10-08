import { getPreCode } from "./codeBlockBasics.ts";

/**
 * Blank text and comments may sit between adjacent markdown code blocks.
 * @param {ChildNode} node
 * @returns {boolean}
 */
function isCodeRunGap(node: ChildNode): boolean {
    if (node.nodeType === Node.COMMENT_NODE) {
        return true;
    }

    if (node.nodeType !== Node.TEXT_NODE) {
        return false;
    }

    return (node.textContent ?? "").trim().length === 0;
}

/**
 * Collects adjacent code block runs from one parent.
 * @param {ParentNode} parent
 * @returns {HTMLPreElement[][]}
 */
function colCodeRunsFromParent(parent: ParentNode): HTMLPreElement[][] {
    const runs: HTMLPreElement[][] = [];
    let run: HTMLPreElement[] = [];

    const flush = (): void => {
        if (run.length > 1) {
            runs.push(run);
        }

        run = [];
    };

    Array.from(parent.childNodes).forEach((node) => {
        if (isCodeRunGap(node)) {
            return;
        }

        if (node instanceof HTMLPreElement && getPreCode(node) !== null && !node.closest(".rss-code-frame")) {
            run.push(node);
            return;
        }

        flush();
    });

    flush();

    return runs;
}

/**
 * Collects adjacent code block runs from a post.
 * @param {HTMLElement} root
 * @returns {HTMLPreElement[][]}
 */
export function colCodeRuns(root: HTMLElement): HTMLPreElement[][] {
    const parents = new Set<ParentNode>();

    Array.from(root.querySelectorAll<HTMLPreElement>("pre")).forEach((pre) => {
        if (pre.closest(".rss-code-frame")) {
            return;
        }

        if (!pre.parentNode) {
            return;
        }

        parents.add(pre.parentNode);
    });

    return Array.from(parents).flatMap((parent) => colCodeRunsFromParent(parent));
}
