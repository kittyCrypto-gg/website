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
 * @param str - Input string to hash.
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
 */
function getHSL(hue: number, sat: number = 80, light: number = 60): string {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

/**
 * @param seed - Seed value derived from the hash.
 * @param hash - SHA-256 hash bytes.
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
 * @param hash - SHA-256 hash bytes.
 */
function getSpiralConfig(hash: ReadonlyArray<number>): SpiralConfig {
    const angleStep = 0.15 + (hash[2] % 70) / 200; // 0.15–0.5
    const radiusStep = 1.0 + (hash[3] % 40) / 10;  // 1.0–5.0
    const steps = 60 + (hash[4] % 40);             // 60–100
    return { angleStep, radiusStep, steps };
}

/**
 * @param angleOffset - Angular offset (radians) for the spiral arm.
 * @param spiralConfig - Spiral parameters.
 * @param size - SVG size (px).
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
 * @param username - Identifier used to deterministically generate the identicon.
 * @param size - SVG size (px).
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