import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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
    const tpl = document.createElement('template');
    tpl.innerHTML = render2Mkup(node);
    return tpl.content.cloneNode(true) as DocumentFragment;
}