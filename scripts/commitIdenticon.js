async function hashString(str) {
    const msgBuffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    return Array.from(new Uint8Array(hashBuffer));
}

function getHSL(hue, sat = 80, light = 60) {
    return `hsl(${hue % 360}, ${sat}%, ${light}%)`;
}

function pickDistinctColours(seed, hash) {
    const baseHue = seed % 360;
    const arms = [
        getHSL(baseHue),
        getHSL(baseHue + 120),
        getHSL(baseHue + 240)
    ];

    const bgIndex = hash[5] % 3;
    const bgHue = (baseHue + 120 * bgIndex) % 360;
    const background = getHSL(bgHue, 40, 85);

    return { arms, background, bgIndex };
}

function getTriangleConfig(hash) {
    const depth = 2 + (hash[6] % 4); // 2–5 recursion depth
    return { depth };
}

function drawSierpinskiTriangle(svg, x, y, size, depth, colours, level = 0) {
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

async function drawTriangularIdenticon(username, size = 128) {
    const hash = await hashString(username);
    const seed = hash[0] + hash[1] * 256;
    const { arms, background } = pickDistinctColours(seed, hash);
    const triangleConfig = getTriangleConfig(hash);

    const xmlns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(xmlns, "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", size);
    svg.setAttribute("height", size);
    svg.style.borderRadius = "8px";
    svg.style.background = background;

    const baseY = size * 0.9;
    const triangleSize = size * 0.8;
    const triangleX = (size - triangleSize) / 2;

    drawSierpinskiTriangle(svg, triangleX, baseY, triangleSize, triangleConfig.depth, arms);

    return svg;
}

export { drawTriangularIdenticon };  