/**
 * Cache only the repeating SVG lattice. The native filter, backdrop-filter,
 * blend mode and opacity still run in their original order in effects.css.
 * This is deliberately not a snapshot of the DOM or a backdrop cache.
 */
const PROPERTY = "--effect-crt-phosphor-image";
const SOURCE = "/images/trinitron.svg";
const MAX_TEXTURES = 4;
const MAX_TILE_SIDE = 256;

type Tile = Readonly<{ width: number; height: number; key: string }>;
const textures = new Map<string, string>();
let active = false;
let installed = false;
let scheduled = false;
let generation = 0;
let appliedKey = "";
let source: Promise<HTMLImageElement> | null = null;
let resolutionQuery: MediaQueryList | null = null;

function clearTexture(): void {
    appliedKey = "";
    document.documentElement.style.removeProperty(PROPERTY);
}

function sourceImage(): Promise<HTMLImageElement> {
    if (source) return source;
    const image = new Image();
    image.src = SOURCE;
    source = image.decode().then(() => image).catch((error: unknown) => {
        source = null;
        throw error;
    });
    return source;
}

function tileSize(): Tile | null {
    const style = getComputedStyle(document.body, "::before");
    const parts = style.backgroundSize.split(/\s+/);
    if (parts.length !== 2 || !parts.every((part) => /^\d+(?:\.\d+)?px$/.test(part))) return null;
    const width = Number.parseFloat(parts[0]!) * devicePixelRatio;
    const height = Number.parseFloat(parts[1]!) * devicePixelRatio;
    // Fractional physical pitches cannot be represented by a repeating bitmap
    // without changing its sampling. Keep the SVG at those zoom levels.
    if (!Number.isInteger(width) || !Number.isInteger(height)) return null;
    if (width < 1 || height < 1 || width > MAX_TILE_SIDE || height > MAX_TILE_SIDE) return null;
    return { width, height, key: `${width}:${height}:${devicePixelRatio}` };
}

async function rasterise(tile: Tile): Promise<string> {
    const image = await sourceImage();
    const canvas = document.createElement("canvas");
    canvas.width = tile.width;
    canvas.height = tile.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas2D unavailable");
    context.drawImage(image, 0, 0, tile.width, tile.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("PNG encoding unavailable")));
    });
    const url = URL.createObjectURL(blob);
    try {
        const decoded = new Image();
        decoded.src = url;
        await decoded.decode();
        return url;
    } catch (error: unknown) {
        URL.revokeObjectURL(url);
        throw error;
    }
}

function remember(key: string, url: string): void {
    const previous = textures.get(key);
    if (previous && previous !== url) URL.revokeObjectURL(previous);
    textures.delete(key);
    textures.set(key, url);
    while (textures.size > MAX_TEXTURES) {
        const oldest = textures.entries().next().value;
        if (!oldest) return;
        textures.delete(oldest[0]);
        URL.revokeObjectURL(oldest[1]);
    }
}

function discardUncached(key: string, url: string): void {
    if (textures.get(key) !== url) URL.revokeObjectURL(url);
}

async function prepare(): Promise<void> {
    scheduled = false;
    if (!active) return;
    const tile = tileSize();
    if (!tile) return clearTexture();
    if (tile.key === appliedKey) return;
    const expected = generation;
    try {
        const url = textures.get(tile.key) ?? await rasterise(tile);
        if (expected !== generation || !active || tileSize()?.key !== tile.key) return discardUncached(tile.key, url);
        remember(tile.key, url);
        appliedKey = tile.key;
        document.documentElement.style.setProperty(PROPERTY, `url("${url}")`);
    } catch {
        // Decoding, CSP or canvas restrictions leave the native SVG intact.
        if (expected === generation) clearTexture();
    }
}

function schedule(): void {
    if (!active || scheduled) return;
    scheduled = true;
    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(() => { void prepare(); }, { timeout: 1000 });
        return;
    }
    globalThis.setTimeout(() => { void prepare(); }, 0);
}

function invalidate(): void {
    generation += 1;
    clearTexture();
    schedule();
}

function watchResolution(): void {
    resolutionQuery?.removeEventListener("change", onResolutionChange);
    resolutionQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    resolutionQuery.addEventListener("change", onResolutionChange);
}

function onResolutionChange(): void {
    invalidate();
    watchResolution();
}

function install(): void {
    if (installed) return;
    installed = true;
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", invalidate, { passive: true });
    watchResolution();
}

export function updatePhosphorTexture(enabled: boolean): void {
    active = enabled;
    install();
    if (!enabled) {
        generation += 1;
        clearTexture();
        return;
    }
    schedule();
}
