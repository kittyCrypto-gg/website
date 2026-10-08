export type Point = Readonly<{
    left: number;
    top: number;
}>;

export function parsePx(
    value: string,
    fallback: number
): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function clampFramePosition(
    frame: HTMLElement | null,
    left: number,
    top: number
): Point {
    if (!frame) return { left, top };

    const frameWidth = Math.max(
        0,
        Math.min(frame.offsetWidth, window.innerWidth)
    );
    const frameHeight = Math.max(
        0,
        Math.min(frame.offsetHeight, window.innerHeight)
    );

    return {
        left: Math.min(
            Math.max(0, left),
            Math.max(0, window.innerWidth - frameWidth)
        ),
        top: Math.min(
            Math.max(0, top),
            Math.max(0, window.innerHeight - frameHeight)
        )
    };
}

export function clampLauncherPosition(
    launcher: HTMLElement | null,
    fallbackSize: number,
    left: number,
    top: number
): Point {
    const width = Math.max(
        0,
        Math.min(
            launcher?.offsetWidth || fallbackSize,
            window.innerWidth
        )
    );
    const height = Math.max(
        0,
        Math.min(
            launcher?.offsetHeight || fallbackSize,
            window.innerHeight
        )
    );

    return {
        left: Math.min(
            Math.max(0, left),
            Math.max(0, window.innerWidth - width)
        ),
        top: Math.min(
            Math.max(0, top),
            Math.max(0, window.innerHeight - height)
        )
    };
}
