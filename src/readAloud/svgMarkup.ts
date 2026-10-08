const cache = new Map<string, string>();

export async function getSvgMarkup(path: string): Promise<string> {
    const cached = cache.get(path);
    if (cached) return cached;

    const response = await fetch(path, { cache: "force-cache" });
    if (!response.ok) {
        throw new Error(`Failed to load SVG: ${path}`);
    }

    const markup = await response.text();
    cache.set(path, markup);
    return markup;
}
