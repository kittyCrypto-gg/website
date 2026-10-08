import type {
    WindowApiOptions,
    WindowButtonRole
} from "./types.ts";

export function shouldShowButton(
    options: WindowApiOptions,
    role: WindowButtonRole
): boolean {
    if (role === "close") {
        return options.showCloseBttn ?? true;
    }

    if (role === "minimise") {
        return options.showMiniBttn ?? true;
    }

    return options.showFloatBttn ?? true;
}

function createControlIcon(
    role: WindowButtonRole
): SVGSVGElement {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");

    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("width", "1em");
    svg.setAttribute("height", "1em");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    const circle = document.createElementNS(namespace, "circle");
    circle.setAttribute("cx", "6");
    circle.setAttribute("cy", "6");
    circle.setAttribute("r", "5");
    circle.style.fill = `var(--window-btn-${role}-fill)`;

    svg.appendChild(circle);
    return svg;
}

export function createControlButton(
    windowId: string,
    role: WindowButtonRole,
    label: string
): HTMLButtonElement {
    const button = document.createElement("button");
    const classes = ["btn", role];

    if (role === "minimise") {
        classes.push("toggle-view");
    }

    button.type = "button";
    button.id = `${windowId}-btn-${role}`;
    button.className = classes.join(" ");
    button.dataset.windowRole = role;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(createControlIcon(role));

    return button;
}
