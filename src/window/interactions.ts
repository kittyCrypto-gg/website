import { clampFramePosition, parsePx } from "./geometry.ts";

export type FramePosition = Readonly<{
    left: number;
    top: number;
}>;

export type FrameSize = Readonly<{
    width: number;
    height: number;
}>;

export function wireFrameDrag(
    header: HTMLDivElement,
    frame: HTMLElement,
    canDrag: () => boolean,
    onStart: () => void,
    onMove: (position: FramePosition) => void,
    onEnd: () => void
): () => void {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) return;
        if (!canDrag()) return;

        const target = event.target;
        if (target instanceof HTMLElement && target.closest("button")) return;

        const rect = frame.getBoundingClientRect();
        dragging = true;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;

        header.classList.add("is-dragging");
        onStart();
        event.preventDefault();
        event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent): void => {
        if (!dragging) return;

        onMove(
            clampFramePosition(
                frame,
                event.clientX - offsetX,
                event.clientY - offsetY
            )
        );
    };

    const onPointerUp = (): void => {
        if (!dragging) return;

        dragging = false;
        header.classList.remove("is-dragging");
        onEnd();
    };

    header.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);

    return (): void => {
        header.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
    };
}

export function wireFrameFocus(
    frame: HTMLElement,
    shouldFocus: () => boolean,
    onFocus: () => void
): () => void {
    const onPointerDown = (): void => {
        if (!shouldFocus()) return;
        onFocus();
    };

    frame.addEventListener("pointerdown", onPointerDown);

    return (): void => {
        frame.removeEventListener("pointerdown", onPointerDown);
    };
}

export function wireViewportResize(
    frame: HTMLElement,
    shouldClamp: () => boolean,
    readPosition: () => Readonly<{ x: string; y: string }>,
    onMove: (position: FramePosition) => void
): () => void {
    const onResize = (): void => {
        if (!shouldClamp()) return;

        const position = readPosition();
        onMove(
            clampFramePosition(
                frame,
                parsePx(position.x, 10),
                parsePx(position.y, 10)
            )
        );
    };

    window.addEventListener("resize", onResize);

    return (): void => {
        window.removeEventListener("resize", onResize);
    };
}

export function observeFrameResize(
    frame: HTMLElement,
    shouldCapture: () => boolean,
    onResize: (size: FrameSize) => void
): ResizeObserver | null {
    if (typeof ResizeObserver === "undefined") return null;

    const observer = new ResizeObserver(() => {
        if (!shouldCapture()) return;

        onResize({
            width: frame.offsetWidth,
            height: frame.offsetHeight
        });
    });

    observer.observe(frame);
    return observer;
}
