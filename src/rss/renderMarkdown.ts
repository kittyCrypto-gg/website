import {
    applyBlockquoteAccents,
    prepareRssMarkdown
} from "./markdown.ts";
import { applSegShares } from "./segments.ts";

declare const marked: {
    parse: (markdown: string) => string;
};

export function renderRssMarkdown(
    markdown: string,
    seed: string
): string {
    const prepared = prepareRssMarkdown(markdown);
    const html = applyBlockquoteAccents(
        marked.parse(prepared)
    );

    return applSegShares(html, seed);
}
