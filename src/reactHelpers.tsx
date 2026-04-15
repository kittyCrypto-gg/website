import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Renders TSX into a static HTML string.
 *
 * @param {ReactNode} node
 * @returns {string}
 */
export function render2Mkup(node: ReactNode): string {
    return renderToStaticMarkup(<>{node}</>);
}

/**
 * Renders TSX into a DocumentFragment.
 *
 * @param {ReactNode} node
 * @returns {DocumentFragment}
 */
export function render2Frag(node: ReactNode): DocumentFragment {
    const template = document.createElement("template");
    template.innerHTML = render2Mkup(node);
    return template.content.cloneNode(true) as DocumentFragment;
}

/**
 * Waits for a given number of paint cycles.
 *
 * @param {number} cycles
 * @returns {Promise<void>}
 */
export async function waitForDomPaint(cycles = 2): Promise<void> {
    for (let i = 0; i < cycles; i += 1) {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => resolve());
        });
    }
}