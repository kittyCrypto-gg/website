import { hashString } from "./helpers.ts";

export type TriangleColourPick = Readonly<{
    arms: readonly [string, string, string];
    background: string;
    bgIndex: number;
}>;

export type TriangleConfig = Readonly<{
    depth: number;
}>;

/**
 * Tiny hsl helper.
 * @param {number} hue
 * @param {number} sat
 * @param {number} light
 * @returns {string}
 */
function hsl(hue: number, sat: number = 80, light: number = 60): string {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

/**
 * Picks the triangle colours from the hash-ish seed stuff.
 * Also picks which arm hue becomes the bg.
 * @param {number} seed
 * @param {ReadonlyArray<number>} hash
 * @returns {TriangleColourPick}
 */
function pickCols(seed: number, hash: ReadonlyArray<number>): TriangleColourPick {
    const baseHue = seed % 360;
    const arms: [string, string, string] = [
        hsl(baseHue),
        hsl(baseHue + 120),
        hsl(baseHue + 240)
    ];

    const bgIndex = hash[5] % 3;
    const bgHue = (baseHue + 120 * bgIndex) % 360;
    const background = hsl(bgHue, 40, 85);

    return { arms, background, bgIndex };
}

/**
 * Gets the triangle recursion depth from the hash.
 * Kept kinda small so it doesnt go feral.
 * @param {ReadonlyArray<number>} hash
 * @returns {TriangleConfig}
 */
function getCfg(hash: ReadonlyArray<number>): TriangleConfig {
    const depth = 2 + (hash[6] % 4);
    return { depth };
}

/**
 * Draws the recursive triangle bits into the svg.
 * when depth hits zero it finally draws one actual triangle, lol.
 * @param {SVGSVGElement} svg
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {number} depth
 * @param {ReadonlyArray<string>} colours
 * @param {number} level
 * @returns {void}
 */
function drawTri(
    svg: SVGSVGElement,
    x: number,
    y: number,
    size: number,
    depth: number,
    colours: ReadonlyArray<string>,
    level: number = 0
): void {
    if (depth === 0) {
        const triangle = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        const height = size * Math.sqrt(3) / 2;
        const points = [
            `${x},${y}`,
            `${x + size},${y}`,
            `${x + size / 2},${y - height}`
        ].join(" ");

        triangle.setAttribute("points", points);
        triangle.setAttribute("fill", colours[level % colours.length]);
        svg.appendChild(triangle);
        return;
    }

    const half = size / 2;
    const height = half * Math.sqrt(3) / 2;

    drawTri(svg, x, y, half, depth - 1, colours, level + 1);
    drawTri(svg, x + half, y, half, depth - 1, colours, level + 1);
    drawTri(svg, x + half / 2, y - height, half, depth - 1, colours, level + 1);
}

/**
 * Makes the triangle identicon svg for a username.
 * Same input should always spit out the same little fractal critter.
 * @param {string} username
 * @param {number} size
 * @returns {Promise<SVGSVGElement>}
 */
export async function drawTriangularIdenticon(username: string, size: number = 128): Promise<SVGSVGElement> {
    const hash = await hashString(username);
    const seed = hash[0] + hash[1] * 256;
    const { arms, background } = pickCols(seed, hash);
    const triangleConfig = getCfg(hash);

    const xmlns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(xmlns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", `${size}`);
    svg.setAttribute("height", `${size}`);
    svg.style.borderRadius = "8px";
    svg.style.background = background;

    const baseY = size * 0.9;
    const triangleSize = size * 0.8;
    const triangleX = (size - triangleSize) / 2;

    drawTri(svg, triangleX, baseY, triangleSize, triangleConfig.depth, arms);

    return svg;
}