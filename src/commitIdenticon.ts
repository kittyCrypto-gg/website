export type TriangleColourPick = Readonly<{
    arms: readonly [string, string, string];
    background: string;
    bgIndex: number;
}>;

export type TriangleConfig = Readonly<{
    depth: number;
}>;

/**
 * @param str - Input string to hash.
 * @returns {Promise<number[]>} A promise that resolves to an array of bytes representing the SHA-256 hash of the input string. The function uses the Web Crypto API to perform the hashing operation, encoding the input string as UTF-8 before hashing and returning the result as an array of unsigned 8-bit integers.
 */
async function hashString(str: string): Promise<number[]> {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    return Array.from(new Uint8Array(hashBuffer));
}

/**
 * @param hue - Hue in degrees.
 * @param sat - Saturation percentage.
 * @param light - Lightness percentage.
 * @returns {string} An HSL color string in the format "hsl(hue, saturation%, lightness%)". The function takes hue, saturation, and lightness values as input and constructs a valid HSL color string that can be used in CSS or SVG styling. The hue value is normalized to ensure it falls within the 0-359 degree range, while saturation and lightness are expressed as percentages.
 */
function getHSL(hue: number, sat: number = 80, light: number = 60): string {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

/**
 * @param seed - Seed value derived from the hash.
 * @param hash - SHA-256 hash bytes.
 * @returns {TriangleColourPick} An object containing the colors for the arms of the triangle, the background color, and the index of the background color. The colors are derived from the seed and hash to ensure distinct and visually appealing combinations.
 */
function pickDistinctColours(seed: number, hash: ReadonlyArray<number>): TriangleColourPick {
    const baseHue = seed % 360;
    const arms: [string, string, string] = [
        getHSL(baseHue),
        getHSL(baseHue + 120),
        getHSL(baseHue + 240)
    ];

    const bgIndex = hash[5] % 3;
    const bgHue = (baseHue + 120 * bgIndex) % 360;
    const background = getHSL(bgHue, 40, 85);

    return { arms, background, bgIndex };
}

/**
 * @param hash - SHA-256 hash bytes.
 * @returns {TriangleConfig} Configuration for the triangle, including recursion depth.
 */
function getTriangleConfig(hash: ReadonlyArray<number>): TriangleConfig {
    const depth = 2 + (hash[6] % 4); // 2–5 recursion depth
    return { depth };
}

/**
 * @param {SVGSVGElement} svg - Target SVG element to append triangles into.
 * @param {number} x - Base-left X coordinate.
 * @param {number} y - Base-left Y coordinate.
 * @param {number} size - Triangle side length.
 * @param {number} depth - Remaining recursion depth.
 * @param {ReadonlyArray<string>} colours - Fill colours to cycle through.
 * @param {number} level - Current recursion level.
 * @returns {void} This function does not return a value; it recursively draws a Sierpinski triangle pattern onto the provided SVG element. At each recursion level, it calculates the positions and sizes of the triangles to be drawn, using the specified colors in a cyclic manner. When the recursion depth reaches zero, it creates a polygon element representing a triangle and appends it to the SVG. The function effectively builds a complex fractal pattern by subdividing the triangle into smaller triangles at each level of recursion.
 */
function drawSierpinskiTriangle(
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

    drawSierpinskiTriangle(svg, x, y, half, depth - 1, colours, level + 1);
    drawSierpinskiTriangle(svg, x + half, y, half, depth - 1, colours, level + 1);
    drawSierpinskiTriangle(svg, x + half / 2, y - height, half, depth - 1, colours, level + 1);
}

/**
 * @param {string} username - Identifier used to deterministically generate the identicon.
 * @param {number} size - SVG size (px).
 * @returns {Promise<SVGSVGElement>} A promise that resolves to an SVG element representing the generated identicon. The identicon is created by hashing the input username to derive a seed for color selection and triangle configuration, and then recursively drawing a Sierpinski triangle pattern with distinct colors. The resulting SVG is styled with rounded corners and a background color, making it suitable for use as a user avatar or visual identifier.
 */
export async function drawTriangularIdenticon(username: string, size: number = 128): Promise<SVGSVGElement> {
    const hash = await hashString(username);
    const seed = hash[0] + hash[1] * 256;
    const { arms, background } = pickDistinctColours(seed, hash);
    const triangleConfig = getTriangleConfig(hash);

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

    drawSierpinskiTriangle(svg, triangleX, baseY, triangleSize, triangleConfig.depth, arms);

    return svg;
}