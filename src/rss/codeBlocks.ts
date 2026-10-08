import { wireExternalCodeBlocks } from "./externalCode.ts";
import { ensCodeTls, getPreCode, hglCode, updCodeBar } from "./codeBlockBasics.ts";
import { grpAdjacentCodeBlocks } from "./codeBlockGroups.ts";
import { qCodeGroupLayout, registerCodeBlockLayout } from "./codeBlockContext.ts";
import type { CodeBlockLayoutHooks } from "./codeBlockContext.ts";

export type { CodeBlockLayoutHooks } from "./codeBlockContext.ts";

/**
 * Post code bits.
 * @param {HTMLElement} pstDiv
 * @returns {void}
 */
export function hglPstCode(
    pstDiv: HTMLElement,
    hooks: CodeBlockLayoutHooks
): void {
    registerCodeBlockLayout(hooks);
    wireExternalCodeBlocks(pstDiv, {
        getPreCode,
        highlightCode: hglCode,
        updateCodeBar: updCodeBar,
        queueCodeGroupLayout: qCodeGroupLayout,
        queuePostHeight: hooks.queuePostHeight
    });
    grpAdjacentCodeBlocks(pstDiv);

    Array.from(pstDiv.querySelectorAll<HTMLElement>("pre code")).forEach((code) => {
        if (code.closest("[data-rss-code-group='1']")) {
            hglCode(code);
            return;
        }

        const pre = code.closest("pre");
        if (!(pre instanceof HTMLPreElement)) return;

        ensCodeTls(pre, code);
        hglCode(code);
    });
}
