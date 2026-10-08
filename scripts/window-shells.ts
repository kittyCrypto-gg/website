import type { MainJson, windowDef } from "../src/uiFetch.ts";
import { renderStaticLauncher, renderStaticWindowHead } from "../src/window/staticFrame.tsx";

type Tag = Readonly<{ name: string; start: number; end: number; raw: string; closing: boolean; singleton: boolean }>;
type Range = Readonly<{ opening: Tag; closing: Tag }>;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function scanTags(html: string): Tag[] {
    const tags: Tag[] = [];
    const pattern = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][\w:-]*)\b[^>]*>/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
        if (match[0].startsWith("<!--")) continue;
        const name = (match[2] ?? "").toLowerCase();
        const closing = match[1] === "/";
        tags.push({
            name,
            raw: match[0],
            start: match.index,
            end: pattern.lastIndex,
            closing,
            singleton: VOID_TAGS.has(name) || /\/\s*>$/.test(match[0])
        });

        if (closing || !["script", "style", "textarea"].includes(name)) continue;

        const endTag = new RegExp(`<\\/${name}\\s*>`, "gi");
        endTag.lastIndex = pattern.lastIndex;
        const close = endTag.exec(html);
        if (!close) continue;
        tags.push({
            name,
            raw: close[0],
            start: close.index,
            end: endTag.lastIndex,
            closing: true,
            singleton: false
        });
        pattern.lastIndex = endTag.lastIndex;
    }

    return tags;
}

function attribute(raw: string, name: string): string | null {
    const match = raw.match(new RegExp(`(?:\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
    return match?.[1] ?? match?.[2] ?? null;
}

function matchesSelector(tag: Tag, selector: string): boolean {
    if (tag.closing || tag.singleton) return false;
    if (selector.startsWith("#")) return attribute(tag.raw, "id") === selector.slice(1);
    if (selector.startsWith(".")) {
        return (attribute(tag.raw, "class") ?? "").split(/\s+/).includes(selector.slice(1));
    }
    return false;
}

function findRange(tags: readonly Tag[], selector: string): Range | null {
    const idx = tags.findIndex((tag) => matchesSelector(tag, selector));
    if (idx < 0) return null;

    const opening = tags[idx];
    let depth = 1;

    for (let i = idx + 1; i < tags.length; i += 1) {
        const current = tags[i];
        if (current.name !== opening.name) continue;
        if (!current.closing && !current.singleton) depth += 1;
        if (current.closing) depth -= 1;
        if (depth === 0) return { opening, closing: current };
    }

    throw new Error("Unclosed element for window selector " + selector);
}

function appendStaticClass(raw: string, id: string, options: windowDef["options"]): string {
    const old = attribute(raw, "class") ?? "";
    const classes = [
        ...old.split(/\s+/).filter(Boolean),
        "window-frame",
        ...(options.initClosed ? ["closed"] : []),
        ...(options.initMini ? ["minimised"] : []),
        ...(options.initFloat || options.initFloatPos ? ["floating"] : [])
    ];
    const unique = [...new Set(classes)].join(" ");
    const patched = /\sclass\s*=\s*(?:"[^"]*"|'[^']*')/i.test(raw)
        ? raw.replace(/\sclass\s*=\s*(?:"[^"]*"|'[^']*')/i, ` class="${unique}"`)
        : raw.replace(/>$/, ` class="${unique}">`);

    return patched.replace(/>$/, ` data-kc-static-window="${id}">`);
}

function renderWindow(html: string, windowConfig: windowDef): { html: string; launcher: string } | null {
    const { selector, options } = windowConfig;
    const tags = scanTags(html);
    const range = findRange(tags, selector);
    if (!range) return null;
    if (attribute(range.opening.raw, "data-kc-static-window")) return null;

    const id = options.id?.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!id) throw new Error("Static window requires a stable id: " + selector);

    const title = options.title ?? "Window";
    const frameOpen = appendStaticClass(range.opening.raw, id, options);
    const header = renderStaticWindowHead(id, title, options);
    const bodyOpen = `<div id="${id}-body" class="window-body"><div class="window-content-root" data-window-content-root="true">`;
    const inner = html.slice(range.opening.end, range.closing.start);
    const windowMarkup = frameOpen + header + bodyOpen + inner + "</div></div>" + range.closing.raw;
    const updatedHtml = html.slice(0, range.opening.start) + windowMarkup + html.slice(range.closing.end);

    const launcher = renderStaticLauncher(
        id,
        title,
        options.launcherSrc ?? "/images/file.svg",
        options.closedLnchrDis ?? "inline-block"
    );
    return { html: updatedHtml, launcher };
}

/** Transform only windows that are present on this page, preserving nested frames. */
export function renderWindowsInHtml(html: string, data: MainJson): string {
    const launchers: string[] = [];
    let output = html;

    for (const definition of Object.values(data.windows ?? {})) {
        const transformed = renderWindow(output, definition);
        if (!transformed) continue;
        output = transformed.html;
        launchers.push(transformed.launcher);
    }

    return output.replace(/<\/body>/i, launchers.join("\n") + "\n</body>");
}
