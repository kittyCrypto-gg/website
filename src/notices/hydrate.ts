import { rndNtcs } from "./render.ts";
import type { Ntc, OnToggle } from "./types.ts";

function isActiveNode(node: unknown): boolean {
    return node instanceof HTMLAnchorElement ||
        node instanceof HTMLButtonElement ||
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement ||
        node instanceof HTMLLabelElement;
}

function setContentBody(content: HTMLElement, show: boolean): void {
    const meta = content.querySelector<HTMLElement>(".ntcs-card__meta");
    const text = content.querySelector<HTMLElement>(".ntcs-card__txt");

    if (meta) meta.style.display = show ? "" : "none";
    if (text) text.style.display = show ? "" : "none";
}

function setContentState(
    content: HTMLElement,
    expanded: boolean,
    toggle: HTMLElement,
    arrow: HTMLElement | null
): void {
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (arrow) arrow.textContent = expanded ? "🔽" : "▶️";

    if (expanded) {
        content.style.display = "block";
        content.classList.remove("content-collapsed");
        content.classList.add("content-expanded");
        return;
    }

    content.classList.remove("content-expanded");
    content.classList.add("content-collapsed");
}

function initContentState(
    content: HTMLElement,
    toggle: HTMLElement,
    arrow: HTMLElement | null
): void {
    setContentBody(content, false);
    content.style.display = "none";
    content.style.maxHeight = "0px";
    setContentState(content, false, toggle, arrow);
}

function reflow(content: HTMLElement): void {
    void content.offsetHeight;
}

export function hydNtcs(
    root: HTMLElement,
    onToggle?: OnToggle
): void {
    const cards = Array.from(
        root.querySelectorAll<HTMLElement>(".ntcs-card")
    );

    for (const card of cards) {
        const toggle = card.querySelector(".ntcs-card__tgl");
        const content = card.querySelector<HTMLElement>(".ntcs-card__cnt");
        const arrow = card.querySelector(".ntcs-card__arr");

        if (!(toggle instanceof HTMLElement)) continue;
        if (!(content instanceof HTMLElement)) continue;

        const arrowEl = arrow instanceof HTMLElement ? arrow : null;
        initContentState(content, toggle, arrowEl);

        const setExpanded = (expanded: boolean): void => {
            if (expanded) {
                content.style.display = "block";
                setContentBody(content, true);
                content.style.maxHeight = "0px";
                setContentState(content, true, toggle, arrowEl);
                reflow(content);
                content.style.maxHeight = String(content.scrollHeight) + "px";
                onToggle?.();
                return;
            }

            content.style.maxHeight = String(content.scrollHeight) + "px";
            reflow(content);
            setContentBody(content, false);
            setContentState(content, false, toggle, arrowEl);
            content.style.maxHeight = "0px";
            onToggle?.();
        };

        const toggleExpanded = (): void => {
            setExpanded(!content.classList.contains("content-expanded"));
        };

        card.addEventListener("click", (event) => {
            const hitControl = event.composedPath().find(isActiveNode);
            if (hitControl) return;
            toggleExpanded();
        });

        toggle.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();

            const hitControl = event.composedPath().find(isActiveNode);
            if (hitControl) return;
            toggleExpanded();
        });

        content.addEventListener("transitionend", (event) => {
            if (event.target !== content) return;
            if (event.propertyName !== "max-height") return;

            if (content.classList.contains("content-collapsed")) {
                content.style.display = "none";
                content.style.maxHeight = "0px";
                onToggle?.();
                return;
            }

            content.style.display = "block";
            setContentBody(content, true);
            content.style.maxHeight = String(content.scrollHeight) + "px";
            onToggle?.();
        });
    }
}

export function popNtcs(
    root: HTMLElement,
    notices: readonly Ntc[],
    onToggle?: OnToggle
): void {
    root.innerHTML = rndNtcs(notices);
    hydNtcs(root, onToggle);
}
