export type ColourPick = Readonly<{
    arms: readonly [string, string, string];
    background: string;
}>;

export type SpiralConfig = Readonly<{
    angleStep: number;
    radiusStep: number;
    steps: number;
}>;

/**
 * @param {string} str - Input string to hash.
 * @returns {Promise<number[]>} - Promise resolving to an array of bytes representing the SHA-256 hash of the input string.
 */
async function hashString(str: string): Promise<number[]> {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    return Array.from(new Uint8Array(hashBuffer));
}

/**
 * @param {number} hue - Hue in degrees.
 * @param {number} sat - Saturation percentage.
 * @param {number} light - Lightness percentage.
 * @returns {string} - HSL color string.
 */
function getHSL(hue: number, sat: number = 80, light: number = 60): string {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

/**
 * @param {number} seed - Seed value derived from the hash.
 * @param {ReadonlyArray<number>} hash - SHA-256 hash bytes.
 * @returns {ColourPick} - Object containing the colors for the spiral arms and background.
 */
function pickDistinctColours(seed: number, hash: ReadonlyArray<number>): ColourPick {
    const baseHue = seed % 360;

    // Triadic colours
    const arms: [string, string, string] = [
        getHSL(baseHue),       // Arm 1
        getHSL(baseHue + 120), // Arm 2
        getHSL(baseHue + 240)  // Arm 3
    ];

    const bgIndex = hash[5] % 3;
    const bgHue = (baseHue + 120 * bgIndex) % 360;
    const background = getHSL(bgHue, 40, 85); // pastel bg

    return { arms, background };
}

/**
 * @param {ReadonlyArray<number>} hash - SHA-256 hash bytes.
 * @returns {SpiralConfig} - Configuration parameters for the spiral generation, derived from the hash to ensure uniqueness.
 */
function getSpiralConfig(hash: ReadonlyArray<number>): SpiralConfig {
    const angleStep = 0.15 + (hash[2] % 70) / 200; // 0.15–0.5
    const radiusStep = 1.0 + (hash[3] % 40) / 10;  // 1.0–5.0
    const steps = 60 + (hash[4] % 40);             // 60–100
    return { angleStep, radiusStep, steps };
}

/**
 * @param {number} angleOffset - Angular offset (radians) for the spiral arm.
 * @param {SpiralConfig} spiralConfig - Spiral parameters.
 * @param {number} size - SVG size (px).
 * @returns {string} - SVG path data string representing the spiral arm.
 */
function createSpiralPath(angleOffset: number, spiralConfig: SpiralConfig, size: number): string {
    const { angleStep, radiusStep, steps } = spiralConfig;
    const centre = size / 2;

    let d = "";
    for (let t = 0; t < steps; t++) {
        const theta = t * angleStep + angleOffset;
        const r = t * radiusStep;
        const x = centre + r * Math.cos(theta);
        const y = centre + r * Math.sin(theta);
        d += t === 0 ? `M${x},${y}` : ` L${x},${y}`;
    }

    return d;
}

/**
 * @param {string} username - Identifier used to deterministically generate the identicon.
 * @param {number} size - SVG size (px).
 * @returns {Promise<SVGSVGElement>} - Promise resolving to the generated identicon as an SVG element.
 */
export async function drawSpiralIdenticon(username: string, size: number = 128): Promise<SVGSVGElement> {
    const hash = await hashString(username);
    const seed = hash[0] + hash[1] * 256;
    const { arms, background } = pickDistinctColours(seed, hash);
    const spiralConfig = getSpiralConfig(hash);

    const xmlns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(xmlns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", `${size}`);
    svg.setAttribute("height", `${size}`);
    svg.style.borderRadius = "8px";
    svg.style.background = background;

    for (let i = 0; i < 3; i++) {
        const angleOffset = (2 * Math.PI / 3) * i;
        const pathData = createSpiralPath(angleOffset, spiralConfig, size);

        const path = document.createElementNS(xmlns, "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", arms[i]);
        path.setAttribute("stroke-width", "5.2");
        svg.appendChild(path);
    }

    return svg;
}