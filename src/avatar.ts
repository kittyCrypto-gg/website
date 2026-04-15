import { hashString } from "./helpers.ts";

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
 * Picks the arm colours + bg from the hash bits.
 * not super fancy, just deterministic.
 * @param {number} seed
 * @param {ReadonlyArray<number>} hash
 * @returns {ColourPick}
 */
function pickCols(seed: number, hash: ReadonlyArray<number>): ColourPick {
    const baseHue = seed % 360;

    const arms: [string, string, string] = [
        hsl(baseHue),
        hsl(baseHue + 120),
        hsl(baseHue + 240)
    ];

    const bgIndex = hash[5] % 3;
    const bgHue = (baseHue + 120 * bgIndex) % 360;
    const background = hsl(bgHue, 40, 85);

    return { arms, background };
}

/**
 * Derives the spiral params from the hash.
 * Enough variation without getting too cursed.
 * @param {ReadonlyArray<number>} hash
 * @returns {SpiralConfig}
 */
function getCfg(hash: ReadonlyArray<number>): SpiralConfig {
    const angleStep = 0.15 + (hash[2] % 70) / 200;
    const radiusStep = 1.0 + (hash[3] % 40) / 10;
    const steps = 60 + (hash[4] % 40);

    return { angleStep, radiusStep, steps };
}

/**
 * Builds one spiral arm path.
 * @param {number} angleOffset
 * @param {SpiralConfig} spiralConfig
 * @param {number} size
 * @returns {string}
 */
function mkPath(angleOffset: number, spiralConfig: SpiralConfig, size: number): string {
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
 * Makes the spiral identicon svg for a username.
 * same input, same result, thats the whole point really.
 * @param {string} username
 * @param {number} size
 * @returns {Promise<SVGSVGElement>}
 */
export async function drawSpiralIdenticon(username: string, size: number = 128): Promise<SVGSVGElement> {
    const hash = await hashString(username);
    const seed = hash[0] + hash[1] * 256;
    const { arms, background } = pickCols(seed, hash);
    const spiralConfig = getCfg(hash);

    const xmlns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(xmlns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", `${size}`);
    svg.setAttribute("height", `${size}`);
    svg.style.borderRadius = "8px";
    svg.style.background = background;

    for (let i = 0; i < 3; i++) {
        const angleOffset = (2 * Math.PI / 3) * i;
        const pathData = mkPath(angleOffset, spiralConfig, size);

        const path = document.createElementNS(xmlns, "path");
        path.setAttribute("d", pathData);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", arms[i]);
        path.setAttribute("stroke-width", "5.2");
        svg.appendChild(path);
    }

    return svg;
}